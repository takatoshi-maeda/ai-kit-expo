import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { resolveColors } from './colors';
import { CheckpointPanel } from './CheckpointPanel';
import { Composer } from './Composer';
import { ThreadDetail } from './ThreadDetail';
import type { ThreadPaneProps } from './types';

export function ThreadPane({
  title,
  messages,
  elapsedSeconds,
  onSubmit,
  onAbort,
  isSubmitting,
  colors,
  placeholder,
  allowImageAttachments,
  onCopyMessage,
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

  return (
    <View style={styles.container}>
      {title ? (
        <View style={[styles.header, { borderBottomColor: palette.sidebarBorder }]}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
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
          </View>
        </View>
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
      />
      <Composer
        onSubmit={onSubmit}
        onAbort={onAbort}
        isSubmitting={isSubmitting}
        colors={palette}
        placeholder={placeholder}
        allowImageAttachments={allowImageAttachments}
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
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
