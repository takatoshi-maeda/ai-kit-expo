import { callTool } from './jsonrpc';
import type { AiKitClient, ConversationsDeleteResult, ConversationsGetResult, ConversationsListResult } from './types';

export function listConversations(
  client: AiKitClient,
  limit = 50,
  agentName?: string,
): Promise<ConversationsListResult> {
  return callTool<ConversationsListResult>(
    client,
    client.config.toolNames?.conversationList ?? 'conversations.list',
    { limit },
    {},
    agentName,
  );
}

export function getConversation(
  client: AiKitClient,
  sessionId: string,
  agentName?: string,
): Promise<ConversationsGetResult> {
  return callTool<ConversationsGetResult>(
    client,
    client.config.toolNames?.conversationGet ?? 'conversations.get',
    { sessionId },
    {},
    agentName,
  );
}

export function deleteConversation(
  client: AiKitClient,
  sessionId: string,
  agentName?: string,
): Promise<ConversationsDeleteResult> {
  return callTool<ConversationsDeleteResult>(
    client,
    client.config.toolNames?.conversationDelete ?? 'conversations.delete',
    { sessionId },
    {},
    agentName,
  );
}
