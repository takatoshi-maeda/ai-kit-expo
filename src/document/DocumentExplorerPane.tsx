import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DocumentTreeNode } from '../client';
import { resolveDocumentColors } from './colors';
import type { DocumentExplorerPaneProps } from './types';

function iconNameForNode(node: DocumentTreeNode): keyof typeof Ionicons.glyphMap {
  if (node.kind === 'folder') {
    return 'folder-open-outline';
  }
  if (node.language === 'markdown') {
    return 'document-text-outline';
  }
  if (node.language === 'python') {
    return 'logo-python';
  }
  if (node.language === 'image') {
    return 'image-outline';
  }
  if (node.language === 'video') {
    return 'videocam-outline';
  }
  if (node.language === 'pdf') {
    return 'document-attach-outline';
  }
  return 'document-outline';
}

type TreeRowProps = Omit<DocumentExplorerPaneProps, 'tree'> & {
  node: DocumentTreeNode;
  depth: number;
};

function TreeRow({
  node,
  depth,
  selectedTreeNodeId,
  collapsedFolderIds,
  onSelectTreeNode,
  onToggleFolder,
  colors: colorsProp,
}: TreeRowProps) {
  const colors = resolveDocumentColors(colorsProp);
  const isSelected = selectedTreeNodeId === node.id;
  const isCollapsed = node.kind === 'folder' && collapsedFolderIds.has(node.id);

  return (
    <View>
      <Pressable
        onPress={() => {
          onSelectTreeNode(node);
          if (node.kind === 'folder') {
            onToggleFolder(node);
          }
        }}
        style={[
          styles.treeRow,
          { paddingLeft: 14 + depth * 16 },
          isSelected && { backgroundColor: colors.surfaceSelected, borderColor: colors.tint },
        ]}
      >
        {node.kind === 'folder' ? (
          <Ionicons
            name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
            size={12}
            color={colors.mutedText}
          />
        ) : (
          <View style={styles.chevronSpacer} />
        )}
        <Ionicons
          name={iconNameForNode(node)}
          size={14}
          color={node.kind === 'folder' ? colors.mutedText : colors.tint}
        />
        <Text style={[styles.treeLabel, { color: colors.text }]} numberOfLines={1}>
          {node.name}
        </Text>
      </Pressable>
      {node.kind === 'folder' && !isCollapsed
        ? (node.children ?? []).map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedTreeNodeId={selectedTreeNodeId}
              collapsedFolderIds={collapsedFolderIds}
              onSelectTreeNode={onSelectTreeNode}
              onToggleFolder={onToggleFolder}
              colors={colors}
            />
          ))
        : null}
    </View>
  );
}

export function DocumentExplorerPane({
  tree,
  selectedTreeNodeId,
  collapsedFolderIds,
  onSelectTreeNode,
  onToggleFolder,
  colors: colorsProp,
}: DocumentExplorerPaneProps) {
  const colors = resolveDocumentColors(colorsProp);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <View style={[styles.header, { borderBottomColor: colors.surfaceBorder }]}>
        <Text style={[styles.title, { color: colors.text }]}>Explorer</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View>
          {tree.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              selectedTreeNodeId={selectedTreeNodeId}
              collapsedFolderIds={collapsedFolderIds}
              onSelectTreeNode={onSelectTreeNode}
              onToggleFolder={onToggleFolder}
              colors={colors}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    paddingVertical: 12,
  },
  treeRow: {
    minHeight: 32,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderLeftWidth: 2,
    borderColor: 'transparent',
  },
  chevronSpacer: {
    width: 12,
    height: 12,
  },
  treeLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
