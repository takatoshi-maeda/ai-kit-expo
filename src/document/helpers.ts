import type { DocumentTreeNode } from '../client';

export function flattenTree(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenTree(node.children) : [])]);
}

export function collectInitiallyCollapsedFolderIds(
  nodes: DocumentTreeNode[],
  depth: number = 0,
  collapsed: Set<string> = new Set(),
): Set<string> {
  for (const node of nodes) {
    if (node.kind !== 'folder') {
      continue;
    }
    if (depth >= 1) {
      collapsed.add(node.id);
    }
    if (node.children) {
      collectInitiallyCollapsedFolderIds(node.children, depth + 1, collapsed);
    }
  }
  return collapsed;
}

function findFirstVisibleFile(
  nodes: DocumentTreeNode[],
  collapsedFolderIds: ReadonlySet<string>,
): DocumentTreeNode | null {
  for (const node of nodes) {
    if (node.kind === 'file') {
      return node;
    }
    if (collapsedFolderIds.has(node.id)) {
      continue;
    }
    const childFile = findFirstVisibleFile(node.children ?? [], collapsedFolderIds);
    if (childFile) {
      return childFile;
    }
  }
  return null;
}

export function findDefaultDocumentFileId(
  nodes: DocumentTreeNode[],
  collapsedFolderIds: ReadonlySet<string>,
): string | null {
  const rootReadme = nodes.find((node) => node.kind === 'file' && node.path === 'README.md');
  if (rootReadme) {
    return rootReadme.id;
  }
  return findFirstVisibleFile(nodes, collapsedFolderIds)?.id ?? null;
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

export function filterTreeByRootPath(nodes: DocumentTreeNode[], rootPath?: string): DocumentTreeNode[] {
  if (!rootPath) {
    return nodes;
  }
  const normalizedRootPath = normalizePath(rootPath);
  const matchNode = (node: DocumentTreeNode): DocumentTreeNode | null => {
    const normalizedNodePath = normalizePath(node.path);
    if (normalizedNodePath === normalizedRootPath) {
      return node;
    }
    if (node.kind !== 'folder') {
      return null;
    }
    const children = (node.children ?? [])
      .map(matchNode)
      .filter((child): child is DocumentTreeNode => child !== null);
    if (children.length === 0) {
      return null;
    }
    return { ...node, children };
  };
  return nodes.map(matchNode).filter((node): node is DocumentTreeNode => node !== null);
}

export function createDocumentActorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `browser-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function isBinaryPreviewLanguage(language?: DocumentTreeNode['language']): boolean {
  return language === 'image' || language === 'video' || language === 'pdf' || language === 'binary';
}
