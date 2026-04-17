import { useCallback, useEffect, useRef, useState } from 'react';

import { useAiKitRuntime } from './context';
import type { AiKitClient, UsageSummaryResult } from '../client';

export type AiKitUsageStatus = 'loading' | 'ready' | 'error';

export type AiKitUsageLogEntry = {
  kind?: string;
  monthlyCostUsd?: number;
};

export type AiKitUsageSummary = {
  cumulativeUsd?: number;
  monthlyUsd?: number;
  weeklyUsd?: number;
  dailyUsd?: number;
};

type McpIndexResponse = {
  apps?: {
    appName?: string | null;
    name?: string | null;
  }[];
  agents?: {
    name?: string | null;
  }[];
};

function readUsd(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function addUsd(left: number | undefined, right: number | undefined): number | undefined {
  if (left == null) return right;
  if (right == null) return left;
  return left + right;
}

function toUsageSummary(data: UsageSummaryResult): AiKitUsageSummary {
  return {
    cumulativeUsd:
      readUsd(data.periods?.cumulative?.cost?.totalUsd) ??
      readUsd(data.cost?.totalUsd),
    monthlyUsd: readUsd(data.periods?.monthly?.cost?.totalUsd),
    weeklyUsd: readUsd(data.periods?.weekly?.cost?.totalUsd),
    dailyUsd: readUsd(data.periods?.daily?.cost?.totalUsd),
  };
}

function mergeUsageSummary(
  current: AiKitUsageSummary,
  next: AiKitUsageSummary,
): AiKitUsageSummary {
  return {
    cumulativeUsd: addUsd(current.cumulativeUsd, next.cumulativeUsd),
    monthlyUsd: addUsd(current.monthlyUsd, next.monthlyUsd),
    weeklyUsd: addUsd(current.weeklyUsd, next.weeklyUsd),
    dailyUsd: addUsd(current.dailyUsd, next.dailyUsd),
  };
}

async function resolveClientHeaders(
  headers:
    | HeadersInit
    | (() => HeadersInit | Promise<HeadersInit>)
    | undefined,
): Promise<HeadersInit | undefined> {
  if (!headers) return undefined;
  return typeof headers === 'function' ? headers() : headers;
}

async function listMcpAppNames(client: AiKitClient): Promise<string[]> {
  const fetchImpl = client.config.authFetch ?? fetch;
  const response = await fetchImpl(`${client.config.baseUrl.replace(/\/+$/, '')}/api/mcp`, {
    method: 'GET',
    headers: await resolveClientHeaders(client.config.headers),
  });
  if (!response.ok) {
    throw new Error(`Failed to load MCP apps: ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as McpIndexResponse | null;
  const names = new Set<string>();

  for (const item of Array.isArray(payload?.apps) ? payload.apps : []) {
    const value = typeof item?.appName === 'string' && item.appName.trim()
      ? item.appName.trim()
      : typeof item?.name === 'string' && item.name.trim()
        ? item.name.trim()
        : null;
    if (value) names.add(value);
  }

  if (names.size === 0) {
    for (const item of Array.isArray(payload?.agents) ? payload.agents : []) {
      const value = typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : null;
      if (value) names.add(value);
    }
  }

  return [...names];
}

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
  usageSummary: AiKitUsageSummary | undefined;
  refreshUsage: () => Promise<void>;
  syncUsageFromLogEntries: (entries: AiKitUsageLogEntry[]) => void;
} {
  const resolvedAgentName = agentName ?? activeAgentName;
  const [usageStatus, setUsageStatus] = useState<AiKitUsageStatus>('loading');
  const [usageUsd, setUsageUsd] = useState<number | undefined>(undefined);
  const [usageSummary, setUsageSummary] = useState<AiKitUsageSummary | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const refreshUsage = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setUsageStatus('loading');
    try {
      const appNames = await listMcpAppNames(client);
      if (controller.signal.aborted) return;

      const targetNames = appNames.length > 0 ? appNames : [resolvedAgentName];
      const results = await Promise.all(
        targetNames.map((name) => client.getUsageSummary(undefined, name)),
      );
      if (controller.signal.aborted) return;

      const summary = results.reduce<AiKitUsageSummary>(
        (acc, item) => mergeUsageSummary(acc, toUsageSummary(item)),
        {},
      );
      const totalUsd = summary.cumulativeUsd;
      if (totalUsd == null) {
        throw new Error('Response did not include totalUsd.');
      }
      setUsageUsd(totalUsd);
      setUsageSummary(summary);
      setUsageStatus('ready');
    } catch {
      if (controller.signal.aborted) return;
      setUsageStatus('error');
      setUsageUsd(undefined);
      setUsageSummary(undefined);
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
        void refreshUsage();
        return;
      }
    }
  }, [refreshUsage]);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      setUsageUsd(undefined);
      setUsageSummary(undefined);
      setUsageStatus('ready');
      return;
    }
    void refreshUsage();
    return () => {
      abortRef.current?.abort();
    };
  }, [enabled, refreshUsage]);

  return { usageStatus, usageUsd, usageSummary, refreshUsage, syncUsageFromLogEntries };
}

export function useUsage(
  enabled = true,
  agentName?: string,
): {
  usageStatus: AiKitUsageStatus;
  usageUsd: number | undefined;
  usageSummary: AiKitUsageSummary | undefined;
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
