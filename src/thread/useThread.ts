import { useCallback, useEffect, useRef, useState } from 'react';

import { useAiKitClient } from '../runtime';
import {
  getActiveRun,
  subscribeActiveRun,
  type ActiveRunSnapshot,
} from './activeRuns';
import type {
  AgentResponseLogEntry,
  AgentTimelineItem,
  LogEntry,
  ResultItem,
  ThreadState,
  UseThreadOptions,
  UseThreadResult,
  UserCommandLogEntry,
  UserInputPart,
} from './types';

function createUniqueId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function decodeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function decodeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function decodeResultItems(raw: unknown): ResultItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: ResultItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = decodeString(record.id) ?? createUniqueId('result');
    const displayMode = record.displayMode === 'agent-only' ? 'agent-only' : undefined;
    if (record.kind === 'text') {
      items.push({
        id,
        kind: 'text',
        summary: decodeString(record.summary) ?? '',
        description: decodeString(record.description),
        displayMode,
      });
    } else if (record.kind === 'json') {
      items.push({ id, kind: 'json', data: record.data ?? null, displayMode });
    } else if (record.kind === 'table') {
      items.push({
        id,
        kind: 'table',
        headers: Array.isArray(record.headers)
          ? record.headers.filter((value): value is string => typeof value === 'string')
          : [],
        rows: Array.isArray(record.rows)
          ? record.rows.filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
          : [],
        displayMode,
      });
    } else if (record.kind === 'error') {
      items.push({ id, kind: 'error', message: decodeString(record.message) ?? '', displayMode });
    }
  }
  return items.length > 0 ? items : undefined;
}

function decodeTimelineItems(raw: unknown): AgentTimelineItem[] {
  if (!Array.isArray(raw)) return [];
  const items: AgentTimelineItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = decodeString(record.id) ?? createUniqueId('timeline');
    if (record.kind === 'reasoning') {
      items.push({
        id,
        kind: 'reasoning',
        text: decodeString(record.text) ?? '',
        status: record.status === 'running' ? 'running' : 'completed',
        placeholder: typeof record.placeholder === 'boolean' ? record.placeholder : undefined,
      });
    } else if (record.kind === 'tool-call') {
      items.push({
        id,
        kind: 'tool-call',
        summary: decodeString(record.summary) ?? '',
        status:
          record.status === 'failed'
            ? 'failed'
            : record.status === 'completed'
              ? 'completed'
              : 'running',
        argumentLines: Array.isArray(record.argumentLines)
          ? record.argumentLines.filter((value): value is string => typeof value === 'string')
          : undefined,
        truncatedLineCount: decodeNumber(record.truncatedLineCount),
        results: decodeResultItems(record.results),
      });
    } else if (record.kind === 'text') {
      items.push({
        id,
        kind: 'text',
        text: decodeString(record.text) ?? '',
        startedAt: decodeNumber(record.startedAt),
        updatedAt: decodeNumber(record.updatedAt),
        completedAt: decodeNumber(record.completedAt),
        previousCompletedAt: decodeNumber(record.previousCompletedAt),
        durationSeconds: decodeNumber(record.durationSeconds),
      });
    } else if (record.kind === 'cumulative-cost') {
      items.push({ id, kind: 'cumulative-cost', amountLabel: decodeString(record.amountLabel) ?? '' });
    }
  }
  return items;
}

type DecodedConversation = {
  entries: LogEntry[];
  agentName: string | null;
  isInProgress: boolean;
  startedAtMs: number | null;
};

function decodeUserInputParts(raw: unknown): UserInputPart[] {
  if (!Array.isArray(raw)) return [];
  const parts: UserInputPart[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (record.type === 'text') {
      const text = decodeString(record.text);
      if (text) parts.push({ type: 'text', text });
      continue;
    }
    if (record.type === 'image' && record.source && typeof record.source === 'object') {
      const url = decodeString((record.source as Record<string, unknown>).url);
      if (url) parts.push({ type: 'image', url });
    }
  }
  return parts;
}

function decodeUserInputText(raw: Record<string, unknown>): string {
  return decodeString(raw.userMessage) ?? decodeString(raw.user_message) ?? '';
}

function decodeConversationToLogEntries(session: Record<string, unknown>): DecodedConversation {
  const turnsRaw = Array.isArray(session.turns) ? session.turns : [];
  const inProgress =
    session.status === 'progress' &&
    (session.inProgress ?? session.in_progress) &&
    typeof (session.inProgress ?? session.in_progress) === 'object'
      ? ((session.inProgress ?? session.in_progress) as Record<string, unknown>)
      : null;

  let agentName = decodeString(session.agentName) ?? decodeString(session.agent_name) ?? null;
  if (!agentName) {
    for (let i = turnsRaw.length - 1; i >= 0; i -= 1) {
      const turn = turnsRaw[i] as Record<string, unknown> | null;
      if (!turn) continue;
      const resolved =
        decodeString(turn.agentName) ??
        decodeString(turn.agent_name) ??
        decodeString(turn.agentId) ??
        decodeString(turn.agent_id);
      if (resolved) {
        agentName = resolved;
        break;
      }
    }
  }

  const entries: LogEntry[] = [];
  for (const turn of turnsRaw) {
    if (!turn || typeof turn !== 'object') continue;
    const record = turn as Record<string, unknown>;
    const timestamp = decodeString(record.timestamp) ?? new Date().toISOString();
    const inputParts = decodeUserInputParts(record.userContent).length > 0
      ? decodeUserInputParts(record.userContent)
      : decodeUserInputParts(record.user_content);
    const userMessage = decodeUserInputText(record);
    const assistantMessage =
      decodeString(record.assistantMessage) ?? decodeString(record.assistant_message) ?? '';

    const userEntry: UserCommandLogEntry = {
      id: createUniqueId('log-user'),
      kind: 'user-command',
      timestamp,
      commandDisplay: userMessage,
      inputText: userMessage,
      inputParts: inputParts.length > 0 ? inputParts : undefined,
      displayMode: 'userMessage',
    };
    const agentEntry: AgentResponseLogEntry = {
      id: createUniqueId('log-agent'),
      kind: 'agent-response',
      timestamp,
      status: record.status === 'success' ? 'succeeded' : 'failed',
      timeline: decodeTimelineItems(record.timeline),
      results: [],
      responseText: assistantMessage,
      errorMessage: decodeString(record.errorMessage) ?? decodeString(record.error_message),
    };
    entries.push(userEntry, agentEntry);
  }

  let isInProgress = false;
  let startedAtMs: number | null = null;

  if (inProgress) {
    isInProgress = true;
    const inputParts = decodeUserInputParts(inProgress.userContent).length > 0
      ? decodeUserInputParts(inProgress.userContent)
      : decodeUserInputParts(inProgress.user_content);
    const userMessage = decodeUserInputText(inProgress);
    const assistantMessage =
      decodeString(inProgress.assistantMessage) ??
      decodeString(inProgress.assistant_message) ??
      '';
    const startedAt =
      decodeString(inProgress.startedAt) ??
      decodeString(inProgress.started_at) ??
      new Date().toISOString();
    const updatedAt =
      decodeString(inProgress.updatedAt) ?? decodeString(inProgress.updated_at) ?? startedAt;
    const parsedStartedAt = Date.parse(startedAt);
    startedAtMs = Number.isFinite(parsedStartedAt) ? parsedStartedAt : null;

    entries.push(
      {
        id: createUniqueId('log-user'),
        kind: 'user-command',
        timestamp: startedAt,
        commandDisplay: userMessage,
        inputText: userMessage,
        inputParts: inputParts.length > 0 ? inputParts : undefined,
        displayMode: 'userMessage',
      },
      {
        id: createUniqueId('log-agent'),
        kind: 'agent-response',
        timestamp: updatedAt,
        status: 'running',
        timeline: decodeTimelineItems(inProgress.timeline),
        results: [],
        responseText: assistantMessage,
      },
    );
  }

  return { entries, agentName, isInProgress, startedAtMs };
}

const DEFAULT_POLL_INTERVAL = 2000;

export function useThread(sessionId: string, options: UseThreadOptions = {}): UseThreadResult {
  const client = useAiKitClient();
  const [state, setState] = useState<ThreadState>({
    logEntries: [],
    agentName: null,
    isRunning: false,
    runStartedAt: null,
    isLoading: false,
  });
  const [pollable, setPollable] = useState(false);
  const loadedSessionRef = useRef<string | null>(null);
  const sessionKey = `${options.agentName ?? ''}:${sessionId}`;

  useEffect(() => {
    if (sessionId === 'new' || !sessionId) {
      loadedSessionRef.current = sessionKey;
      setState({
        logEntries: [],
        agentName: null,
        isRunning: false,
        runStartedAt: null,
        isLoading: false,
      });
      setPollable(false);
      return;
    }

    const activeRun = getActiveRun(sessionId);
    if (activeRun) {
      loadedSessionRef.current = sessionKey;
      setState({
        logEntries: activeRun.logEntries,
        agentName: activeRun.agentName,
        isRunning: activeRun.isRunning,
        runStartedAt: activeRun.startedAt,
        isLoading: false,
      });
      setPollable(false);

      const unsubscribe = subscribeActiveRun(sessionId, (snapshot: ActiveRunSnapshot) => {
        setState((prev) => ({
          ...prev,
          logEntries: snapshot.logEntries,
          agentName: snapshot.agentName ?? prev.agentName,
          isRunning: snapshot.isRunning,
          runStartedAt: snapshot.isRunning ? snapshot.startedAt : null,
        }));
      });

      return unsubscribe ?? undefined;
    }

    if (loadedSessionRef.current === sessionKey) return;

    let cancelled = false;
    void (async () => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const session = await client.getConversation(sessionId, options.agentName);
        if (cancelled) return;
        const decoded = decodeConversationToLogEntries(session as unknown as Record<string, unknown>);
        loadedSessionRef.current = sessionKey;
        setState({
          logEntries: decoded.entries,
          agentName: decoded.agentName,
          isRunning: decoded.isInProgress,
          runStartedAt: decoded.startedAtMs,
          isLoading: false,
        });
        setPollable(decoded.isInProgress);
      } catch {
        if (cancelled) return;
        loadedSessionRef.current = sessionKey;
        setState({
          logEntries: [],
          agentName: null,
          isRunning: false,
          runStartedAt: null,
          isLoading: false,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, options.agentName, sessionId, sessionKey]);

  useEffect(() => {
    if (!pollable || !sessionId || sessionId === 'new') return;
    let cancelled = false;

    const poll = async () => {
      try {
        const session = await client.getConversation(sessionId, options.agentName);
        if (cancelled) return;
        const decoded = decodeConversationToLogEntries(session as unknown as Record<string, unknown>);
        setState((prev) => ({
          ...prev,
          logEntries: decoded.entries,
          agentName: decoded.agentName ?? prev.agentName,
          isRunning: decoded.isInProgress,
          runStartedAt: decoded.isInProgress ? decoded.startedAtMs : null,
        }));
        if (!decoded.isInProgress) {
          setPollable(false);
        }
      } catch {
        // ignore polling errors
      }
    };

    const timer = setInterval(poll, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, options.agentName, options.pollIntervalMs, pollable, sessionId]);

  const appendEntry = useCallback((entry: LogEntry) => {
    setState((prev) => ({ ...prev, logEntries: [...prev.logEntries, entry] }));
  }, []);

  const updateAgentEntry = useCallback(
    (id: string, updater: (entry: AgentResponseLogEntry) => AgentResponseLogEntry) => {
      setState((prev) => ({
        ...prev,
        logEntries: prev.logEntries.map((entry) =>
          entry.id === id && entry.kind === 'agent-response' ? updater(entry) : entry,
        ),
      }));
    },
    [],
  );

  const replaceEntries = useCallback((entries: LogEntry[]) => {
    setState((prev) => ({ ...prev, logEntries: entries }));
  }, []);

  const setRunning = useCallback((running: boolean, startedAt: number | null) => {
    setPollable(false);
    setState((prev) => ({
      ...prev,
      isRunning: running,
      runStartedAt: startedAt,
    }));
  }, []);

  const setAgentName = useCallback((name: string | null) => {
    setState((prev) => ({ ...prev, agentName: name }));
  }, []);

  return {
    ...state,
    appendEntry,
    updateAgentEntry,
    replaceEntries,
    setRunning,
    setAgentName,
  };
}
