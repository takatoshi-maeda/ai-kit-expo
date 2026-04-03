import { createContext, useContext } from 'react';

import type { AiKitClient, AiKitDocumentClient } from '../client';
import type {
  AiKitAgentCapabilities,
  AiKitAgentConfig,
  AiKitMcpStatus,
  AiKitStatusFetcher,
} from './config';
import type { AiKitUsageLogEntry, AiKitUsageStatus } from './useUsage';

export type AiKitRuntimeValue = {
  client: AiKitClient;
  documents: AiKitDocumentClient;
  agents: readonly AiKitAgentConfig[];
  activeAgentName: string;
  activeAgentCapabilities: AiKitAgentCapabilities;
  setActiveAgentName: (name: string) => void;
  fetchStatus: AiKitStatusFetcher;
  mcpStatus: AiKitMcpStatus | null;
  refreshMcpStatus: (options?: { warmup?: boolean }) => Promise<void>;
  usageStatus: AiKitUsageStatus;
  usageUsd: number | undefined;
  refreshUsage: () => Promise<void>;
  syncUsageFromLogEntries: (entries: AiKitUsageLogEntry[]) => void;
  sessions: import('../client').ConversationSummary[];
  isSessionListLoading: boolean;
  refreshSessions: (agentNameOverride?: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
};

const AiKitRuntimeContext = createContext<AiKitRuntimeValue | null>(null);

function useRequiredRuntimeContext(): AiKitRuntimeValue {
  const value = useContext(AiKitRuntimeContext);
  if (!value) {
    throw new Error('AiKitProvider is required.');
  }
  return value;
}

export function useAiKitRuntime(): AiKitRuntimeValue {
  return useRequiredRuntimeContext();
}

export function useAiKitClient(): AiKitClient {
  return useRequiredRuntimeContext().client;
}

export function useAiKitDocumentClient(): AiKitDocumentClient {
  return useRequiredRuntimeContext().documents;
}

export function useAiKitActiveAgentName(): string {
  return useRequiredRuntimeContext().activeAgentName;
}

export { AiKitRuntimeContext };
