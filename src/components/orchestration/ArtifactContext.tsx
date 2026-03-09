'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  timestamp?: number;
}

export interface ArtifactState {
  artifacts: any[];
  recommendations: any[];
  phase: { current: string; completed: string[] } | null;
  steps: ProgressStep[];
}

interface ArtifactContextValue extends ArtifactState {
  setArtifacts: (a: any[] | ((prev: any[]) => any[])) => void;
  setRecommendations: (r: any[] | ((prev: any[]) => any[])) => void;
  setPhase: (p: { current: string; completed: string[] } | null) => void;
  setSteps: (s: ProgressStep[] | ((prev: ProgressStep[]) => ProgressStep[])) => void;
  reset: () => void;
}

const ArtifactContext = createContext<ArtifactContextValue | null>(null);

export function ArtifactProvider({ children }: { children: ReactNode }) {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [phase, setPhase] = useState<{ current: string; completed: string[] } | null>(null);
  const [steps, setSteps] = useState<ProgressStep[]>([]);

  const reset = useCallback(() => {
    setArtifacts([]);
    setRecommendations([]);
    setPhase(null);
    setSteps([]);
  }, []);

  return (
    <ArtifactContext.Provider value={{ artifacts, recommendations, phase, steps, setArtifacts, setRecommendations, setPhase, setSteps, reset }}>
      {children}
    </ArtifactContext.Provider>
  );
}

export function useArtifacts() {
  const ctx = useContext(ArtifactContext);
  if (!ctx) throw new Error('useArtifacts must be used within ArtifactProvider');
  return ctx;
}
