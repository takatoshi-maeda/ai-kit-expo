import type { ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveColors } from './colors';
import { formatTimestampForDisplay } from './format';
import type { CheckpointPanelProps } from './types';

export function CheckpointPanel({
  candidates,
  selectionIndex,
  onSelect,
  onApply,
  onCancel,
  colors: colorOverrides,
  formatTimestamp = formatTimestampForDisplay,
}: CheckpointPanelProps): ReactElement {
  const colors = resolveColors(colorOverrides);

  return (
    <View style={[styles.overlay, { backgroundColor: `${colors.background}F2` }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>チェックポイント選択</Text>
        <Text style={[styles.subtitle, { color: colors.icon }]}>巻き戻し先を選択してください</Text>
      </View>
      <FlatList
        data={candidates}
        keyExtractor={(_, index) => String(index)}
        style={styles.list}
        renderItem={({ item, index }) => {
          const isSelected = index === selectionIndex;
          return (
            <Pressable
              style={[
                styles.candidate,
                isSelected && { backgroundColor: `${colors.tint}22` },
                { borderColor: `${colors.icon}33` },
              ]}
              onPress={() => onSelect(index)}
            >
              <Text style={[styles.candidateLabel, { color: isSelected ? colors.tint : colors.text }]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.candidateTime, { color: colors.icon }]}>
                {formatTimestamp(item.rawTimestamp)}
              </Text>
            </Pressable>
          );
        }}
      />
      <View style={styles.actions}>
        <Pressable style={[styles.cancelButton, { borderColor: `${colors.icon}33` }]} onPress={onCancel}>
          <Text style={[styles.cancelText, { color: colors.text }]}>キャンセル</Text>
        </Pressable>
        <Pressable style={[styles.applyButton, { backgroundColor: colors.tint }]} onPress={onApply}>
          <Text style={styles.applyText}>適用</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  list: {
    flex: 1,
  },
  candidate: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  candidateLabel: {
    fontSize: 15,
    flex: 1,
  },
  candidateTime: {
    fontSize: 12,
    flexShrink: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  applyButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  applyText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
