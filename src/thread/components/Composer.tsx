import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputKeyPressEventData,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ComposerImageAttachment } from '../types';
import {
  findActiveThreadPathMention,
  replaceActiveThreadPathMention,
  type ThreadPathMentionCandidate,
  type ThreadPathMentionSelection,
} from '../pathMentions';
import { resolveColors } from './colors';
import type { ComposerProps } from './types';

type ComposerNativeKeyEvent = NativeSyntheticEvent<TextInputKeyPressEventData> & {
  nativeEvent: TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean };
  preventDefault?: () => void;
};

type ComposerWebKeyEvent = ReactKeyboardEvent<HTMLElement> & {
  nativeEvent: KeyboardEvent & { shiftKey?: boolean; isComposing?: boolean };
};

type ComposerKeyEvent = ComposerNativeKeyEvent | ComposerWebKeyEvent;

function getComposerKeyEventMeta(event: ComposerKeyEvent): {
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  preventDefault: () => void;
} {
  const nativeEvent = event.nativeEvent as
    | (TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean })
    | (KeyboardEvent & { shiftKey?: boolean; isComposing?: boolean })
    | undefined;

  return {
    key: 'key' in event && typeof event.key === 'string' ? event.key : nativeEvent?.key,
    shiftKey: 'shiftKey' in event && typeof event.shiftKey === 'boolean' ? event.shiftKey : nativeEvent?.shiftKey,
    isComposing:
      ('isComposing' in event && typeof event.isComposing === 'boolean')
        ? event.isComposing
        : nativeEvent?.isComposing,
    preventDefault: () => {
      event.preventDefault?.();
      nativeEvent?.preventDefault?.();
      nativeEvent?.stopPropagation?.();
    },
  };
}

function createAttachmentId(): string {
  return `att-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function decodeDataUrl(dataUrl: string): { mediaType: string; dataBase64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], dataBase64: match[2] };
}

function parseHexChannel(value: string): number | null {
  const parsed = Number.parseInt(value, 16);
  return Number.isNaN(parsed) ? null : parsed;
}

function getContrastingIconColor(backgroundColor: string, fallbackColor: string): string {
  const normalized = backgroundColor.trim();
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  const expanded = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;

  if (expanded.length !== 6) {
    return fallbackColor;
  }

  const red = parseHexChannel(expanded.slice(0, 2));
  const green = parseHexChannel(expanded.slice(2, 4));
  const blue = parseHexChannel(expanded.slice(4, 6));
  if (red == null || green == null || blue == null) {
    return fallbackColor;
  }

  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.68 ? '#111111' : '#ffffff';
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
  pathMentions,
}: ComposerProps): ReactElement {
  const colors = resolveColors(colorOverrides);
  const activeSendIconColor = useMemo(
    () => getContrastingIconColor(colors.tint, colors.text),
    [colors.text, colors.tint],
  );
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<ComposerImageAttachment[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [selection, setSelection] = useState<ThreadPathMentionSelection>({ start: 0, end: 0 });
  const [controlledSelection, setControlledSelection] = useState<ThreadPathMentionSelection | undefined>(undefined);
  const [mentionItems, setMentionItems] = useState<ThreadPathMentionCandidate[]>([]);
  const [mentionSelectionIndex, setMentionSelectionIndex] = useState(0);
  const [isMentionLoading, setIsMentionLoading] = useState(false);
  const [dismissedMentionTokenKey, setDismissedMentionTokenKey] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const mentionScrollRef = useRef<ScrollView>(null);
  const isFocusedRef = useRef(false);
  const isPointerSelectingMentionRef = useRef(false);
  const skipNextSubmitKeyRef = useRef(false);
  const lastHandledKeyRef = useRef<{ key: string; at: number } | null>(null);
  const mentionSearchSequenceRef = useRef(0);
  const mentionItemLayoutsRef = useRef<Record<number, { y: number; height: number }>>({});
  const mentionViewportHeightRef = useRef(0);
  const mentionScrollOffsetRef = useRef(0);
  isFocusedRef.current = isFocused;
  const mentionsEnabled = Platform.OS === 'web' && !!pathMentions;

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isSubmitting;
  const activeMention = useMemo(
    () => (
      mentionsEnabled && isFocused
        ? findActiveThreadPathMention(text, selection)
        : null
    ),
    [isFocused, mentionsEnabled, selection, text],
  );
  const activeMentionTokenKey = activeMention
    ? `${activeMention.start}:${activeMention.end}:${activeMention.token}`
    : null;
  const isMentionListVisible =
    mentionsEnabled
    && !!activeMention
    && activeMentionTokenKey !== dismissedMentionTokenKey
    && (isMentionLoading || mentionItems.length > 0);

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
    if (!activeMentionTokenKey) {
      setDismissedMentionTokenKey(null);
      setMentionItems([]);
      setMentionSelectionIndex(0);
      setIsMentionLoading(false);
      mentionItemLayoutsRef.current = {};
      mentionScrollOffsetRef.current = 0;
      return;
    }
    if (dismissedMentionTokenKey && dismissedMentionTokenKey !== activeMentionTokenKey) {
      setDismissedMentionTokenKey(null);
    }
  }, [activeMentionTokenKey, dismissedMentionTokenKey]);

  useEffect(() => {
    if (
      !mentionsEnabled
      || !activeMention
      || !pathMentions
      || activeMentionTokenKey === dismissedMentionTokenKey
    ) {
      mentionSearchSequenceRef.current += 1;
      setMentionItems([]);
      setMentionSelectionIndex(0);
      setIsMentionLoading(false);
      mentionItemLayoutsRef.current = {};
      mentionScrollOffsetRef.current = 0;
      return;
    }

    const sequence = mentionSearchSequenceRef.current + 1;
    mentionSearchSequenceRef.current = sequence;
    setIsMentionLoading(true);

    const timeoutId = setTimeout(() => {
      void pathMentions.search(activeMention.query)
        .then((items) => {
          if (mentionSearchSequenceRef.current !== sequence) {
            return;
          }
          setMentionItems(items);
          setMentionSelectionIndex(0);
          setIsMentionLoading(false);
        })
        .catch(() => {
          if (mentionSearchSequenceRef.current !== sequence) {
            return;
          }
          setMentionItems([]);
          setMentionSelectionIndex(0);
          setIsMentionLoading(false);
        });
    }, 150);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [activeMention, activeMentionTokenKey, dismissedMentionTokenKey, mentionsEnabled, pathMentions]);

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

  const applyMention = useCallback((item: ThreadPathMentionCandidate) => {
    if (!activeMention) {
      return;
    }
    const next = replaceActiveThreadPathMention(text, activeMention, item.value);
    setText(next.text);
    setSelection(next.selection);
    setControlledSelection(next.selection);
    setMentionItems([]);
    setMentionSelectionIndex(0);
    setIsMentionLoading(false);
    setDismissedMentionTokenKey(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [activeMention, text]);

  const handleSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      const nextSelection = event.nativeEvent.selection;
      setSelection(nextSelection);
      if (
        controlledSelection
        && controlledSelection.start === nextSelection.start
        && controlledSelection.end === nextSelection.end
      ) {
        setControlledSelection(undefined);
      }
    },
    [controlledSelection],
  );

  const handleComposerKeyEvent = useCallback((event: ComposerKeyEvent) => {
    if (Platform.OS !== 'web') return;
    const { key, shiftKey, isComposing, preventDefault } = getComposerKeyEventMeta(event);
    if (isComposing) return;

    if (isMentionListVisible && key === 'Escape') {
      skipNextSubmitKeyRef.current = true;
      preventDefault();
      setMentionItems([]);
      setMentionSelectionIndex(0);
      setDismissedMentionTokenKey(activeMentionTokenKey);
      return;
    }

    if (isMentionListVisible && mentionItems.length > 0) {
      if (key === 'ArrowDown') {
        preventDefault();
        setMentionSelectionIndex((current) => (current + 1) % mentionItems.length);
        return;
      }
      if (key === 'ArrowUp') {
        preventDefault();
        setMentionSelectionIndex((current) => (current - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (key === 'Enter' || key === 'Tab') {
        skipNextSubmitKeyRef.current = true;
        preventDefault();
        applyMention(mentionItems[mentionSelectionIndex] ?? mentionItems[0]);
        return;
      }
    }

    if (key === 'Enter' && !shiftKey) {
      if (skipNextSubmitKeyRef.current) {
        skipNextSubmitKeyRef.current = false;
        preventDefault();
        return;
      }
      preventDefault();
      handleSubmit();
    }
  }, [
    activeMentionTokenKey,
    applyMention,
    handleSubmit,
    isMentionListVisible,
    mentionItems,
    mentionSelectionIndex,
  ]);

  const handleKeyPress = useCallback((event: ComposerKeyEvent) => {
    if (Platform.OS !== 'web') {
      return;
    }
    const { key } = getComposerKeyEventMeta(event);
    if (isMentionListVisible && (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Tab' || key === 'Escape')) {
      return;
    }
    handleComposerKeyEvent(event);
  }, [handleComposerKeyEvent, isMentionListVisible]);

  useEffect(() => {
    if (
      Platform.OS !== 'web'
      || typeof window === 'undefined'
      || !isFocused
      || !isMentionListVisible
    ) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (!isFocusedRef.current || event.defaultPrevented) {
        return;
      }
      const now = performance.now();
      if (
        lastHandledKeyRef.current
        && lastHandledKeyRef.current.key === event.key
        && now - lastHandledKeyRef.current.at < 32
      ) {
        return;
      }
      lastHandledKeyRef.current = { key: event.key, at: now };
      handleComposerKeyEvent(event as unknown as ComposerWebKeyEvent);
    };

    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [handleComposerKeyEvent, isFocused, isMentionListVisible]);

  useEffect(() => {
    if (!isMentionListVisible) {
      return;
    }
    const layout = mentionItemLayoutsRef.current[mentionSelectionIndex];
    const viewportHeight = mentionViewportHeightRef.current;
    if (!layout || viewportHeight <= 0) {
      return;
    }

    const viewportTop = mentionScrollOffsetRef.current;
    const viewportBottom = viewportTop + viewportHeight;
    const itemTop = layout.y;
    const itemBottom = layout.y + layout.height;

    if (itemTop < viewportTop) {
      mentionScrollRef.current?.scrollTo({ y: itemTop, animated: true });
      mentionScrollOffsetRef.current = itemTop;
      return;
    }

    if (itemBottom > viewportBottom) {
      const nextOffset = Math.max(0, itemBottom - viewportHeight);
      mentionScrollRef.current?.scrollTo({ y: nextOffset, animated: true });
      mentionScrollOffsetRef.current = nextOffset;
    }
  }, [isMentionListVisible, mentionSelectionIndex]);

  const handleMentionItemLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    mentionItemLayoutsRef.current[index] = { y, height };
  }, []);

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

        <View style={styles.inputArea}>
          {isMentionListVisible ? (
            <View
              style={[
                styles.mentionList,
                styles.mentionListOverlay,
                { borderColor: colors.sidebarBorder, backgroundColor: colors.background },
              ]}
            >
              {isMentionLoading ? (
                <View style={styles.mentionItem}>
                  <Text style={[styles.mentionValue, { color: colors.icon }]}>候補を読み込み中...</Text>
                </View>
              ) : (
                <ScrollView
                  ref={mentionScrollRef}
                  style={styles.mentionScroll}
                  contentContainerStyle={styles.mentionScrollContent}
                  keyboardShouldPersistTaps="always"
                  nestedScrollEnabled
                  onLayout={(event) => {
                    mentionViewportHeightRef.current = event.nativeEvent.layout.height;
                  }}
                  onScroll={(event) => {
                    mentionScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
                  }}
                  scrollEventThrottle={16}
                >
                  {mentionItems.map((item, index) => {
                    const isSelected = index === mentionSelectionIndex;
                    return (
                      <Pressable
                        key={`${item.value}-${index}`}
                        style={[
                          styles.mentionItem,
                          isSelected && {
                            backgroundColor: `${colors.tint}18`,
                            borderLeftColor: colors.tint,
                          },
                        ]}
                        testID={`composer-mention-item-${index}`}
                        onPressIn={() => {
                          isPointerSelectingMentionRef.current = true;
                          applyMention(item);
                        }}
                        onPressOut={() => {
                          isPointerSelectingMentionRef.current = false;
                        }}
                        {...(Platform.OS === 'web'
                          ? ({
                              onMouseDown: (event: MouseEvent) => {
                                event.preventDefault();
                                isPointerSelectingMentionRef.current = true;
                                applyMention(item);
                              },
                              onClick: (event: MouseEvent) => {
                                event.preventDefault();
                              },
                            } as unknown as Record<string, unknown>)
                          : undefined)}
                        onLayout={(event) => handleMentionItemLayout(index, event)}
                      >
                        <Text
                          style={[
                            styles.mentionValue,
                            { color: isSelected ? colors.tint : colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {item.value}
                        </Text>
                        {item.subtitle ? (
                          <Text
                            style={[
                              styles.mentionSubtitle,
                              { color: isSelected ? colors.text : colors.icon },
                            ]}
                            numberOfLines={1}
                          >
                            {item.subtitle}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: colors.text }]}
              underlineColorAndroid="transparent"
              value={text}
              onChangeText={setText}
              onKeyPress={handleKeyPress}
              onSelectionChange={handleSelectionChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                if (isPointerSelectingMentionRef.current) {
                  requestAnimationFrame(() => {
                    inputRef.current?.focus();
                  });
                  return;
                }
                setIsFocused(false);
              }}
              placeholder={placeholder}
              placeholderTextColor={`${colors.icon}99`}
              multiline
              maxLength={10000}
              editable={!isSubmitting}
              onSubmitEditing={handleSubmit}
              blurOnSubmit={false}
              selection={controlledSelection ?? selection}
              testID="composer-input"
            />
          </View>
        </View>
        <View style={styles.bottomRow}>
          {allowImageAttachments ? (
            <Pressable style={styles.button} onPress={handleAttachPress} disabled={isSubmitting || Platform.OS !== 'web'}>
              <Ionicons
                name="attach"
                size={20}
                color={isSubmitting || Platform.OS !== 'web' ? `${colors.icon}55` : colors.icon}
              />
            </Pressable>
          ) : null}
          {isSubmitting ? (
            <Pressable style={styles.button} onPress={onAbort}>
              <Ionicons name="stop-circle" size={24} color="#f87171" />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.sendButton, { backgroundColor: canSend ? colors.tint : `${colors.icon}33` }]}
              onPress={handleSubmit}
              disabled={!canSend}
            >
              <Ionicons name="arrow-up" size={18} color={canSend ? activeSendIconColor : `${colors.icon}66`} />
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  inputRow: {
    minHeight: 56,
  },
  inputArea: {
    position: 'relative',
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
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
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    padding: 0,
    outlineWidth: 0,
    outlineStyle: 'none',
    outlineColor: 'transparent',
    fontSize: 14,
    maxHeight: 120,
    minHeight: 56,
  },
  mentionList: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  mentionListOverlay: {
    position: 'absolute',
    left: 0,
    right: 44,
    bottom: '100%',
    marginBottom: 8,
    maxHeight: 220,
    zIndex: 20,
  },
  mentionScroll: {
    maxHeight: 220,
  },
  mentionScrollContent: {
    paddingVertical: 2,
  },
  mentionItem: {
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  mentionValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  mentionSubtitle: {
    fontSize: 12,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
    height: 32,
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});
