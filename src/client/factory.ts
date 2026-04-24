import { listAgents } from './agents';
import { runAgent } from './agent';
import { cancelAgentRun } from './agentCancel';
import { deleteConversation, forkConversation, getConversation, listConversations } from './conversations';
import {
  getDocumentAssetUrl,
  getDocumentFile,
  listDocumentsTree,
  saveDocumentFile,
  watchDocuments,
} from './documents';
import { healthCheck } from './health';
import { listSkills } from './skills';
import type {
  AiKitClient,
  AiKitClientConfig,
  AiKitDocumentClient,
  AiKitDocumentClientConfig,
  AiKitToolNameConfig,
} from './types';
import { getUsageSummary } from './usage';

export const DEFAULT_TOOL_NAMES: AiKitToolNameConfig = {
  agentList: 'agent.list',
  agentRun: 'agent.run',
  agentCancel: 'agent.cancel',
  skillList: 'skills.list',
  conversationList: 'conversations.list',
  conversationGet: 'conversations.get',
  conversationFork: 'conversations.fork',
  conversationDelete: 'conversations.delete',
  documentTree: 'documents.tree',
  documentFileGet: 'documents.file.get',
  documentFileSave: 'documents.file.save',
  documentWatch: 'documents.watch',
  usageGet: 'usage.summary',
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
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    documentBasePath: config.documentBasePath,
    toolNames: freezeToolNames(config.toolNames),
    themeTokens: config.themeTokens ? Object.freeze({ ...config.themeTokens }) : undefined,
  });
}

function freezeClientConfig(config: AiKitClientConfig): Readonly<AiKitClientConfig> {
  return Object.freeze({
    ...config,
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    documentBasePath: config.documentBasePath,
    toolNames: freezeToolNames(config.toolNames),
    themeTokens: config.themeTokens ? Object.freeze({ ...config.themeTokens }) : undefined,
    clientInfo: config.clientInfo ? Object.freeze({ ...config.clientInfo }) : undefined,
  });
}

export function createAiKitDocumentClient(
  config: AiKitDocumentClientConfig,
): AiKitDocumentClient {
  const client: AiKitDocumentClient = {
    kind: 'ai-kit-document-client',
    config: freezeDocumentConfig(config),
    listDocumentsTree() {
      return listDocumentsTree(client);
    },
    getDocumentFile(path) {
      return getDocumentFile(client, path);
    },
    saveDocumentFile(args) {
      return saveDocumentFile(client, args);
    },
    watchDocuments(args) {
      return watchDocuments(client, args);
    },
    getDocumentAssetUrl(path) {
      return getDocumentAssetUrl(client, path);
    },
  };
  return client;
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
    documentBasePath: frozenConfig.documentBasePath,
  });

  const client: AiKitClient = {
    kind: 'ai-kit-client',
    config: frozenConfig,
    documents,
    listAgents(agentName) {
      return listAgents(client, agentName);
    },
    listSkills(params, agentName) {
      return listSkills(client, params, agentName);
    },
    listConversations(limit, agentName) {
      return listConversations(client, limit, agentName);
    },
    getConversation(sessionId, agentName) {
      return getConversation(client, sessionId, agentName);
    },
    forkConversation(args, agentName) {
      return forkConversation(client, args, agentName);
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
    cancelAgentRun(options) {
      return cancelAgentRun(client, options);
    },
  };

  return client;
}
