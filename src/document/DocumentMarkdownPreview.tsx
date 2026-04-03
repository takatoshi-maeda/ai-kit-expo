import { ScrollView, StyleSheet, Text } from 'react-native';

import { resolveDocumentColors } from './colors';
import type { DocumentMarkdownPreviewProps } from './types';

export function DocumentMarkdownPreview({ content, colors: colorsProp }: DocumentMarkdownPreviewProps) {
  const colors = resolveDocumentColors(colorsProp);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.text, { color: colors.text }]}>{content}</Text>
      <Text style={[styles.note, { color: colors.mutedText }]}>
        Preview is plain text on this build. The saved content remains markdown.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
  },
  text: {
    fontSize: 15,
    lineHeight: 24,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
});
