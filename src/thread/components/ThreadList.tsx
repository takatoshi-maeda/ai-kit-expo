import type { ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { resolveColors } from './colors';
import { formatShortTime, formatTimestampForDisplay } from './format';
import type { ThreadListItem, ThreadListProps } from './types';

function getAvatarColor(sessionId: string, status: ThreadListItem['status'], colors: ReturnType<typeof resolveColors>): string {
  if (status === 'progress') return colors.avatarUser;
  let hash = 0;
  for (let i = 0; i < sessionId.length; i += 1) {
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  }
  const palette = [colors.avatarUser, colors.avatarBlue, colors.avatarPurple, colors.avatarRed, colors.avatarOrange];
  return palette[Math.abs(hash) % palette.length];
}

export function ThreadList({
  items,
  isLoading,
  onSelect,
  onRefresh,
  onCompose,
  headerAccessory,
  selectedSessionId,
  colors: colorOverrides,
  emptyTitle = 'スレッドがありません',
  emptyHint = '新規作成ボタンで会話を始めましょう',
}: ThreadListProps): ReactElement {
  const colors = resolveColors(colorOverrides);
  const isSidebar = onCompose != null;

  return (
    <View style={styles.container}>
      {isSidebar ? (
        <View style={styles.sidebarHeader}>
          <View>{headerAccessory}</View>
          <View style={styles.sidebarHeaderRight}>
            <Text style={[styles.countText, { color: colors.sidebarHeaderText }]}>{items.length}</Text>
            <Pressable onPress={onCompose} hitSlop={8}>
              <Ionicons name="create-outline" size={20} color={colors.tint} />
            </Pressable>
          </View>
        </View>
      ) : null}
      {isSidebar && items.length > 0 ? (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: colors.sidebarHeaderText }]}>TODAY</Text>
          <Text style={[styles.sectionCount, { color: colors.sidebarHeaderText }]}>{items.length}</Text>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.sessionId}
        renderItem={({ item }) => {
          const isSelected = selectedSessionId === item.sessionId;
          const isRunning = item.status === 'progress';
          const avatarColor = getAvatarColor(item.sessionId, item.status, colors);

          return (
            <Pressable
              style={({ pressed }) => [
                itemStyles.container,
                !isSidebar && {
                  borderBottomColor: colors.border,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
                isSelected && { backgroundColor: colors.sidebarSelectedBg },
                pressed && !isSelected && itemStyles.pressed,
              ]}
              onPress={() => onSelect(item.sessionId)}
            >
              <View style={itemStyles.row}>
                <View style={[itemStyles.avatar, { backgroundColor: avatarColor }]} />
                <View style={itemStyles.content}>
                  <View style={itemStyles.topRow}>
                    <Text style={[itemStyles.subject, { color: colors.text }]} numberOfLines={1}>
                      {item.subject}
                    </Text>
                    <Text style={[itemStyles.time, { color: colors.icon }]}>
                      {isSidebar ? formatShortTime(item.updatedAt) : formatTimestampForDisplay(item.updatedAt)}
                    </Text>
                  </View>
                  <Text style={[itemStyles.preview, { color: colors.icon }]} numberOfLines={1}>
                    {item.preview}
                  </Text>
                  <View style={itemStyles.badges}>
                    <View style={[itemStyles.badge, { backgroundColor: colors.badgeBg }]}>
                      <Text style={[itemStyles.badgeText, { color: colors.badgeText }]}>
                        {item.turnCount} {item.turnCount === 1 ? 'TURN' : 'TURNS'}
                      </Text>
                    </View>
                    {isRunning ? (
                      <View style={[itemStyles.badge, { backgroundColor: colors.runningBadgeBg }]}>
                        <Text style={[itemStyles.badgeText, { color: colors.runningBadgeText }]}>RUNNING</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.icon }]}>{emptyTitle}</Text>
              <Text style={[styles.emptyHint, { color: colors.icon }]}>{emptyHint}</Text>
            </View>
          )
        }
        refreshing={isLoading}
        onRefresh={onRefresh}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sidebarHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
  },
});

const itemStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  subject: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    fontSize: 12,
    flexShrink: 0,
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
