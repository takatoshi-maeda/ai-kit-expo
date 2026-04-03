import { useCallback, useEffect, useRef, useState } from 'react';

import { useAiKitRuntime } from './context';
import type { AiKitClient } from '../client';
import {
  getAgentBaseUrl,
  type AiKitAgentConfig,
  type AiKitMcpStatus,
  type AiKitStatusFetcher,
} from './config';

function createErrorStatus(error: unknown): AiKitMcpStatus {
  return {
    ok: false,
    state: 'error',
    pid: null,
    startedAt: null,
    updatedAt: Date.now(),
    lastError: error instanceof Error ? error.message : String(error ?? 'error'),
  };
}

type UseManagedMcpStatusArgs = {
  client: AiKitClient;
  agents: readonly AiKitAgentConfig[];
  activeAgentName: string;
  fetchStatus: AiKitStatusFetcher;
  enabled?: boolean;
  agentName?: string;
};

export function useManagedMcpStatus({
  client,
  agents,
  activeAgentName,
  fetchStatus,
  enabled = true,
  agentName,
}: UseManagedMcpStatusArgs): {
  status: AiKitMcpStatus | null;
  refresh: (options?: { warmup?: boolean }) => Promise<void>;
} {
  const resolvedAgentName = agentName ?? activeAgentName;
  const [status, setStatus] = useState<AiKitMcpStatus | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(
    async (options: { warmup?: boolean } = {}) => {
      if (!enabled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const payload = await fetchStatus({
          client,
          agentName: resolvedAgentName,
          baseUrl: getAgentBaseUrl(agents, resolvedAgentName, client.config.baseUrl),
          warmup: options.warmup,
        });
        setStatus(payload);
      } catch (error) {
        setStatus(createErrorStatus(error));
      } finally {
        inFlightRef.current = false;
      }
    },
    [agents, client, enabled, fetchStatus, resolvedAgentName],
  );

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    setStatus(null);
    void refresh({ warmup: true });
  }, [enabled, refresh, resolvedAgentName]);

  useEffect(() => {
    if (!enabled) return;
    const statusState = status?.state ?? null;
    if (statusState === 'ready') return;

    const delayMs = statusState === 'error' || statusState === 'exited' ? 2500 : 500;
    const timer = setInterval(() => {
      const shouldWarmup = statusState === null || statusState === 'idle';
      void refresh({ warmup: shouldWarmup });
    }, delayMs);
    return () => clearInterval(timer);
  }, [enabled, refresh, status?.state]);

  return { status, refresh };
}

export function useMcpStatus(
  enabled = true,
  agentName?: string,
): {
  status: AiKitMcpStatus | null;
  refresh: (options?: { warmup?: boolean }) => Promise<void>;
} {
  const runtime = useAiKitRuntime();
  return useManagedMcpStatus({
    client: runtime.client,
    agents: runtime.agents,
    activeAgentName: runtime.activeAgentName,
    fetchStatus: runtime.fetchStatus,
    enabled,
    agentName,
  });
}
