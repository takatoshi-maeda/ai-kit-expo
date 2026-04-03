import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ComposerImageAttachment } from '../types';
import { resolveColors } from './colors';
import type { ComposerProps } from './types';

function createAttachmentId(): string {
  return `att-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function decodeDataUrl(dataUrl: string): { mediaType: string; dataBase64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], dataBase64: match[2] };
}

async function readImageFile(file: File): Promise<ComposerImageAttachment | null> {
  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  if (!dataUrl) return null;
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;

  return {
    id: createAttachmentId(),
    name: file.name || 'image',
    mediaType: decoded.mediaType,
    dataBase64: decoded.dataBase64,
    byteSize: file.size,
  };
}

export function Composer({
  onSubmit,
  onAbort,
  isSubmitting,
  colors: colorOverrides,
  placeholder = 'メッセージを入力...',
  allowImageAttachments = true,
}: ComposerProps): ReactElement {
  const colors = resolveColors(colorOverrides);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ComposerImageAttachment[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const isFocusedRef = useRef(false);
  isFocusedRef.current = isFocused;

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isSubmitting;

  const appendFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const next = await Promise.all(files.map(readImageFile));
    const valid = next.filter((item): item is ComposerImageAttachment => item !== null);
    if (valid.length === 0) return;
    setAttachments((prev) => [...prev, ...valid]);
  }, []);

  const handleAttachPress = useCallback(() => {
    if (!allowImageAttachments || Platform.OS !== 'web' || isSubmitting || typeof document === 'undefined') {
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      const selected = Array.from(input.files ?? []);
      void appendFiles(selected);
    };
    input.click();
  }, [allowImageAttachments, appendFiles, isSubmitting]);

  useEffect(() => {
    if (!allowImageAttachments || Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handlePaste = (event: ClipboardEvent) => {
      if (!isFocusedRef.current || isSubmitting) return;
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageFiles = items
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file instanceof File);

      if (imageFiles.length === 0) return;
      event.preventDefault();
      void appendFiles(imageFiles);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [allowImageAttachments, appendFiles, isSubmitting]);

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    const message = text;
    const pendingAttachments = attachments;
    setText('');
    setAttachments([]);
    onSubmit(message, pendingAttachments);
  }, [attachments, canSend, onSubmit, text]);

  const handleKeyPress = useCallback((event: { nativeEvent?: { isComposing?: boolean; key?: string; shiftKey?: boolean } }) => {
    if (Platform.OS !== 'web') return;
    const { key, shiftKey, isComposing } = event.nativeEvent ?? {};
    if (isComposing) return;
    if (key === 'Enter' && !shiftKey) {
      (event as { preventDefault?: () => void }).preventDefault?.();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={[styles.container, { backgroundColor: colors.background, borderTopColor: colors.sidebarBorder }]}>
        {attachments.length > 0 ? (
          <View style={styles.attachmentRow}>
            {attachments.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.attachmentChip,
                  { borderColor: colors.sidebarBorder, backgroundColor: `${colors.icon}12` },
                ]}
              >
                <Image source={{ uri: `data:${item.mediaType};base64,${item.dataBase64}` }} style={styles.attachmentThumb} />
                <Text style={[styles.attachmentLabel, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Pressable
                  onPress={() => setAttachments((prev) => prev.filter((value) => value.id !== item.id))}
                  hitSlop={6}
                  disabled={isSubmitting}
                >
                  <Ionicons name="close" size={14} color={colors.icon} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            underlineColorAndroid="transparent"
            value={text}
            onChangeText={setText}
            onKeyPress={handleKeyPress}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={`${colors.icon}99`}
            multiline
            maxLength={10000}
            editable={!isSubmitting}
            onSubmitEditing={handleSubmit}
            blurOnSubmit={false}
          />
          {isSubmitting ? (
            <Pressable style={styles.button} onPress={onAbort}>
              <Ionicons name="stop-circle" size={28} color="#f87171" />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.sendButton, { backgroundColor: canSend ? colors.tint : `${colors.icon}33` }]}
              onPress={handleSubmit}
              disabled={!canSend}
            >
              <Ionicons name="arrow-up" size={20} color={canSend ? '#ffffff' : `${colors.icon}66`} />
            </Pressable>
          )}
        </View>
        {allowImageAttachments ? (
          <View style={styles.bottomRow}>
            <Pressable style={styles.button} onPress={handleAttachPress} disabled={isSubmitting || Platform.OS !== 'web'}>
              <Ionicons
                name="attach"
                size={22}
                color={isSubmitting || Platform.OS !== 'web' ? `${colors.icon}55` : colors.icon}
              />
            </Pressable>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 6,
    gap: 6,
  },
  attachmentLabel: {
    maxWidth: 184,
    fontSize: 12,
    fontWeight: '500',
  },
  attachmentThumb: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#00000022',
  },
  input: {
    flex: 1,
    margin: 0,
    borderRadius: 0,
    padding: 0,
    outlineWidth: 0,
    outlineColor: 'transparent',
    fontSize: 14,
    maxHeight: 120,
    minHeight: 56,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
});
