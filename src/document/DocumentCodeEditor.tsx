import { Platform, StyleSheet, TextInput } from 'react-native';

import { resolveDocumentColors } from './colors';
import type { DocumentLanguage, DocumentUiColors } from './types';

type Props = {
  value: string;
  onChange: (next: string) => void;
  language: DocumentLanguage;
  colors?: DocumentUiColors;
};

export function DocumentCodeEditor({ value, onChange, colors: colorsProp }: Props) {
  const colors = resolveDocumentColors(colorsProp);

  return (
    <TextInput
      multiline
      value={value}
      onChangeText={onChange}
      style={[
        styles.editorInput,
        Platform.OS === 'web' ? styles.editorInputWeb : null,
        { color: colors.text, backgroundColor: colors.editorSurface },
      ]}
      placeholder="Start typing"
      placeholderTextColor={colors.mutedText}
      textAlignVertical="top"
      scrollEnabled
      autoCorrect={false}
      autoCapitalize="none"
    />
  );
}

const styles = StyleSheet.create({
  editorInput: {
    height: '100%',
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'monospace',
  },
  editorInputWeb: {
    outlineWidth: 0,
    outlineColor: 'transparent',
  },
});
