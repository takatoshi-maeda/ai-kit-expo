export { createAiKitDocumentClient } from '../client';
export type { AiKitDocumentClient, AiKitDocumentClientConfig } from '../client';

export { DocumentEditorPane } from './DocumentEditorPane';
export { DocumentExplorerPane } from './DocumentExplorerPane';
export { DocumentFilePreview } from './DocumentFilePreview';
export { DocumentMarkdownPreview } from './DocumentMarkdownPreview';
export { DocumentWorkspace } from './DocumentWorkspace';
export { buildBreadcrumbSegments, resolveDocumentLink } from './navigation';
export { useDocumentWorkspace } from './useDocumentWorkspace';
export type {
  DocumentEditorPaneProps,
  DocumentEditorViewMode,
  DocumentExplorerPaneProps,
  DocumentFilePreviewProps,
  DocumentMarkdownPreviewProps,
  DocumentUiColors,
  DocumentWorkspaceActions,
  DocumentWorkspaceClient,
  DocumentWorkspaceProps,
  DocumentWorkspaceState,
  UseDocumentWorkspaceResult,
} from './types';
export type { BreadcrumbSegment, ResolvedDocumentLink } from './navigation';
