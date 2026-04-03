import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DocumentTreeNode } from '../client';
import { resolveDocumentColors } from './colors';
import { DocumentCodeEditor } from './DocumentCodeEditor';
import { DocumentFilePreview } from './DocumentFilePreview';
import { DocumentMarkdownPreview } from './DocumentMarkdownPreview';
import { isBinaryPreviewLanguage } from './helpers';
import type { DocumentEditorPaneProps } from './types';

function iconNameForNode(node: DocumentTreeNode): keyof typeof Ionicons.glyphMap {
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

export function DocumentEditorPane({
  openTabs,
  activeTabId,
  activeFile,
  draft,
  assetUrl,
  conflictMessage,
  dirtyTabIds,
  viewMode,
  onSelectTab,
  onCloseTab,
  onChangeDraft,
  onChangeViewMode,
  colors: colorsProp,
}: DocumentEditorPaneProps) {
  const colors = resolveDocumentColors(colorsProp);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [hoveredCloseTabId, setHoveredCloseTabId] = useState<string | null>(null);
  const isBinary = isBinaryPreviewLanguage(activeFile?.language);
  const canPreviewMarkdown = activeFile?.language === 'markdown';

  if (!activeFile) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Select a file</Text>
        <Text style={[styles.emptyBody, { color: colors.mutedText }]}>
          Open a document from the explorer to start editing.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabStrip, { borderBottomColor: colors.surfaceBorder }]}
        contentContainerStyle={styles.tabStripContent}
      >
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isHovered = hoveredTabId === tab.id;
          const isCloseHovered = hoveredCloseTabId === tab.id;
          const isCloseVisible = isHovered || isCloseHovered;
          const isDirty = dirtyTabIds.has(tab.id);
          return (
            <Pressable
              key={tab.id}
              onPress={() => onSelectTab(tab.id)}
              onHoverIn={() => setHoveredTabId(tab.id)}
              onHoverOut={() => setHoveredTabId((current) => (current === tab.id ? null : current))}
              style={[
                styles.tabButton,
                { borderRightColor: colors.surfaceBorder },
                isActive && { backgroundColor: colors.surfaceSelected, borderBottomColor: colors.tint },
              ]}
            >
              <Text style={[styles.dirtyIndicator, { color: isDirty ? colors.tint : 'transparent' }]}>*</Text>
              <Ionicons
                name={iconNameForNode(tab)}
                size={14}
                color={isActive ? colors.tint : colors.mutedText}
              />
              <Text style={[styles.tabText, { color: isActive ? colors.text : colors.mutedText }]} numberOfLines={1}>
                {tab.name}
              </Text>
              <Pressable
                onPress={() => onCloseTab(tab.id)}
                onHoverIn={() => setHoveredCloseTabId(tab.id)}
                onHoverOut={() => setHoveredCloseTabId((current) => (current === tab.id ? null : current))}
                hitSlop={8}
                style={[styles.closeButton, !isCloseVisible && styles.closeButtonHidden]}
              >
                <Ionicons name="close" size={14} color={colors.mutedText} />
              </Pressable>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.toolbar, { borderBottomColor: colors.surfaceBorder }]}>
        <Text style={[styles.toolbarTitle, { color: colors.text }]} numberOfLines={1}>
          {activeFile.path}
        </Text>
        {canPreviewMarkdown ? (
          <View style={styles.modeToggle}>
            {(['preview', 'edit'] as const).map((mode) => {
              const isActive = viewMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => onChangeViewMode(mode)}
                  style={[
                    styles.modeButton,
                    {
                      backgroundColor: isActive ? colors.tint : colors.surface,
                      borderColor: isActive ? colors.tint : colors.surfaceBorder,
                    },
                  ]}
                >
                  <Text style={[styles.modeButtonText, { color: isActive ? colors.surface : colors.text }]}>
                    {mode === 'preview' ? 'Preview' : 'Edit'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {conflictMessage ? (
        <View style={[styles.conflictBanner, { borderBottomColor: colors.surfaceBorder, backgroundColor: `${colors.error}12` }]}>
          <Text style={[styles.conflictText, { color: colors.error }]} numberOfLines={2}>
            {conflictMessage}
          </Text>
        </View>
      ) : null}

      <View style={styles.editorBody}>
        {isBinary ? (
          <DocumentFilePreview assetUrl={assetUrl} language={activeFile.language ?? 'binary'} colors={colors} />
        ) : viewMode === 'preview' && canPreviewMarkdown ? (
          <DocumentMarkdownPreview content={draft} colors={colors} />
        ) : (
          <DocumentCodeEditor
            value={draft}
            onChange={onChangeDraft}
            language={activeFile.language ?? 'text'}
            colors={colors}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyContainer: {
    flex: 1,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  tabStrip: {
    height: 43,
    borderBottomWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabStripContent: {
    flexGrow: 0,
  },
  tabButton: {
    minWidth: 140,
    maxWidth: 220,
    height: 43,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    borderRightWidth: 1,
  },
  tabText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  dirtyIndicator: {
    width: 8,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  closeButton: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonHidden: {
    opacity: 0,
  },
  toolbar: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toolbarTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 999,
    justifyContent: 'center',
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  conflictBanner: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  conflictText: {
    fontSize: 12,
    fontWeight: '600',
  },
  editorBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
});
