import { runAgent } from './agent';
import { deleteConversation, getConversation, listConversations } from './conversations';
import { healthCheck } from './health';
import type {
  AiKitClient,
  AiKitClientConfig,
  AiKitDocumentClient,
  AiKitDocumentClientConfig,
  AiKitToolNameConfig,
} from './types';
import { getUsageSummary } from './usage';

export const DEFAULT_TOOL_NAMES: AiKitToolNameConfig = {
  agentRun: 'agent.run',
  conversationList: 'conversations.list',
  conversationGet: 'conversations.get',
  conversationDelete: 'conversations.delete',
  documentTree: 'documents.tree',
  documentFileGet: 'documents.file.get',
  documentFileSave: 'documents.file.save',
  documentWatch: 'documents.watch',
  usageGet: 'usage.get',
  healthGet: 'health.get',
};

function freezeToolNames(overrides: Partial<AiKitToolNameConfig> | undefined): AiKitToolNameConfig {
  return Object.freeze({
    ...DEFAULT_TOOL_NAMES,
    ...overrides,
  });
}

function freezeDocumentConfig(config: AiKitDocumentClientConfig): Readonly<AiKitDocumentClientConfig> {
  return Object.freeze({
    ...config,
    toolNames: freezeToolNames(config.toolNames),
    themeTokens: config.themeTokens ? Object.freeze({ ...config.themeTokens }) : undefined,
  });
}

function freezeClientConfig(config: AiKitClientConfig): Readonly<AiKitClientConfig> {
  return Object.freeze({
    ...config,
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    toolNames: freezeToolNames(config.toolNames),
    themeTokens: config.themeTokens ? Object.freeze({ ...config.themeTokens }) : undefined,
    clientInfo: config.clientInfo ? Object.freeze({ ...config.clientInfo }) : undefined,
  });
}

export function createAiKitDocumentClient(
  config: AiKitDocumentClientConfig,
): AiKitDocumentClient {
  return {
    kind: 'ai-kit-document-client',
    config: freezeDocumentConfig(config),
  };
}

export function createAiKitClient(config: AiKitClientConfig): AiKitClient {
  const frozenConfig = freezeClientConfig(config);
  const documents = createAiKitDocumentClient({
    baseUrl: frozenConfig.baseUrl,
    authFetch: frozenConfig.authFetch,
    storage: frozenConfig.storage,
    themeTokens: frozenConfig.themeTokens,
    toolNames: frozenConfig.toolNames,
    headers: frozenConfig.headers,
  });

  const client: AiKitClient = {
    kind: 'ai-kit-client',
    config: frozenConfig,
    documents,
    listConversations(limit, agentName) {
      return listConversations(client, limit, agentName);
    },
    getConversation(sessionId, agentName) {
      return getConversation(client, sessionId, agentName);
    },
    deleteConversation(sessionId, agentName) {
      return deleteConversation(client, sessionId, agentName);
    },
    getUsageSummary(period, agentName) {
      return getUsageSummary(client, period, agentName);
    },
    healthCheck(agentName) {
      return healthCheck(client, agentName);
    },
    runAgent(options) {
      return runAgent(client, options);
    },
  };

  return client;
}
