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
  agentRun: string;
  conversationList: string;
  conversationGet: string;
  conversationDelete: string;
  documentTree: string;
  documentFileGet: string;
  documentFileSave: string;
  documentWatch: string;
  usageGet: string;
  healthGet: string;
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
};

export type AiKitClientConfig = AiKitInjectedDependencies & {
  baseUrl: string;
  defaultAgentName?: string;
  protocolVersion?: string;
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

export type ConversationsGetResult = {
  sessionId: string;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  agentName?: string | null;
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

export type UsageSummaryResult = {
  period: string;
  cost?: { totalUsd?: number };
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

export type AgentStreamPayload = {
  type: string;
  [key: string]: unknown;
};

export type AgentInputItem =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'image'; source: { type: 'base64'; mediaType: string; data: string } };

export type RunAgentOptions = {
  message?: string;
  input?: AgentInputItem[];
  sessionId?: string | null;
  agentName?: string | null;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
  onStreamEvent?: (payload: AgentStreamPayload) => void;
};

export type AiKitDocumentClient = {
  readonly kind: 'ai-kit-document-client';
  readonly config: Readonly<AiKitDocumentClientConfig>;
};

export type AiKitClient = {
  readonly kind: 'ai-kit-client';
  readonly config: Readonly<AiKitClientConfig>;
  readonly documents: AiKitDocumentClient;
  listConversations(limit?: number, agentName?: string): Promise<ConversationsListResult>;
  getConversation(sessionId: string, agentName?: string): Promise<ConversationsGetResult>;
  deleteConversation(sessionId: string, agentName?: string): Promise<ConversationsDeleteResult>;
  getUsageSummary(period?: string, agentName?: string): Promise<UsageSummaryResult>;
  healthCheck(agentName?: string): Promise<HealthCheckResult>;
  runAgent(options: RunAgentOptions): Promise<AgentRunResult>;
};
