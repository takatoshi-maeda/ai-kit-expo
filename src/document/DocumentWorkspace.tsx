import { useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DocumentEditorPane } from './DocumentEditorPane';
import { DocumentExplorerPane } from './DocumentExplorerPane';
import { useDocumentWorkspace } from './useDocumentWorkspace';
import type { DocumentWorkspaceProps } from './types';

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1120;
const MOBILE_PANES = ['explorer', 'editor'] as const;

type MobilePane = (typeof MOBILE_PANES)[number];

export function DocumentWorkspace(props: DocumentWorkspaceProps): ReactElement {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const isTablet = width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT;
  const { state, actions, colors } = useDocumentWorkspace(props);

  return (
    <DocumentWorkspaceContent
      isMobile={isMobile}
      isTablet={isTablet}
      state={state}
      actions={actions}
      colors={colors}
    />
  );
}

function DocumentWorkspaceContent({
  isMobile,
  isTablet,
  state,
  actions,
  colors,
}: {
  isMobile: boolean;
  isTablet: boolean;
  state: ReturnType<typeof useDocumentWorkspace>['state'];
  actions: ReturnType<typeof useDocumentWorkspace>['actions'];
  colors: ReturnType<typeof useDocumentWorkspace>['colors'];
}) {
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor');

  const explorerPane = (
    <DocumentExplorerPane
      tree={state.tree}
      selectedTreeNodeId={state.selectedTreeNodeId}
      collapsedFolderIds={state.collapsedFolderIds}
      onSelectTreeNode={actions.selectTreeNode}
      onToggleFolder={actions.toggleFolder}
      colors={colors}
    />
  );

  const editorPane = (
    <DocumentEditorPane
      openTabs={state.openTabs}
      activeTabId={state.activeTabId}
      activeFile={state.activeFile}
      draft={state.activeDraft}
      assetUrl={state.activeAssetUrl}
      conflictMessage={state.conflictMessage}
      dirtyTabIds={state.dirtyTabIds}
      viewMode={state.viewMode}
      onSelectTab={actions.selectTab}
      onCloseTab={actions.closeTab}
      onChangeDraft={actions.changeDraft}
      onChangeViewMode={actions.changeViewMode}
      colors={colors}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {state.errorMessage ? (
        <View style={[styles.banner, { backgroundColor: colors.surface, borderBottomColor: colors.surfaceBorder }]}>
          <Text style={[styles.bannerText, { color: colors.text }]} numberOfLines={2}>
            {state.errorMessage}
          </Text>
        </View>
      ) : null}
      {state.isLoadingTree ? (
        <View style={styles.loadingState}>
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>Loading documents...</Text>
        </View>
      ) : isMobile ? (
        <View style={styles.mobileLayout}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mobileTabRow}
          >
            {MOBILE_PANES.map((pane) => {
              const isActive = mobilePane === pane;
              const label = pane === 'explorer' ? 'Explorer' : 'Editor';
              return (
                <Pressable
                  key={pane}
                  onPress={() => setMobilePane(pane)}
                  style={[
                    styles.mobileTabButton,
                    {
                      backgroundColor: isActive ? colors.tint : colors.surface,
                      borderColor: isActive ? colors.tint : colors.surfaceBorder,
                    },
                  ]}
                >
                  <Text style={[styles.mobileTabText, { color: isActive ? colors.surface : colors.text }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.mobilePane}>{mobilePane === 'explorer' ? explorerPane : editorPane}</View>
        </View>
      ) : (
        <View style={styles.desktopRow}>
          <View style={[styles.explorerColumn, isTablet ? styles.explorerColumnTablet : styles.explorerColumnDesktop]}>
            {explorerPane}
          </View>
          <View style={styles.editorColumn}>{editorPane}</View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  mobileLayout: {
    flex: 1,
  },
  mobileTabRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  mobileTabButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 999,
    justifyContent: 'center',
  },
  mobileTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  mobilePane: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    padding: 16,
  },
  explorerColumn: {
    minHeight: 0,
  },
  explorerColumnTablet: {
    width: 280,
  },
  explorerColumnDesktop: {
    width: 320,
  },
  editorColumn: {
    flex: 1,
    minHeight: 0,
  },
});
