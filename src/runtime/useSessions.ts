import { useCallback, useEffect, useRef, useState } from 'react';

import type { AiKitClient, ConversationSummary } from '../client';
import { useAiKitRuntime } from './context';

function isAbortLikeError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('signal is aborted');
}

type UseManagedSessionsArgs = {
  client: AiKitClient;
  activeAgentName: string;
  enabled?: boolean;
  agentName?: string;
};

export function useManagedSessions({
  client,
  activeAgentName,
  enabled = true,
  agentName,
}: UseManagedSessionsArgs): {
  sessions: ConversationSummary[];
  isSessionListLoading: boolean;
  refreshSessions: (agentNameOverride?: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
} {
  const resolvedAgentName = agentName ?? activeAgentName;
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [isSessionListLoading, setIsSessionListLoading] = useState(false);
  const latestRequestIdRef = useRef(0);

  const refreshSessions = useCallback(
    async (agentNameOverride?: string) => {
      if (!enabled) {
        latestRequestIdRef.current += 1;
        setSessions([]);
        setIsSessionListLoading(false);
        return;
      }

      const requestId = (latestRequestIdRef.current += 1);
      setIsSessionListLoading(true);
      try {
        const payload = await client.listConversations(50, agentNameOverride ?? resolvedAgentName);
        const sessionsRaw = Array.isArray(payload.sessions) ? payload.sessions : [];
        if (requestId !== latestRequestIdRef.current) return;
        setSessions(
          [...sessionsRaw].sort((a, b) => {
            const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? '') || 0;
            const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? '') || 0;
            return bTime - aTime;
          }),
        );
      } catch (error) {
        if (requestId !== latestRequestIdRef.current) return;
        if (isAbortLikeError(error)) return;
        setSessions([]);
      } finally {
        if (requestId === latestRequestIdRef.current) {
          setIsSessionListLoading(false);
        }
      }
    },
    [client, enabled, resolvedAgentName],
  );

  const deleteSession = useCallback(
    async (targetSessionId: string) => {
      if (!enabled || !targetSessionId) return;
      setSessions((prev) => prev.filter((session) => session.sessionId !== targetSessionId));
      try {
        await client.deleteConversation(targetSessionId, resolvedAgentName);
      } finally {
        void refreshSessions();
      }
    },
    [client, enabled, refreshSessions, resolvedAgentName],
  );

  useEffect(() => {
    if (!enabled) {
      latestRequestIdRef.current += 1;
      setSessions([]);
      setIsSessionListLoading(false);
      return;
    }
    void refreshSessions();
  }, [enabled, refreshSessions, resolvedAgentName]);

  return { sessions, isSessionListLoading, refreshSessions, deleteSession };
}

export function useSessions(
  enabled = true,
  agentName?: string,
): {
  sessions: ConversationSummary[];
  isSessionListLoading: boolean;
  refreshSessions: (agentNameOverride?: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
} {
  const runtime = useAiKitRuntime();
  return useManagedSessions({
    client: runtime.client,
    activeAgentName: runtime.activeAgentName,
    enabled,
    agentName,
  });
}
