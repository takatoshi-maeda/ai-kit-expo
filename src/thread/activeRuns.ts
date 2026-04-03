import type { AgentResponseLogEntry, LogEntry } from './types';

export type ActiveRunSnapshot = {
  logEntries: LogEntry[];
  agentName: string | null;
  isRunning: boolean;
  startedAt: number | null;
};

type Listener = (snapshot: ActiveRunSnapshot) => void;

type ActiveRun = ActiveRunSnapshot & {
  listeners: Set<Listener>;
};

const runs = new Map<string, ActiveRun>();

export function getActiveRun(sessionId: string): ActiveRunSnapshot | null {
  return runs.get(sessionId) ?? null;
}

export function createActiveRun(
  sessionId: string,
  logEntries: LogEntry[],
  agentName: string | null,
  startedAt: number | null,
): void {
  runs.set(sessionId, {
    logEntries,
    agentName,
    isRunning: true,
    startedAt,
    listeners: new Set(),
  });
}

export function rekeyActiveRun(oldId: string, newId: string): void {
  if (oldId === newId) return;
  const run = runs.get(oldId);
  if (!run) return;
  runs.delete(oldId);
  runs.set(newId, run);
  notify(run);
}

export function updateActiveRunAgentEntry(
  sessionId: string,
  entryId: string,
  updater: (entry: AgentResponseLogEntry) => AgentResponseLogEntry,
): void {
  const run = runs.get(sessionId);
  if (!run) return;
  run.logEntries = run.logEntries.map((entry) =>
    entry.id === entryId && entry.kind === 'agent-response' ? updater(entry) : entry,
  );
  notify(run);
}

export function setActiveRunAgentName(sessionId: string, name: string): void {
  const run = runs.get(sessionId);
  if (!run) return;
  run.agentName = name;
  notify(run);
}

export function completeActiveRun(sessionId: string): void {
  const run = runs.get(sessionId);
  if (!run) return;
  run.isRunning = false;
  notify(run);
  runs.delete(sessionId);
}

export function subscribeActiveRun(sessionId: string, listener: Listener): (() => void) | null {
  const run = runs.get(sessionId);
  if (!run) return null;
  run.listeners.add(listener);
  return () => {
    run.listeners.delete(listener);
  };
}

function notify(run: ActiveRun): void {
  const snapshot: ActiveRunSnapshot = {
    logEntries: run.logEntries,
    agentName: run.agentName,
    isRunning: run.isRunning,
    startedAt: run.startedAt,
  };
  for (const listener of run.listeners) {
    try {
      listener(snapshot);
    } catch {
      // ignore listener errors
    }
  }
}
