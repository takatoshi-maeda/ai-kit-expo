import type { AiKitClient, AiKitStorageAdapter } from '../client';

export type AiKitConnectionState =
  | 'idle'
  | 'starting'
  | 'initializing'
  | 'ready'
  | 'error'
  | 'exited';

export type AiKitMcpStatus = {
  ok: boolean;
  state: AiKitConnectionState;
  pid: number | null;
  startedAt: number | null;
  updatedAt: number;
  lastError?: string;
};

export type AiKitAgentCapabilities = {
  supportsThreads: boolean;
  supportsUsage: boolean;
};

export type AiKitAgentConfig = {
  name: string;
  baseUrl?: string | (() => string);
  capabilities?: Partial<AiKitAgentCapabilities>;
};

export type AiKitStatusFetcher = (args: {
  client: AiKitClient;
  agentName: string;
  baseUrl: string;
  warmup?: boolean;
}) => Promise<AiKitMcpStatus>;

export type AiKitRuntimeConfig = {
  agents?: readonly AiKitAgentConfig[];
  initialAgentName?: string;
  activeAgentStorageKey?: string;
  fetchStatus?: AiKitStatusFetcher;
};

export const DEFAULT_ACTIVE_AGENT_STORAGE_KEY = 'ai-kit.activeAgentName';

const DEFAULT_CAPABILITIES: AiKitAgentCapabilities = {
  supportsThreads: true,
  supportsUsage: true,
};

export function getAgentConfig(
  agents: readonly AiKitAgentConfig[],
  agentName: string | null | undefined,
): AiKitAgentConfig | null {
  if (!agentName) return null;
  return agents.find((agent) => agent.name === agentName) ?? null;
}

export function getAgentCapabilities(
  agents: readonly AiKitAgentConfig[],
  agentName: string | null | undefined,
): AiKitAgentCapabilities {
  const agent = getAgentConfig(agents, agentName);
  return {
    supportsThreads: agent?.capabilities?.supportsThreads ?? DEFAULT_CAPABILITIES.supportsThreads,
    supportsUsage: agent?.capabilities?.supportsUsage ?? DEFAULT_CAPABILITIES.supportsUsage,
  };
}

export function getAgentBaseUrl(
  agents: readonly AiKitAgentConfig[],
  agentName: string | null | undefined,
  fallbackBaseUrl: string,
): string {
  const agent = getAgentConfig(agents, agentName);
  if (!agent?.baseUrl) return fallbackBaseUrl;
  return typeof agent.baseUrl === 'function' ? agent.baseUrl() : agent.baseUrl;
}

export function resolveInitialActiveAgentName(
  config: AiKitRuntimeConfig | undefined,
  client: AiKitClient,
): string {
  const agents = config?.agents ?? [];
  const candidate =
    config?.initialAgentName ?? client.config.defaultAgentName ?? agents[0]?.name ?? 'default';
  if (agents.length === 0) return candidate;
  return getAgentConfig(agents, candidate)?.name ?? agents[0]!.name;
}

export async function readStoredActiveAgentName(
  storage: AiKitStorageAdapter | undefined,
  storageKey: string,
): Promise<string | null> {
  if (!storage?.getItem) return null;
  const value = await storage.getItem(storageKey);
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function writeStoredActiveAgentName(
  storage: AiKitStorageAdapter | undefined,
  storageKey: string,
  value: string,
): Promise<void> {
  if (!storage?.setItem) return;
  await storage.setItem(storageKey, value);
}
