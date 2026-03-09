'use client';

import { useState } from 'react';
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, Send, Shield, Loader2, Copy, Check, ThumbsUp, ThumbsDown, ChevronRight } from 'lucide-react';

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <EmptyState />
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mb-4">
        <Sparkles size={24} className="text-[var(--accent)]" />
      </div>
      <h2 className="text-xl font-medium text-[var(--text-primary)] mb-2">What can I help with?</h2>
      <p className="text-sm text-[var(--text-muted)] mb-6 max-w-md">
        Launch campaigns, generate ad copy, analyze performance, research keywords, or ask anything about demand gen.
      </p>
      <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
        {[
          'Launch a Voice AI campaign for AMER',
          'Run a health check on all campaigns',
          'Generate ad copy for SIP Trunking',
          "What's our best performing campaign?",
        ].map((suggestion) => (
          <ThreadPrimitive.Suggestion
            key={suggestion}
            prompt={suggestion}
            autoSend
            className="text-left px-4 py-3 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            {suggestion}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-6 py-2 w-full">
      <div className="max-w-[75%] bg-[var(--accent)] text-white force-white rounded-2xl rounded-br-md px-4 py-2.5">
        <MessagePrimitive.Content
          components={{
            Text: ({ text }) => <p className="text-[15px] whitespace-pre-wrap">{text}</p>,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group flex items-start gap-2.5 px-6 py-2 w-full">
      <div className="w-7 h-7 rounded-full bg-[var(--bg-primary)] border border-[var(--border-primary)] flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles size={13} className="text-[var(--accent)]" />
      </div>
      <div className="flex-1 min-w-0">
        <MessagePrimitive.Content
          components={{
            Text: MarkdownText,
            Empty: LoadingIndicator,
          }}
        />
        <MessageActions />
      </div>
    </MessagePrimitive.Root>
  );
}

/* ── Message Actions (copy + feedback) ────────────────── */

function MessageActions() {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = () => {
    // Get text from the parent message bubble
    const el = document.querySelector('.group:hover .prose-chat');
    if (el) {
      navigator.clipboard.writeText(el.textContent || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-0.5 mt-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
        title="Copy"
      >
        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      </button>
      <button
        onClick={() => setFeedback(f => f === 'up' ? null : 'up')}
        className={`p-1 rounded transition-colors ${
          feedback === 'up' ? 'text-emerald-400 bg-emerald-900/20' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]'
        }`}
        title="Good response"
      >
        <ThumbsUp size={12} />
      </button>
      <button
        onClick={() => setFeedback(f => f === 'down' ? null : 'down')}
        className={`p-1 rounded transition-colors ${
          feedback === 'down' ? 'text-red-400 bg-red-900/20' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]'
        }`}
        title="Bad response"
      >
        <ThumbsDown size={12} />
      </button>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-[var(--text-muted)] py-1">
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}

// Strip common emojis from agent output
function stripEmojis(text: string): string {
  return text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').replace(/[^\S\n]{2,}/g, ' ').trim();
}

function MarkdownText({ text }: { text: string }) {
  const cleaned = stripEmojis(text);
  return (
    <div className="text-[15px] text-[var(--text-primary)] leading-relaxed prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleaned}</ReactMarkdown>
    </div>
  );
}

function Composer() {
  return (
    <div className="border-t border-[var(--border-primary)] bg-[var(--bg-card)] p-3">
      <div className="max-w-4xl mx-auto px-2">
        <ComposerPrimitive.Root className="flex items-end gap-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl px-3 py-2 focus-within:border-[var(--accent)] transition-colors">
          <ComposerPrimitive.Input
            autoFocus
            placeholder="Ask anything or run a task..."
            rows={1}
            className="flex-1 bg-transparent text-[15px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none resize-none min-h-[24px] max-h-[120px]"
          />
          <ComposerPrimitive.Send className="p-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white force-white transition-colors disabled:opacity-30 shrink-0">
            <Send size={14} />
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
        <div className="flex items-center gap-4 mt-1.5 px-1">
          <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 opacity-60">
            <Shield size={9} /> All writes require approval
          </span>
        </div>
      </div>
    </div>
  );
}
