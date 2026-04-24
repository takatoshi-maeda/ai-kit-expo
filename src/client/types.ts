export type AiKitFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AiKitStorageAdapter = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
};

export type AiKitThemeTokens = {
  text?: string;
  mutedText?: string;
  background?: string;
  surface?: string;
  surfaceBorder?: string;
  surfaceSelected?: string;
  tint?: string;
  error?: string;
};

export type AiKitToolNameConfig = {
  agentList: string;
  agentRun: string;
  agentCancel: string;
  skillList: string;
  conversationList: string;
  conversationGet: string;
  conversationFork: string;
  conversationDelete: string;
  documentTree: string;
  documentFileGet: string;
  documentFileSave: string;
  documentWatch: string;
  usageGet: string;
  healthGet: string;
};

export type UsageCostSummary = {
  totalUsd?: number;
  totalByCurrency?: Record<string, number>;
};

export type UsagePeriodSummary = {
  period: string;
  cost?: UsageCostSummary;
};

export type AiKitHeadersResolver =
  | HeadersInit
  | (() => HeadersInit | Promise<HeadersInit>)
  | undefined;

export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

export type StreamRequestOptions = {
  signal?: AbortSignal;
  onNotification?: (message: JsonRpcNotification) => void;
};

export type AiKitInjectedDependencies = {
  authFetch?: AiKitFetch;
  storage?: AiKitStorageAdapter;
  themeTokens?: AiKitThemeTokens;
  toolNames?: Partial<AiKitToolNameConfig>;
  headers?: AiKitHeadersResolver;
};

export type AiKitDocumentClientConfig = AiKitInjectedDependencies & {
  baseUrl: string;
  documentBasePath?: string;
};

export type AiKitClientConfig = AiKitInjectedDependencies & {
  baseUrl: string;
  defaultAgentName?: string;
  protocolVersion?: string;
  documentBasePath?: string;
  clientInfo?: {
    name: string;
    version: string;
  };
};

export type ConversationSummary = {
  sessionId: string;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  status?: 'idle' | 'progress';
  activeRunId?: string | null;
  activeUpdatedAt?: string | null;
  turnCount: number;
  latestUserMessage?: string | null;
};

export type ConversationsListResult = {
  sessions: ConversationSummary[];
};

export type AgentTimelineItem = unknown;

export type AgentRuntimeInput = {
  model?: string;
  reasoningEffort?: string;
  verbosity?: string;
};

export type AgentRuntimePolicy = {
  provider?: string;
  defaults?: AgentRuntimeInput;
  allowedModels?: string[];
  allowedReasoningEfforts?: string[];
  allowedVerbosity?: string[];
};

export type AgentListEntry = {
  agentId: string;
  description?: string | null;
  runtimePolicy?: AgentRuntimePolicy | null;
};

export type AgentsListResult = {
  defaultAgentId: string | null;
  agents: AgentListEntry[];
};

export type SkillListItem = {
  name: string;
  description?: string | null;
  mention?: string | null;
  agentRuntime?: AgentRuntimeInput | null;
  agent_runtime?: {
    model?: string | null;
    reasoningEffort?: string | null;
    reasoning_effort?: string | null;
    verbosity?: string | null;
  } | null;
};

export type SkillsListResult = {
  items: SkillListItem[];
};

export type ConversationsGetResult = {
  sessionId: string;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  agentName?: string | null;
  lastRuntime?: AgentRuntimeInput | null;
  status?: 'idle' | 'progress';
  inProgress?: {
    runId?: string | null;
    turnId?: string | null;
    startedAt?: string | null;
    updatedAt?: string | null;
    userMessage?: string | null;
    assistantMessage?: string | null;
    timeline?: AgentTimelineItem[] | null;
    agentId?: string | null;
    agentName?: string | null;
  } | null;
  turns: {
    turnId: string;
    runId: string;
    timestamp: string;
    userMessage: string;
    assistantMessage: string;
    status: 'success' | 'error' | 'cancelled';
    errorMessage?: string | null;
    timeline?: AgentTimelineItem[] | null;
    agentId?: string | null;
    agentName?: string | null;
    userContent?: unknown;
    user_content?: unknown;
  }[];
};

export type ConversationsDeleteResult = {
  deleted: boolean;
};

export type ConversationsForkResult = {
  sessionId: string;
  copiedTurnCount: number;
};

export type UsageSummaryResult = {
  period: string;
  cost?: UsageCostSummary;
  periods?: {
    cumulative?: UsagePeriodSummary;
    monthly?: UsagePeriodSummary;
    weekly?: UsagePeriodSummary;
    daily?: UsagePeriodSummary;
  };
  tokens?: unknown;
  requests?: unknown;
};

export type HealthCheckResult = {
  ok: boolean;
  timestamp?: string;
  dependencies?: {
    storage?: {
      driver?: string;
      ok?: boolean;
      error?: string;
    };
  };
};

export type AgentRunResult = {
  sessionId: string;
  runId: string;
  status: 'success' | 'error' | 'cancelled';
  turnId?: string;
  responseId?: string;
  message?: string;
  idempotencyKey?: string;
  notificationToken?: string;
  errorMessage?: string;
};

export type CancelAgentRunOptions = {
  sessionId: string;
  runId: string;
  agentId?: string;
  reason?: string;
  agentName?: string | null;
};

export type CancelAgentRunResult = {
  status: 'cancelled' | 'not_running';
  sessionId: string;
  runId: string;
  agentId?: string | null;
};

export type AgentStreamPayload = {
  type: string;
  [key: string]: unknown;
};

export type AgentInputItem =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'image'; source: { type: 'base64'; mediaType: string; data: string } };

export type DocumentActor = {
  type: 'user' | 'agent' | 'system' | 'external';
  id: string;
};

export type DocumentLanguage =
  | 'markdown'
  | 'python'
  | 'text'
  | 'image'
  | 'video'
  | 'pdf'
  | 'binary';

export type DocumentTreeNode = {
  id: string;
  name: string;
  path: string;
  kind: 'file' | 'folder';
  children?: DocumentTreeNode[];
  language?: DocumentLanguage;
};

export type DocumentTreeResult = {
  root: DocumentTreeNode[];
  updatedAt: string;
};

export type DocumentFileResult = {
  path: string;
  name: string;
  language: DocumentLanguage;
  content: string | null;
  version: string;
  updatedAt: string;
  updatedBy?: DocumentActor | null;
  mimeType: string;
  isBinary: boolean;
};

export type SaveDocumentFileArgs = {
  path: string;
  content: string;
  baseVersion?: string | null;
  actor?: DocumentActor | null;
};

export type DocumentWatchEvent =
  | {
      type: 'document.snapshot';
      payload: {
        root: DocumentTreeNode[];
        updatedAt: string;
        rootDir: string;
      };
    }
  | {
      type: 'document.changed';
      payload: {
        path: string;
        version: string;
        updatedAt: string;
        updatedBy?: DocumentActor | null;
        change: { kind: 'created' | 'updated' };
      };
    }
  | {
      type: 'document.deleted';
      payload: {
        path: string;
        updatedAt: string;
        change: { kind: 'deleted' };
      };
    }
  | {
      type: 'document.heartbeat';
      payload: { timestamp: string };
    }
  | {
      type: 'document.error';
      payload: { message?: string };
    };

export type RunAgentOptions = {
  message?: string;
  input?: AgentInputItem[];
  sessionId?: string | null;
  agentName?: string | null;
  runtime?: AgentRuntimeInput;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
  onStreamEvent?: (payload: AgentStreamPayload) => void;
};

export type AiKitDocumentClient = {
  readonly kind: 'ai-kit-document-client';
  readonly config: Readonly<AiKitDocumentClientConfig>;
  listDocumentsTree(): Promise<DocumentTreeResult>;
  getDocumentFile(path: string): Promise<DocumentFileResult>;
  saveDocumentFile(args: SaveDocumentFileArgs): Promise<DocumentFileResult>;
  watchDocuments(args: {
    signal?: AbortSignal;
    onEvent?: (event: DocumentWatchEvent) => void;
  }): Promise<void>;
  getDocumentAssetUrl(path: string): string;
};

export type AiKitClient = {
  readonly kind: 'ai-kit-client';
  readonly config: Readonly<AiKitClientConfig>;
  readonly documents: AiKitDocumentClient;
  listAgents(agentName?: string): Promise<AgentsListResult>;
  listSkills(
    params?: Record<string, unknown>,
    agentName?: string,
  ): Promise<SkillsListResult>;
  listConversations(limit?: number, agentName?: string): Promise<ConversationsListResult>;
  getConversation(sessionId: string, agentName?: string): Promise<ConversationsGetResult>;
  forkConversation(
    args: {
      sessionId: string;
      checkpointTurnIndex: number;
      agentId?: string;
    },
    agentName?: string,
  ): Promise<ConversationsForkResult>;
  deleteConversation(sessionId: string, agentName?: string): Promise<ConversationsDeleteResult>;
  getUsageSummary(period?: string, agentName?: string): Promise<UsageSummaryResult>;
  healthCheck(agentName?: string): Promise<HealthCheckResult>;
  runAgent(options: RunAgentOptions): Promise<AgentRunResult>;
  cancelAgentRun(options: CancelAgentRunOptions): Promise<CancelAgentRunResult>;
};
