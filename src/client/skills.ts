import { callTool } from './jsonrpc';
import type { AiKitClient, SkillsListResult } from './types';

export function listSkills(
  client: AiKitClient,
  params?: Record<string, unknown>,
  agentName?: string,
): Promise<SkillsListResult> {
  const args: Record<string, unknown> = {};
  if (params && Object.keys(params).length > 0) {
    args.params = params;
  }

  return callTool<SkillsListResult>(
    client,
    client.config.toolNames?.skillList ?? 'skills.list',
    args,
    {},
    agentName,
  );
}
