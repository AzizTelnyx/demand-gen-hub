'use client';

import { type ReactNode, useRef, useEffect } from 'react';
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react';
import { useArtifacts, type ProgressStep } from './ArtifactContext';

// Module-level taskId that persists across messages
let currentTaskId: string | null = null;

// Callback for thread title updates (set by page)
let onThreadTitle: ((title: string) => void) | null = null;

export function resetTaskId() {
  currentTaskId = null;
}

export function getTaskId() {
  return currentTaskId;
}

export function setOnThreadTitle(cb: ((title: string) => void) | null) {
  onThreadTitle = cb;
}

/* ── Thread message persistence ────────────────────────── */

interface SavedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function loadThreadMessages(threadId: string): SavedMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(`orch-msgs-${threadId}`) || '[]');
  } catch { return []; }
}

function saveThreadMessages(threadId: string, messages: SavedMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`orch-msgs-${threadId}`, JSON.stringify(messages));
  } catch { /* quota exceeded — ignore */ }
}

function loadThreadTaskId(threadId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`orch-task-${threadId}`) || null;
}

function saveThreadTaskId(threadId: string, taskId: string | null) {
  if (typeof window === 'undefined') return;
  if (taskId) localStorage.setItem(`orch-task-${threadId}`, taskId);
  else localStorage.removeItem(`orch-task-${threadId}`);
}

/* ── Provider ──────────────────────────────────────────── */

interface Props {
  children: ReactNode;
  threadId?: string | null;
}

export function OrchestrationRuntimeProvider({ children, threadId }: Props) {
  const { setArtifacts, setRecommendations, setPhase, setSteps } = useArtifacts();
  const artifactCallbacks = useRef({ setArtifacts, setRecommendations, setPhase, setSteps });
  artifactCallbacks.current = { setArtifacts, setRecommendations, setPhase, setSteps };

  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  // Track if this is the first user message (for auto-titling)
  const isFirstMessage = useRef(true);

  // Restore taskId for this thread
  useEffect(() => {
    if (threadId) {
      currentTaskId = loadThreadTaskId(threadId);
    }
  }, [threadId]);

  // Load saved messages for initialMessages
  const savedMessages = threadId ? loadThreadMessages(threadId) : [];
  const initialMessages = savedMessages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  if (savedMessages.length > 0) {
    isFirstMessage.current = false;
  }

  const adapter: ChatModelAdapter = {
    async *run({ messages, abortSignal }) {
      const lastMsg = messages[messages.length - 1];
      const userText = lastMsg.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');

      // Auto-title thread from first message
      if (isFirstMessage.current && onThreadTitle) {
        const title = userText.length > 50 ? userText.slice(0, 47) + '...' : userText;
        onThreadTitle(title);
        isFirstMessage.current = false;
      }

      const history = messages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join(''),
      }));

      const res = await fetch('/api/orchestrate?stream=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history,
          taskId: currentTaskId || undefined,
        }),
        signal: abortSignal,
      });

      if (!res.body) {
        const data = await res.json();
        if (data.taskId) {
          currentTaskId = data.taskId;
          if (threadIdRef.current) saveThreadTaskId(threadIdRef.current, data.taskId);
        }
        const text = data.result?.answer || data.result?.summary || JSON.stringify(data.result);
        
        // Save to localStorage
        if (threadIdRef.current) {
          const prev = loadThreadMessages(threadIdRef.current);
          prev.push({ role: 'user', content: userText });
          prev.push({ role: 'assistant', content: text });
          saveThreadMessages(threadIdRef.current, prev);
        }

        yield {
          content: [{ type: 'text' as const, text }],
        };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      let stepCounter = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw);
            switch (event.type) {
              case 'chunk':
                text += event.content;
                break;
              case 'step': {
                stepCounter++;
                const stepId = `step_${stepCounter}`;
                artifactCallbacks.current.setSteps((prev: ProgressStep[]) => {
                  const updated = prev.map(s =>
                    s.status === 'running' ? { ...s, status: 'done' as const } : s
                  );
                  return [...updated, {
                    id: stepId,
                    label: event.content.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, ''),
                    status: 'running' as const,
                    timestamp: Date.now(),
                  }];
                });
                break;
              }
              case 'artifact':
                artifactCallbacks.current.setArtifacts((prev: any[]) => [
                  ...prev,
                  ...(Array.isArray(event.data) ? event.data : [event.data]),
                ]);
                break;
              case 'recommendations':
                artifactCallbacks.current.setRecommendations((prev: any[]) => [
                  ...prev,
                  ...event.data.map((r: any, i: number) => ({
                    ...r,
                    id: r.id || `rec_${Date.now()}_${i}`,
                    status: r.status || 'pending',
                  })),
                ]);
                break;
              case 'phase':
                artifactCallbacks.current.setPhase(event.data);
                break;
              case 'done':
                if (event.taskId) {
                  currentTaskId = event.taskId;
                  if (threadIdRef.current) saveThreadTaskId(threadIdRef.current, event.taskId);
                }
                artifactCallbacks.current.setSteps((prev: ProgressStep[]) =>
                  prev.map(s => s.status === 'running' ? { ...s, status: 'done' as const } : s)
                );
                if (event.result?.answer) text = event.result.answer;
                else if (event.result?.summary && !text.includes(event.result.summary))
                  text += event.result.summary;
                break;
            }
          } catch {
            /* skip malformed */
          }
        }

        yield {
          content: [{ type: 'text' as const, text }],
        };
      }

      // Final yield
      if (!text.trim()) {
        text = 'Request completed but no response was generated. Try rephrasing your request.';
      }
      yield {
        content: [{ type: 'text' as const, text }],
      };

      // Save to localStorage after stream completes
      if (threadIdRef.current) {
        const prev = loadThreadMessages(threadIdRef.current);
        prev.push({ role: 'user', content: userText });
        prev.push({ role: 'assistant', content: text });
        saveThreadMessages(threadIdRef.current, prev);
      }
    },
  };

  const runtime = useLocalRuntime(adapter, {
    initialMessages: initialMessages.length > 0 ? initialMessages : undefined,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
