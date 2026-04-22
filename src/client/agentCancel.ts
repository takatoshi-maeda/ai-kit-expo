import { callTool } from './jsonrpc';
import type { AiKitClient, CancelAgentRunOptions, CancelAgentRunResult } from './types';

export function cancelAgentRun(
  client: AiKitClient,
  options: CancelAgentRunOptions,
): Promise<CancelAgentRunResult> {
  const payload: Record<string, unknown> = {
    sessionId: options.sessionId,
    runId: options.runId,
  };

  if (typeof options.agentId === 'string' && options.agentId.trim().length > 0) {
    payload.agentId = options.agentId;
  }
  if (typeof options.reason === 'string' && options.reason.trim().length > 0) {
    payload.reason = options.reason;
  }

  return callTool<CancelAgentRunResult>(
    client,
    client.config.toolNames?.agentCancel ?? 'agent.cancel',
    payload,
    {},
    options.agentName,
  );
}
