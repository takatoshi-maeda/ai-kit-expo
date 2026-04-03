import { useCallback, useEffect, useRef, useState } from 'react';

import { useAiKitRuntime } from './context';
import type { AiKitClient } from '../client';

export type AiKitUsageStatus = 'loading' | 'ready' | 'error';

export type AiKitUsageLogEntry = {
  kind?: string;
  monthlyCostUsd?: number;
};

type UseManagedUsageArgs = {
  client: AiKitClient;
  activeAgentName: string;
  enabled?: boolean;
  agentName?: string;
};

export function useManagedUsage({
  client,
  activeAgentName,
  enabled = true,
  agentName,
}: UseManagedUsageArgs): {
  usageStatus: AiKitUsageStatus;
  usageUsd: number | undefined;
  refreshUsage: () => Promise<void>;
  syncUsageFromLogEntries: (entries: AiKitUsageLogEntry[]) => void;
} {
  const resolvedAgentName = agentName ?? activeAgentName;
  const [usageStatus, setUsageStatus] = useState<AiKitUsageStatus>('loading');
  const [usageUsd, setUsageUsd] = useState<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const refreshUsage = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setUsageStatus('loading');
    try {
      const data = await client.getUsageSummary(undefined, resolvedAgentName);
      if (controller.signal.aborted) return;
      const totalUsd =
        typeof data.cost?.totalUsd === 'number' && Number.isFinite(data.cost.totalUsd)
          ? data.cost.totalUsd
          : null;
      if (totalUsd == null) {
        throw new Error('Response did not include totalUsd.');
      }
      setUsageUsd(totalUsd);
      setUsageStatus('ready');
    } catch {
      if (controller.signal.aborted) return;
      setUsageStatus('error');
      setUsageUsd(undefined);
    }
  }, [client, resolvedAgentName]);

  const syncUsageFromLogEntries = useCallback((entries: AiKitUsageLogEntry[]) => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (
        entry.kind === 'agent-response' &&
        typeof entry.monthlyCostUsd === 'number' &&
        Number.isFinite(entry.monthlyCostUsd)
      ) {
        setUsageUsd(entry.monthlyCostUsd);
        setUsageStatus('ready');
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      setUsageUsd(undefined);
      setUsageStatus('ready');
      return;
    }
    void refreshUsage();
    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, refreshUsage]);

  return { usageStatus, usageUsd, refreshUsage, syncUsageFromLogEntries };
}

export function useUsage(
  enabled = true,
  agentName?: string,
): {
  usageStatus: AiKitUsageStatus;
  usageUsd: number | undefined;
  refreshUsage: () => Promise<void>;
  syncUsageFromLogEntries: (entries: AiKitUsageLogEntry[]) => void;
} {
  const runtime = useAiKitRuntime();
  return useManagedUsage({
    client: runtime.client,
    activeAgentName: runtime.activeAgentName,
    enabled,
    agentName,
  });
}
