import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContext } from 'react';

import type { DocumentActor, DocumentFileResult, DocumentTreeNode, DocumentWatchEvent } from '../client';
import { AiKitRuntimeContext } from '../runtime/context';
import { resolveDocumentColors } from './colors';
import {
  collectInitiallyCollapsedFolderIds,
  createDocumentActorId,
  filterTreeByRootPath,
  findDefaultDocumentFileId,
  flattenTree,
  isBinaryPreviewLanguage,
} from './helpers';
import type {
  DocumentEditorViewMode,
  DocumentUiColors,
  DocumentWorkspaceClient,
  UseDocumentWorkspaceResult,
} from './types';

const SAVE_DEBOUNCE_MS = 700;

type Options = {
  client?: DocumentWorkspaceClient;
  rootPath?: string;
  colors?: DocumentUiColors;
};

export function useDocumentWorkspace({ client: clientProp, rootPath, colors }: Options = {}): UseDocumentWorkspaceResult {
  const runtime = useContext(AiKitRuntimeContext);
  const client = clientProp ?? runtime?.documents;
  if (!client) {
    throw new Error('DocumentWorkspace requires a document client or AiKitProvider.');
  }
  const actorRef = useRef<DocumentActor>({ type: 'user', id: createDocumentActorId() });
  const [tree, setTree] = useState<DocumentTreeNode[]>([]);
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState<string | null>(null);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [draftByFileId, setDraftByFileId] = useState<Record<string, string>>({});
  const [versionByFileId, setVersionByFileId] = useState<Record<string, string>>({});
  const [fileDetailsByFileId, setFileDetailsByFileId] = useState<Record<string, DocumentFileResult>>({});
  const [dirtyByFileId, setDirtyByFileId] = useState<Record<string, boolean>>({});
  const [loadedByFileId, setLoadedByFileId] = useState<Record<string, boolean>>({});
  const [savingByFileId, setSavingByFileId] = useState<Record<string, boolean>>({});
  const [conflictedByFileId, setConflictedByFileId] = useState<Record<string, boolean>>({});
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DocumentEditorViewMode>('edit');
  const dirtyByFileIdRef = useRef<Record<string, boolean>>({});
  const hasAppliedInitialFolderCollapseRef = useRef(false);

  const resolvedColors = useMemo(
    () => resolveDocumentColors(colors, client.config?.themeTokens),
    [client.config, colors],
  );

  const visibleTree = useMemo(() => filterTreeByRootPath(tree, rootPath), [rootPath, tree]);
  const allNodes = useMemo(() => flattenTree(visibleTree), [visibleTree]);
  const fileNodes = useMemo(
    () => allNodes.filter((node): node is DocumentTreeNode => node.kind === 'file'),
    [allNodes],
  );
  const nodeById = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes]);
  const openTabs = useMemo(
    () =>
      openTabIds
        .map((id) => nodeById.get(id))
        .filter((node): node is DocumentTreeNode => node?.kind === 'file'),
    [nodeById, openTabIds],
  );
  const activeFile = activeTabId ? nodeById.get(activeTabId) ?? null : null;
  const activeFileDetails = activeFile?.kind === 'file' ? fileDetailsByFileId[activeFile.id] ?? null : null;
  const activeDraft = activeFile?.kind === 'file' ? draftByFileId[activeFile.id] ?? '' : '';
  const activeAssetUrl =
    activeFile?.kind === 'file' && isBinaryPreviewLanguage(activeFile.language)
      ? client.getDocumentAssetUrl(activeFile.id)
      : null;
  const conflictMessage =
    activeFile?.kind === 'file' && conflictedByFileId[activeFile.id]
      ? 'Remote changes were detected. Reload the file or save again after reviewing your draft.'
      : null;

  const refreshTree = useCallback(async () => {
    const payload = await client.listDocumentsTree();
    const nextTree = payload.root;
    setTree(nextTree);
    if (!hasAppliedInitialFolderCollapseRef.current) {
      setCollapsedFolderIds(collectInitiallyCollapsedFolderIds(nextTree));
      hasAppliedInitialFolderCollapseRef.current = true;
    }
    const allNextIds = new Set(flattenTree(filterTreeByRootPath(nextTree, rootPath)).map((node) => node.id));
    setOpenTabIds((previous) => previous.filter((id) => allNextIds.has(id)));
  }, [client, rootPath]);

  const loadFile = useCallback(
    async (fileId: string, options?: { preserveDraft?: boolean }) => {
      const payload = await client.getDocumentFile(fileId);
      setFileDetailsByFileId((previous) => ({ ...previous, [fileId]: payload }));
      setVersionByFileId((previous) => ({ ...previous, [fileId]: payload.version }));
      setLoadedByFileId((previous) => ({ ...previous, [fileId]: true }));
      setConflictedByFileId((previous) => ({ ...previous, [fileId]: false }));
      if (!options?.preserveDraft) {
        setDraftByFileId((previous) => ({ ...previous, [fileId]: payload.content ?? '' }));
        setDirtyByFileId((previous) => ({ ...previous, [fileId]: false }));
      }
    },
    [client],
  );

  const saveFile = useCallback(
    async (fileId: string) => {
      try {
        setSavingByFileId((previous) => ({ ...previous, [fileId]: true }));
        const payload = await client.saveDocumentFile({
          path: fileId,
          content: draftByFileId[fileId] ?? '',
          baseVersion: versionByFileId[fileId] ?? null,
          actor: actorRef.current,
        });
        setFileDetailsByFileId((previous) => ({ ...previous, [fileId]: payload }));
        setDraftByFileId((previous) => ({ ...previous, [fileId]: payload.content ?? '' }));
        setVersionByFileId((previous) => ({ ...previous, [fileId]: payload.version }));
        setDirtyByFileId((previous) => ({ ...previous, [fileId]: false }));
        setConflictedByFileId((previous) => ({ ...previous, [fileId]: false }));
        setErrorMessage(null);
      } catch (error) {
        setConflictedByFileId((previous) => ({ ...previous, [fileId]: true }));
        setErrorMessage(error instanceof Error ? error.message : 'Failed to save document.');
      } finally {
        setSavingByFileId((previous) => ({ ...previous, [fileId]: false }));
      }
    },
    [client, draftByFileId, versionByFileId],
  );

  useEffect(() => {
    dirtyByFileIdRef.current = dirtyByFileId;
  }, [dirtyByFileId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setIsLoadingTree(true);
        await refreshTree();
        if (!cancelled) {
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load documents.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTree(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTree]);

  useEffect(() => {
    if (selectedTreeNodeId || fileNodes.length === 0) {
      return;
    }
    const defaultFileId = findDefaultDocumentFileId(visibleTree, collapsedFolderIds);
    setSelectedTreeNodeId(defaultFileId);
    setActiveTabId(defaultFileId);
    setOpenTabIds(defaultFileId ? [defaultFileId] : []);
  }, [collapsedFolderIds, fileNodes.length, selectedTreeNodeId, visibleTree]);

  useEffect(() => {
    const activeFileId = activeFile?.kind === 'file' ? activeFile.id : null;
    if (!activeFileId || loadedByFileId[activeFileId]) {
      return;
    }
    void loadFile(activeFileId).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load document.');
    });
  }, [activeFile, loadFile, loadedByFileId]);

  useEffect(() => {
    const fileId = activeFile?.kind === 'file' ? activeFile.id : null;
    if (!fileId || !dirtyByFileId[fileId] || !loadedByFileId[fileId] || conflictedByFileId[fileId]) {
      return;
    }
    if (activeFileDetails?.isBinary) {
      return;
    }

    const timer = setTimeout(() => {
      void saveFile(fileId);
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [activeFile, activeFileDetails, conflictedByFileId, dirtyByFileId, loadedByFileId, saveFile]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key.toLowerCase() !== 's') {
        return;
      }
      event.preventDefault();
      const fileId = activeFile?.kind === 'file' ? activeFile.id : null;
      if (!fileId || !loadedByFileId[fileId] || conflictedByFileId[fileId] || activeFileDetails?.isBinary) {
        return;
      }
      void saveFile(fileId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeFile, activeFileDetails, conflictedByFileId, loadedByFileId, saveFile]);

  useEffect(() => {
    const abort = new AbortController();
    const handleEvent = (event: DocumentWatchEvent) => {
      if (event.type === 'document.snapshot') {
        setTree(event.payload.root);
        return;
      }
      if (event.type === 'document.changed') {
        const updatedBySelf = event.payload.updatedBy?.id === actorRef.current.id;
        void refreshTree().catch(() => undefined);
        if (updatedBySelf) {
          return;
        }
        if (dirtyByFileIdRef.current[event.payload.path]) {
          setConflictedByFileId((previous) => ({ ...previous, [event.payload.path]: true }));
          return;
        }
        void loadFile(event.payload.path).catch(() => undefined);
        return;
      }
      if (event.type === 'document.deleted') {
        void refreshTree().catch(() => undefined);
        setDraftByFileId((previous) => {
          const next = { ...previous };
          delete next[event.payload.path];
          return next;
        });
        setVersionByFileId((previous) => {
          const next = { ...previous };
          delete next[event.payload.path];
          return next;
        });
        setFileDetailsByFileId((previous) => {
          const next = { ...previous };
          delete next[event.payload.path];
          return next;
        });
        setLoadedByFileId((previous) => {
          const next = { ...previous };
          delete next[event.payload.path];
          return next;
        });
        setDirtyByFileId((previous) => {
          const next = { ...previous };
          delete next[event.payload.path];
          return next;
        });
        setOpenTabIds((previous) => previous.filter((id) => id !== event.payload.path));
        setActiveTabId((previous) => (previous === event.payload.path ? null : previous));
        setSelectedTreeNodeId((previous) => (previous === event.payload.path ? null : previous));
        return;
      }
      if (event.type === 'document.error') {
        setErrorMessage(event.payload.message ?? 'Document watch failed.');
      }
    };

    void client.watchDocuments({
      signal: abort.signal,
      onEvent: handleEvent,
    }).catch((error) => {
      if (!abort.signal.aborted) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to watch documents.');
      }
    });

    return () => abort.abort();
  }, [client, loadFile, refreshTree]);

  const ensureTabOpen = useCallback((node: DocumentTreeNode) => {
    if (node.kind !== 'file') {
      return;
    }
    setOpenTabIds((previous) => (previous.includes(node.id) ? previous : [...previous, node.id]));
    setActiveTabId(node.id);
  }, []);

  const actions = useMemo(
    () => ({
      selectTreeNode(node: DocumentTreeNode) {
        setSelectedTreeNodeId(node.id);
        if (node.kind === 'file') {
          ensureTabOpen(node);
          if (node.language === 'markdown') {
            setViewMode('preview');
          } else {
            setViewMode('edit');
          }
        }
      },
      toggleFolder(node: DocumentTreeNode) {
        if (node.kind !== 'folder') {
          return;
        }
        setCollapsedFolderIds((previous) => {
          const next = new Set(previous);
          if (next.has(node.id)) {
            next.delete(node.id);
          } else {
            next.add(node.id);
          }
          return next;
        });
      },
      selectTab(tabId: string) {
        if (activeTabId && dirtyByFileId[activeTabId] && loadedByFileId[activeTabId] && !conflictedByFileId[activeTabId]) {
          void saveFile(activeTabId);
        }
        setActiveTabId(tabId);
        setSelectedTreeNodeId(tabId);
        const node = nodeById.get(tabId);
        setViewMode(node?.language === 'markdown' ? 'preview' : 'edit');
      },
      closeTab(tabId: string) {
        if (activeTabId && dirtyByFileId[activeTabId] && loadedByFileId[activeTabId] && !conflictedByFileId[activeTabId]) {
          void saveFile(activeTabId);
        }
        setOpenTabIds((previous) => {
          const next = previous.filter((tab) => tab !== tabId);
          if (activeTabId === tabId) {
            const fallback = next[next.length - 1] ?? null;
            setActiveTabId(fallback);
            setSelectedTreeNodeId(fallback);
          }
          return next;
        });
      },
      changeDraft(next: string) {
        if (!activeFile || activeFile.kind !== 'file') {
          return;
        }
        setDraftByFileId((previous) => ({ ...previous, [activeFile.id]: next }));
        setDirtyByFileId((previous) => ({ ...previous, [activeFile.id]: true }));
      },
      changeViewMode(next: DocumentEditorViewMode) {
        setViewMode(next);
      },
    }),
    [activeFile, activeTabId, conflictedByFileId, dirtyByFileId, ensureTabOpen, loadedByFileId, nodeById, saveFile],
  );

  const dirtyTabIds = useMemo(() => {
    const next = new Set<string>();
    for (const [fileId, isDirty] of Object.entries(dirtyByFileId)) {
      if (isDirty || savingByFileId[fileId]) {
        next.add(fileId);
      }
    }
    return next;
  }, [dirtyByFileId, savingByFileId]);

  return {
    state: {
      tree: visibleTree,
      collapsedFolderIds,
      selectedTreeNodeId,
      openTabs,
      activeTabId,
      activeFile: activeFile?.kind === 'file' ? activeFile : null,
      activeDraft,
      activeAssetUrl,
      dirtyTabIds,
      viewMode,
      isLoadingTree,
      errorMessage,
      conflictMessage,
    },
    actions,
    colors: resolvedColors,
    activeFileDetails,
  };
}
