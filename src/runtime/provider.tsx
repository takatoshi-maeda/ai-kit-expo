import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import type { AiKitClient } from '../client';
import { AiKitRuntimeContext } from './context';
import {
  DEFAULT_ACTIVE_AGENT_STORAGE_KEY,
  getAgentCapabilities,
  readStoredActiveAgentName,
  resolveInitialActiveAgentName,
  writeStoredActiveAgentName,
  type AiKitMcpStatus,
  type AiKitRuntimeConfig,
} from './config';
import { useManagedMcpStatus } from './useMcpStatus';
import { useManagedSessions } from './useSessions';
import { useManagedUsage } from './useUsage';

export type AiKitProviderProps = PropsWithChildren<{
  client: AiKitClient;
  config?: AiKitRuntimeConfig;
}>;

async function defaultFetchStatus(args: {
  client: AiKitClient;
  agentName: string;
  baseUrl: string;
  warmup?: boolean;
}): Promise<AiKitMcpStatus> {
  const response = await (args.client.config.authFetch ?? fetch)(
    `${args.baseUrl.replace(/\/+$/, '')}/api/mcp/${args.agentName}/status?warmup=${
      args.warmup === false ? '0' : '1'
    }`,
    { method: 'GET' },
  );
  const payload = (await response.json().catch(() => null)) as AiKitMcpStatus | null;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid MCP status response.');
  }
  return payload;
}

export function AiKitProvider({ children, client, config }: AiKitProviderProps): ReactElement {
  const agents = config?.agents ?? [];
  const storageKey = config?.activeAgentStorageKey ?? DEFAULT_ACTIVE_AGENT_STORAGE_KEY;
  const [activeAgentName, setActiveAgentNameState] = useState(() =>
    resolveInitialActiveAgentName(config, client),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const storedAgentName = await readStoredActiveAgentName(client.config.storage, storageKey);
      if (!storedAgentName || cancelled) return;
      const nextAgentName =
        agents.length === 0
          ? storedAgentName
          : (agents.find((agent) => agent.name === storedAgentName)?.name ?? null);
      if (nextAgentName) {
        setActiveAgentNameState(nextAgentName);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agents, client.config.storage, storageKey]);

  const setActiveAgentName = useCallback(
    (name: string) => {
      const nextAgentName =
        agents.length === 0 ? name : (agents.find((agent) => agent.name === name)?.name ?? null);
      if (!nextAgentName) {
        throw new Error(`Unknown ai-kit agent: ${name}`);
      }
      setActiveAgentNameState(nextAgentName);
      void writeStoredActiveAgentName(client.config.storage, storageKey, nextAgentName);
    },
    [agents, client.config.storage, storageKey],
  );

  const activeAgentCapabilities = useMemo(
    () => getAgentCapabilities(agents, activeAgentName),
    [activeAgentName, agents],
  );
  const fetchStatus = config?.fetchStatus ?? defaultFetchStatus;
  const mcp = useManagedMcpStatus({
    client,
    agents,
    activeAgentName,
    fetchStatus,
  });
  const usage = useManagedUsage({
    client,
    activeAgentName,
    enabled: activeAgentCapabilities.supportsUsage,
  });
  const sessions = useManagedSessions({
    client,
    activeAgentName,
    enabled: activeAgentCapabilities.supportsThreads,
  });

  const value = useMemo(
    () => ({
      client,
      documents: client.documents,
      agents,
      activeAgentName,
      activeAgentCapabilities,
      setActiveAgentName,
      fetchStatus,
      mcpStatus: mcp.status,
      refreshMcpStatus: mcp.refresh,
      usageStatus: usage.usageStatus,
      usageUsd: usage.usageUsd,
      refreshUsage: usage.refreshUsage,
      syncUsageFromLogEntries: usage.syncUsageFromLogEntries,
      sessions: sessions.sessions,
      isSessionListLoading: sessions.isSessionListLoading,
      refreshSessions: sessions.refreshSessions,
      deleteSession: sessions.deleteSession,
    }),
    [
      activeAgentCapabilities,
      activeAgentName,
      agents,
      client,
      fetchStatus,
      mcp.refresh,
      mcp.status,
      sessions.deleteSession,
      sessions.isSessionListLoading,
      sessions.refreshSessions,
      sessions.sessions,
      setActiveAgentName,
      usage.refreshUsage,
      usage.syncUsageFromLogEntries,
      usage.usageStatus,
      usage.usageUsd,
    ],
  );

  return <AiKitRuntimeContext.Provider value={value}>{children}</AiKitRuntimeContext.Provider>;
}
