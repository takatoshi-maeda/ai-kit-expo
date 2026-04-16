import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { resolveColors } from './colors';
import { CheckpointPanel } from './CheckpointPanel';
import { Composer } from './Composer';
import { ThreadDetail } from './ThreadDetail';
import type { ThreadPaneProps } from './types';

export function ThreadPane({
  title,
  navigation,
  headerAccessory,
  messages,
  elapsedSeconds,
  onSubmit,
  onAbort,
  isSubmitting,
  colors,
  placeholder,
  allowImageAttachments,
  composerAccessory,
  runtimeControls,
  pathMentions,
  onCopyMessage,
  onOpenArtifactPath,
  onCopyAll,
  showCopyButton = true,
  showHistoryButton = false,
  isHistoryOpen = false,
  canUseHistory = true,
  isHistoryLoading = false,
  historyItems = [],
  selectedSessionId,
  onToggleHistory,
  onSelectHistorySession,
  onComposeNew,
  newSessionLabel = 'New Chat',
  checkpoint,
}: ThreadPaneProps): ReactElement {
  const palette = resolveColors(colors);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);

  useEffect(() => {
    if (!navigation) {
      setIsNavigationOpen(false);
    }
  }, [navigation]);

  useEffect(() => {
    if (isHistoryOpen) {
      setIsNavigationOpen(false);
    }
  }, [isHistoryOpen]);

  return (
    <View style={styles.container}>
      {title || navigation ? (
        <View style={[styles.header, { borderBottomColor: palette.sidebarBorder }]}>
          {navigation ? (
            <Pressable
              style={styles.navigationButton}
              onPress={() => setIsNavigationOpen((value) => !value)}
              hitSlop={8}
            >
              <View style={styles.navigationLabelWrap}>
                <Text style={[styles.navigationLabel, { color: palette.text }]} numberOfLines={1}>
                  {navigation.label}
                </Text>
              </View>
              <Ionicons
                name={isNavigationOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={palette.icon}
              />
            </Pressable>
          ) : (
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {title}
            </Text>
          )}
          <View style={styles.headerActions}>
            {showCopyButton && onCopyAll ? (
              <Pressable onPress={() => void onCopyAll()} hitSlop={8}>
                <Ionicons name="copy-outline" size={20} color={palette.icon} />
              </Pressable>
            ) : null}
            {showHistoryButton ? (
              <Pressable
                onPress={onToggleHistory}
                hitSlop={8}
                disabled={!canUseHistory}
                style={!canUseHistory ? styles.disabledButton : undefined}
              >
                <Ionicons name={isHistoryOpen ? 'time' : 'time-outline'} size={20} color={palette.icon} />
              </Pressable>
            ) : null}
            {headerAccessory}
          </View>
        </View>
      ) : null}
      {navigation && isNavigationOpen ? (
        <>
          <Pressable style={styles.navigationDismissLayer} onPress={() => setIsNavigationOpen(false)} />
          <View
            style={[
              styles.navigationPanel,
              { backgroundColor: palette.sidebarBg, borderColor: palette.sidebarBorder },
            ]}
          >
            <ScrollView style={styles.navigationList} contentContainerStyle={styles.navigationListContent}>
              {navigation.items.map((item) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.navigationItem,
                    navigation.selectedKey === item.key && { backgroundColor: palette.sidebarSelectedBg },
                  ]}
                  onPress={() => {
                    setIsNavigationOpen(false);
                    navigation.onSelect(item.key);
                  }}
                >
                  <View style={styles.navigationItemText}>
                    <Text style={[styles.navigationItemLabel, { color: palette.text }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                  {navigation.selectedKey === item.key ? (
                    <Ionicons name="checkmark" size={16} color={palette.tint} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      ) : null}
      {showHistoryButton && isHistoryOpen ? (
        <>
          <Pressable style={styles.historyDismissLayer} onPress={onToggleHistory} />
          <View style={[styles.historyPanel, { backgroundColor: palette.sidebarBg, borderColor: palette.sidebarBorder }]}>
            {onComposeNew ? (
              <Pressable
                style={[
                  styles.historyItem,
                  selectedSessionId === 'new' && { backgroundColor: palette.sidebarSelectedBg },
                ]}
                onPress={onComposeNew}
              >
                <Ionicons name="create-outline" size={16} color={palette.icon} />
                <Text style={[styles.historyItemText, { color: palette.text }]} numberOfLines={1}>
                  {newSessionLabel}
                </Text>
              </Pressable>
            ) : null}
            {isHistoryLoading ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator size="small" color={palette.icon} />
              </View>
            ) : (
              <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent}>
                {historyItems.map((item) => (
                  <Pressable
                    key={item.sessionId}
                    style={[
                      styles.historyItem,
                      selectedSessionId === item.sessionId && { backgroundColor: palette.sidebarSelectedBg },
                    ]}
                    onPress={() => onSelectHistorySession?.(item.sessionId)}
                  >
                    <Ionicons name="chatbox-ellipses-outline" size={16} color={palette.icon} />
                    <Text style={[styles.historyItemText, { color: palette.text }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
                {historyItems.length === 0 ? (
                  <Text style={[styles.historyEmptyText, { color: palette.icon }]}>No history.</Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        </>
      ) : null}
      <ThreadDetail
        messages={messages}
        elapsedSeconds={elapsedSeconds}
        colors={palette}
        onCopyMessage={onCopyMessage}
        onOpenArtifactPath={onOpenArtifactPath}
      />
      <Composer
        onSubmit={onSubmit}
        onAbort={onAbort}
        isSubmitting={isSubmitting}
        colors={palette}
        placeholder={placeholder}
        allowImageAttachments={allowImageAttachments}
        composerAccessory={composerAccessory}
        runtimeControls={runtimeControls}
        pathMentions={pathMentions}
      />
      {checkpoint?.visible ? (
        <CheckpointPanel
          candidates={checkpoint.candidates}
          selectionIndex={checkpoint.selectionIndex}
          onSelect={checkpoint.onSelect}
          onApply={checkpoint.onApply}
          onCancel={checkpoint.onCancel}
          colors={palette}
          formatTimestamp={checkpoint.formatTimestamp}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  navigationButton: {
    flex: 1,
    minHeight: 32,
    maxWidth: 220,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    marginRight: 12,
  },
  navigationLabelWrap: {
    flex: 1,
    minWidth: 0,
  },
  navigationLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navigationPanel: {
    position: 'absolute',
    top: 58,
    left: 16,
    width: 280,
    maxHeight: 280,
    borderWidth: 1,
    borderRadius: 8,
    zIndex: 20,
    overflow: 'hidden',
  },
  navigationDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  navigationList: {
    maxHeight: 280,
  },
  navigationListContent: {
    paddingVertical: 6,
  },
  navigationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  navigationItemText: {
    flex: 1,
    minWidth: 0,
  },
  navigationItemLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  historyPanel: {
    position: 'absolute',
    top: 58,
    right: 16,
    width: 320,
    maxHeight: 280,
    borderWidth: 1,
    borderRadius: 10,
    zIndex: 20,
    overflow: 'hidden',
  },
  historyDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  historyLoading: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyList: {
    maxHeight: 232,
  },
  historyListContent: {
    paddingBottom: 6,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  historyItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  historyEmptyText: {
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  disabledButton: {
    opacity: 0.45,
  },
});
