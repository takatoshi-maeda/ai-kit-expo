import type { AiKitClient, JsonRpcId } from './types';

export const DEFAULT_MCP_PROTOCOL_VERSION = '2025-03-26';

let requestCounter = 0;

export function nextRequestId(): JsonRpcId {
  requestCounter += 1;
  return `mcp-${Date.now().toString(16)}-${requestCounter}`;
}

export function getResolvedAgentName(client: AiKitClient, agentName?: string | null): string {
  const resolved = agentName ?? client.config.defaultAgentName;
  if (!resolved) {
    throw new Error('agentName is required because no defaultAgentName was configured.');
  }
  return resolved;
}

export function getResolvedProtocolVersion(client: AiKitClient): string {
  return client.config.protocolVersion ?? DEFAULT_MCP_PROTOCOL_VERSION;
}

export function buildMcpEndpoints(agentName: string) {
  return {
    mcpInit: `/api/mcp/${agentName}`,
    mcpStatus: `/api/mcp/${agentName}/status`,
    toolCall: (name: string) => `/api/mcp/${agentName}/tools/call/${name}`,
  } as const;
}

export function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}
