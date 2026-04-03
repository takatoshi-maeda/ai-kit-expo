import type {
  AiKitDocumentClient,
  DocumentFileResult,
  DocumentLanguage,
  DocumentTreeNode,
} from '../client';

export type {
  DocumentActor,
  DocumentFileResult,
  DocumentLanguage,
  DocumentTreeNode,
  DocumentTreeResult,
  DocumentWatchEvent,
  SaveDocumentFileArgs,
} from '../client';

export type DocumentWorkspaceClient = Pick<
  AiKitDocumentClient,
  | 'listDocumentsTree'
  | 'getDocumentFile'
  | 'saveDocumentFile'
  | 'watchDocuments'
  | 'getDocumentAssetUrl'
> & {
  config?: Pick<AiKitDocumentClient['config'], 'themeTokens'>;
};

export type DocumentEditorViewMode = 'edit' | 'preview';

export type DocumentWorkspaceProps = {
  client?: DocumentWorkspaceClient;
  rootPath?: string;
};

export type DocumentExplorerPaneProps = {
  tree: DocumentTreeNode[];
  selectedTreeNodeId: string | null;
  collapsedFolderIds: ReadonlySet<string>;
  onSelectTreeNode: (node: DocumentTreeNode) => void;
  onToggleFolder: (node: DocumentTreeNode) => void;
  colors?: DocumentUiColors;
};

export type DocumentEditorPaneProps = {
  openTabs: DocumentTreeNode[];
  activeTabId: string | null;
  activeFile: DocumentTreeNode | null;
  draft: string;
  assetUrl: string | null;
  conflictMessage?: string | null;
  dirtyTabIds: ReadonlySet<string>;
  viewMode: DocumentEditorViewMode;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onChangeDraft: (next: string) => void;
  onChangeViewMode: (next: DocumentEditorViewMode) => void;
  colors?: DocumentUiColors;
};

export type DocumentFilePreviewProps = {
  assetUrl: string | null;
  language: DocumentLanguage;
  colors?: DocumentUiColors;
};

export type DocumentMarkdownPreviewProps = {
  content: string;
  colors?: DocumentUiColors;
};

export type DocumentWorkspaceState = {
  tree: DocumentTreeNode[];
  collapsedFolderIds: ReadonlySet<string>;
  selectedTreeNodeId: string | null;
  openTabs: DocumentTreeNode[];
  activeTabId: string | null;
  activeFile: DocumentTreeNode | null;
  activeDraft: string;
  activeAssetUrl: string | null;
  dirtyTabIds: ReadonlySet<string>;
  viewMode: DocumentEditorViewMode;
  isLoadingTree: boolean;
  errorMessage: string | null;
  conflictMessage: string | null;
};

export type DocumentWorkspaceActions = {
  selectTreeNode: (node: DocumentTreeNode) => void;
  toggleFolder: (node: DocumentTreeNode) => void;
  selectTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  changeDraft: (next: string) => void;
  changeViewMode: (next: DocumentEditorViewMode) => void;
};

export type DocumentUiColors = {
  text?: string;
  mutedText?: string;
  background?: string;
  surface?: string;
  surfaceBorder?: string;
  surfaceSelected?: string;
  tint?: string;
  error?: string;
  editorSurface?: string;
};

export type UseDocumentWorkspaceResult = {
  state: DocumentWorkspaceState;
  actions: DocumentWorkspaceActions;
  colors: Required<DocumentUiColors>;
  activeFileDetails: DocumentFileResult | null;
};
