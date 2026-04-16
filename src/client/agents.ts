import { callTool } from './jsonrpc';
import type { AgentsListResult, AiKitClient } from './types';

export function listAgents(
  client: AiKitClient,
  agentName?: string,
): Promise<AgentsListResult> {
  return callTool<AgentsListResult>(
    client,
    client.config.toolNames?.agentList ?? 'agent.list',
    {},
    {},
    agentName,
  );
}
