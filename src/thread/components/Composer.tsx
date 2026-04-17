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
import { AntDesign, Ionicons } from '@expo/vector-icons';

import type { ComposerImageAttachment } from '../types';
import {
  findActiveThreadPathMention,
  replaceActiveThreadPathMention,
  type ThreadPathMentionCandidate,
  type ThreadPathMentionSelection,
} from '../pathMentions';
import {
  findActiveThreadSkillMention,
  replaceActiveThreadSkillMention,
  type ThreadSkillMentionCandidate,
} from '../skillMentions';
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
      const nativeLikeEvent = nativeEvent as {
        preventDefault?: () => void;
        stopPropagation?: () => void;
      } | undefined;
      nativeLikeEvent?.preventDefault?.();
      nativeLikeEvent?.stopPropagation?.();
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

function getRuntimeLabel(key: string): string {
  if (key === 'model') return 'Model';
  if (key === 'reasoningEffort') return 'Reasoning';
  if (key === 'verbosity') return 'Verbosity';
  return key;
}

function getRuntimeDefaultOptionLabel(defaultValue: string | null): string {
  if (!defaultValue) return 'Default';
  return `Default (${defaultValue})`;
}

function getRuntimeIconName(key: string): keyof typeof Ionicons.glyphMap {
  if (key === 'model') return 'cube-outline';
  if (key === 'reasoningEffort') return 'flash-outline';
  if (key === 'verbosity') return 'ellipse-outline';
  return 'ellipse-outline';
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
  composerAccessory,
  runtimeControls,
  pathMentions,
  skillMentions,
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
  const [mentionItems, setMentionItems] = useState<Array<ThreadPathMentionCandidate | ThreadSkillMentionCandidate>>([]);
  const [mentionSelectionIndex, setMentionSelectionIndex] = useState(0);
  const [isMentionLoading, setIsMentionLoading] = useState(false);
  const [dismissedMentionTokenKey, setDismissedMentionTokenKey] = useState<string | null>(null);
  const [openRuntimeMenuKey, setOpenRuntimeMenuKey] = useState<string | null>(null);
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
  const pathMentionsEnabled = Platform.OS === 'web' && !!pathMentions;
  const skillMentionsEnabled = Platform.OS === 'web' && !!skillMentions;
  const mentionsEnabled = pathMentionsEnabled || skillMentionsEnabled;

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isSubmitting;
  const activePathMention = useMemo(
    () => (
      pathMentionsEnabled && isFocused
        ? findActiveThreadPathMention(text, selection)
        : null
    ),
    [isFocused, pathMentionsEnabled, selection, text],
  );
  const activeSkillMention = useMemo(
    () => (
      skillMentionsEnabled && isFocused
        ? findActiveThreadSkillMention(text, selection)
        : null
    ),
    [isFocused, selection, skillMentionsEnabled, text],
  );
  const activeSuggestion = useMemo(
    () => (
      activeSkillMention
        ? { kind: 'skill' as const, mention: activeSkillMention }
        : activePathMention
          ? { kind: 'path' as const, mention: activePathMention }
          : null
    ),
    [activePathMention, activeSkillMention],
  );
  const activeMentionTokenKey = activeSuggestion
    ? `${activeSuggestion.kind}:${activeSuggestion.mention.start}:${activeSuggestion.mention.end}:${activeSuggestion.mention.token}`
    : null;
  const isMentionListVisible =
    mentionsEnabled
    && !!activeSuggestion
    && activeMentionTokenKey !== dismissedMentionTokenKey
    && (isMentionLoading || mentionItems.length > 0);
  const runtimeSections = useMemo(
    () => {
      if (!runtimeControls?.policy) return [];
      return [
        {
          key: 'model',
          label: 'Model',
          selected: runtimeControls.value?.model ?? null,
          defaultValue: runtimeControls.policy.defaults?.model ?? null,
          values: runtimeControls.policy.allowedModels ?? [],
        },
        {
          key: 'reasoningEffort',
          label: 'Reasoning',
          selected: runtimeControls.value?.reasoningEffort ?? null,
          defaultValue: runtimeControls.policy.defaults?.reasoningEffort ?? null,
          values: runtimeControls.policy.allowedReasoningEfforts ?? [],
        },
        {
          key: 'verbosity',
          label: 'Verbosity',
          selected: runtimeControls.value?.verbosity ?? null,
          defaultValue: runtimeControls.policy.defaults?.verbosity ?? null,
          values: runtimeControls.policy.allowedVerbosity ?? [],
        },
      ]
        .filter((section) => section.values.length > 0)
        .map((section) => ({
          ...section,
          isModified: section.selected !== null,
        }));
    },
    [runtimeControls],
  );

  useEffect(() => {
    if (runtimeSections.length === 0) {
      setOpenRuntimeMenuKey(null);
    } else if (openRuntimeMenuKey && !runtimeSections.some((section) => section.key === openRuntimeMenuKey)) {
      setOpenRuntimeMenuKey(null);
    }
  }, [openRuntimeMenuKey, runtimeSections]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !openRuntimeMenuKey || typeof document === 'undefined') {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setOpenRuntimeMenuKey(null);
        return;
      }
      if (target.closest('[id^="composer-runtime-dropdown-"]')) {
        return;
      }
      setOpenRuntimeMenuKey(null);
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
    };
  }, [openRuntimeMenuKey]);

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
      || !activeSuggestion
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
      const search =
        activeSuggestion.kind === 'skill'
          ? skillMentions?.search
          : pathMentions?.search;
      if (!search) {
        setMentionItems([]);
        setMentionSelectionIndex(0);
        setIsMentionLoading(false);
        return;
      }

      void search(activeSuggestion.mention.query)
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
  }, [
    activeMentionTokenKey,
    activeSuggestion,
    dismissedMentionTokenKey,
    mentionsEnabled,
    pathMentions,
    skillMentions,
  ]);

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

  const applyMention = useCallback((item: ThreadPathMentionCandidate | ThreadSkillMentionCandidate) => {
    if (!activeSuggestion) {
      return;
    }
    if (activeSuggestion.kind === 'skill') {
      const skillItem = item as ThreadSkillMentionCandidate;
      skillMentions?.onSelect?.(skillItem);
      if (skillItem.agentRuntime) {
        runtimeControls?.onChange(skillItem.agentRuntime);
      }
    }
    const next =
      activeSuggestion.kind === 'skill'
        ? replaceActiveThreadSkillMention(text, activeSuggestion.mention, item.value)
        : replaceActiveThreadPathMention(text, activeSuggestion.mention, item.value);
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
  }, [activeSuggestion, runtimeControls, skillMentions, text]);

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
              style={[
                styles.input,
                Platform.OS === 'web'
                  ? ({ outlineStyle: 'none', boxShadow: 'none' } as unknown as typeof styles.input)
                  : null,
                { color: colors.text },
              ]}
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
        {runtimeControls?.error ? (
          <Text style={styles.runtimeErrorText}>
            {runtimeControls.error}
          </Text>
        ) : null}
        <View style={styles.bottomRow}>
          {(composerAccessory || runtimeSections.length > 0) ? (
            <View style={styles.controlsWrap}>
              {composerAccessory ? (
                <View style={styles.accessoryWrap}>
                  {composerAccessory}
                </View>
              ) : null}
              {runtimeSections.length > 0 ? (
                <View style={styles.runtimePanel}>
                  {runtimeSections.map((section) => (
                    <View
                      key={section.key}
                      nativeID={`composer-runtime-dropdown-${section.key}`}
                      style={[
                        styles.runtimeDropdownRoot,
                        openRuntimeMenuKey === section.key ? styles.runtimeDropdownRootOpen : null,
                      ]}
                    >
                      <Pressable
                        style={[
                          styles.runtimeDropdownTrigger,
                          {
                            backgroundColor: 'transparent',
                          },
                        ]}
                        onPress={() => {
                          setOpenRuntimeMenuKey((current) => (
                            current === section.key ? null : section.key
                          ));
                        }}
                      >
                        {section.key === 'verbosity' ? (
                          <AntDesign
                            name="align-left"
                            size={15}
                            color={
                              openRuntimeMenuKey === section.key
                                ? colors.tint
                                : colors.icon
                            }
                          />
                        ) : (
                          <Ionicons
                            name={getRuntimeIconName(section.key)}
                            size={16}
                            color={
                              openRuntimeMenuKey === section.key
                                ? colors.tint
                                : colors.icon
                            }
                          />
                        )}
                        {section.isModified ? (
                          <View style={[styles.runtimeModifiedDot, { backgroundColor: colors.tint }]} />
                        ) : null}
                      </Pressable>
                      {openRuntimeMenuKey === section.key ? (
                        <View
                          style={[
                            styles.runtimeDropdownMenu,
                            {
                              backgroundColor: colors.background,
                              borderColor: `${colors.icon}44`,
                            },
                          ]}
                        >
                          <View style={[styles.runtimeDropdownMenuHeader, { borderBottomColor: `${colors.icon}22` }]}>
                            <Text style={[styles.runtimeDropdownMenuTitle, { color: colors.icon }]}>
                              {getRuntimeLabel(section.key)}
                            </Text>
                          </View>
                          <Pressable
                            style={styles.runtimeDropdownItem}
                            onPress={() => {
                              runtimeControls?.onChange({ [section.key]: undefined });
                              setOpenRuntimeMenuKey(null);
                            }}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.runtimeDropdownItemText,
                                { color: section.selected == null ? colors.tint : colors.text },
                              ]}
                            >
                              {getRuntimeDefaultOptionLabel(section.defaultValue)}
                            </Text>
                            {section.selected == null ? (
                              <Ionicons name="checkmark" size={14} color={colors.tint} />
                            ) : null}
                          </Pressable>
                          {section.values.map((value) => {
                            const isSelected = section.selected === value;
                            return (
                              <Pressable
                                key={value}
                                style={styles.runtimeDropdownItem}
                                onPress={() => {
                                  runtimeControls?.onChange({ [section.key]: value });
                                  setOpenRuntimeMenuKey(null);
                                }}
                              >
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.runtimeDropdownItemText,
                                    { color: isSelected ? colors.tint : colors.text },
                                  ]}
                                >
                                  {value}
                                </Text>
                                {isSelected ? (
                                  <Ionicons name="checkmark" size={14} color={colors.tint} />
                                ) : null}
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
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
    justifyContent: 'space-between',
    gap: 8,
  },
  controlsWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    paddingRight: 8,
  },
  accessoryWrap: {
    minWidth: 0,
    flexShrink: 1,
  },
  runtimePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    minWidth: 0,
  },
  runtimeDropdownRoot: {
    position: 'relative',
    minWidth: 0,
  },
  runtimeDropdownRootOpen: {
    zIndex: 40,
  },
  runtimeDropdownTrigger: {
    height: 32,
    width: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
  },
  runtimeDropdownMenu: {
    position: 'absolute',
    right: 0,
    bottom: '100%',
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  runtimeDropdownMenuHeader: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    gap: 2,
  },
  runtimeDropdownMenuTitle: {
    fontSize: 12,
    fontWeight: '400',
  },
  runtimeDropdownItem: {
    minHeight: 32,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  runtimeDropdownItemText: {
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 0,
  },
  runtimeModifiedDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  runtimeErrorText: {
    color: '#f87171',
    fontSize: 12,
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
