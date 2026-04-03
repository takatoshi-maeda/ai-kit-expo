import { callTool } from './jsonrpc';
import type { AiKitClient, UsageSummaryResult } from './types';

export function getUsageSummary(
  client: AiKitClient,
  period?: string,
  agentName?: string,
): Promise<UsageSummaryResult> {
  return callTool<UsageSummaryResult>(
    client,
    client.config.toolNames?.usageGet ?? 'usage.get',
    period ? { period } : {},
    {},
    agentName,
  );
}
