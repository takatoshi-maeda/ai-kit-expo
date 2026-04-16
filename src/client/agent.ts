import { callToolStream } from './jsonrpc';
import type { AgentRunResult, AgentStreamPayload, JsonRpcNotification, RunAgentOptions, AiKitClient } from './types';

function createNotificationToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `token-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export async function runAgent(client: AiKitClient, options: RunAgentOptions): Promise<AgentRunResult> {
  const notificationToken = createNotificationToken();
  const payload: Record<string, unknown> = {
    stream: true,
    notificationToken,
  };

  if (typeof options.message === 'string' && options.message.length > 0) {
    payload.message = options.message;
  }
  if (Array.isArray(options.input) && options.input.length > 0) {
    payload.input = options.input;
  }
  if (options.sessionId) {
    payload.sessionId = options.sessionId;
  }
  if (options.runtime) {
    payload.runtime = options.runtime;
  }
  if (options.params) {
    payload.params = options.params;
  }

  return callToolStream<AgentRunResult>(
    client,
    client.config.toolNames?.agentRun ?? 'agent.run',
    { arguments: payload },
    {
      signal: options.signal,
      onNotification: (message: JsonRpcNotification) => {
        if (message.method !== 'agent/stream-response') return;
        const params = message.params as AgentStreamPayload | undefined;
        if (!params || typeof params !== 'object') return;
        const token = (params.notificationToken ?? params.notification_token) as unknown;
        if (typeof token === 'string' && token !== notificationToken) return;
        options.onStreamEvent?.(params);
      },
    },
    options.agentName,
  );
}
