import { callTool } from './jsonrpc';
import type { AiKitClient, HealthCheckResult } from './types';

export function healthCheck(client: AiKitClient, agentName?: string): Promise<HealthCheckResult> {
  return callTool<HealthCheckResult>(
    client,
    client.config.toolNames?.healthGet ?? 'health.get',
    {},
    {},
    agentName,
  );
}
