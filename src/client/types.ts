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
  protocolVersion?: string;
  clientInfo?: {
    name: string;
    version: string;
  };
};

export type AiKitDocumentClient = {
  readonly kind: 'ai-kit-document-client';
  readonly config: Readonly<AiKitDocumentClientConfig>;
};

export type AiKitClient = {
  readonly kind: 'ai-kit-client';
  readonly config: Readonly<AiKitClientConfig>;
  readonly documents: AiKitDocumentClient;
};
