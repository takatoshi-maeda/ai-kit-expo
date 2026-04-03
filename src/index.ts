export {
  createAiKitClient,
  createAiKitDocumentClient,
  DEFAULT_TOOL_NAMES,
} from './client';
export type {
  AiKitClient,
  AiKitClientConfig,
  AiKitDocumentClient,
  AiKitDocumentClientConfig,
  AiKitFetch,
  AiKitHeadersResolver,
  AiKitInjectedDependencies,
  AiKitStorageAdapter,
  AiKitThemeTokens,
  AiKitToolNameConfig,
} from './client';

export { AiKitProvider, useAiKitClient, useAiKitDocumentClient, useAiKitRuntime } from './runtime';
export type { AiKitProviderProps, AiKitRuntimeValue } from './runtime';

export { ThreadList, ThreadPane, useComposer, useThread, useThreadMessages } from './thread';
export type {
  ComposerState,
  ThreadListProps,
  ThreadMessagesState,
  ThreadPaneProps,
  ThreadState,
} from './thread';

export { DocumentWorkspace } from './document';
export type { DocumentWorkspaceProps } from './document';

export { McpConnectionOverlay, RunningIndicator } from './ui';
export type { McpConnectionOverlayProps, RunningIndicatorProps } from './ui';
