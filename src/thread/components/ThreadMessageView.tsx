import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AgentResponseLogEntry, AgentTimelineItem } from '../types';
import { resolveColors } from './colors';
import { formatDuration, formatShortTimestamp } from './format';
import type { ThreadMessageViewProps } from './types';

const INITIAL_VISIBLE_TIMELINE = 3;
const ARTIFACT_PREVIEW_HEAD_LINES = 8;
const ARTIFACT_PREVIEW_TAIL_LINES = 4;

function jsonArgsToYaml(lines: string[]): string[] {
  const joined = lines.join('');
  try {
    const parsed = JSON.parse(joined);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([key, value]) => {
        const normalized = typeof value === 'string' ? value : JSON.stringify(value);
        return `${key}: ${normalized}`;
      });
    }
  } catch {}

  const result: string[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          const normalized = typeof value === 'string' ? value : JSON.stringify(value);
          result.push(`${key}: ${normalized}`);
        }
        continue;
      }
    } catch {}
    result.push(line);
  }
  return result;
}

function fileNameFromPath(path?: string): string | null {
  if (!path) return null;
  const segments = path.replace(/\\/g, '/').split('/');
  return segments.at(-1) ?? null;
}

function buildArtifactPreview(text: string): { lines: string[]; omittedLineCount: number } {
  const lines = text.split('\n');
  const maxVisible = ARTIFACT_PREVIEW_HEAD_LINES + ARTIFACT_PREVIEW_TAIL_LINES;
  if (lines.length <= maxVisible) {
    return { lines, omittedLineCount: 0 };
  }

  return {
    lines: [
      ...lines.slice(0, ARTIFACT_PREVIEW_HEAD_LINES),
      `... (${lines.length - maxVisible} more lines)`,
      ...lines.slice(-ARTIFACT_PREVIEW_TAIL_LINES),
    ],
    omittedLineCount: lines.length - maxVisible,
  };
}

function classifyArtifactAction(item: Extract<AgentTimelineItem, { kind: 'artifact' }>): string {
  if (item.text.includes('*** Add File:')) return 'Created file';
  if (item.text.includes('*** Update File:')) return 'Updated file';
  if (item.text.includes('*** Delete File:')) return 'Deleted file';
  return item.status === 'running' ? 'Editing file' : 'Edited file';
}

function countDiffStats(text: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of text.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }

  return { additions, deletions };
}

function classifyArtifactLine(line: string): 'add' | 'remove' | 'meta' | 'plain' {
  if (
    line.startsWith('*** ') ||
    line.startsWith('@@') ||
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('+++') ||
    line.startsWith('---')
  ) {
    return 'meta';
  }
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'remove';
  return 'plain';
}

function getArtifactPalette(colors: ReturnType<typeof resolveColors>) {
  const dark = colors.background.toLowerCase() === '#151718';
  return dark
    ? {
        cardBg: '#1e1f20',
        cardBorder: '#2a2d2f',
        fileBarBg: '#222426',
        codeBg: '#141816',
        lineNumber: '#7f858a',
        plainText: '#d1d5db',
        metaText: '#9ca3af',
        addText: '#86efac',
        removeText: '#fca5a5',
        addBg: '#0f2a1d',
        removeBg: '#3a1616',
      }
    : {
        cardBg: '#ffffff',
        cardBorder: '#d1d5db',
        fileBarBg: '#f3f4f6',
        codeBg: '#f6fbf7',
        lineNumber: '#9ca3af',
        plainText: '#374151',
        metaText: '#6b7280',
        addText: '#166534',
        removeText: '#991b1b',
        addBg: '#dcfce7',
        removeBg: '#fee2e2',
      };
}

function TimelineDot({
  running,
  colors,
}: {
  running: boolean;
  colors: ReturnType<typeof resolveColors>;
}): ReactElement {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!running) {
      setVisible(true);
      return;
    }
    const id = setInterval(() => setVisible((value) => !value), 500);
    return () => clearInterval(id);
  }, [running]);

  return (
    <View
      style={[
        timelineStyles.dot,
        {
          backgroundColor: running ? colors.icon : colors.timelineDot,
          opacity: visible ? 1 : 0.25,
        },
      ]}
    />
  );
}

function InlineTimelineItem({
  item,
  colors,
  onCopyMessage,
  onOpenArtifactPath,
}: {
  item: AgentTimelineItem;
  colors: ReturnType<typeof resolveColors>;
  onCopyMessage?: (text: string) => void | Promise<void>;
  onOpenArtifactPath?: (path: string) => void | Promise<void>;
}): ReactElement | null {
  const [artifactExpanded, setArtifactExpanded] = useState(false);
  const [artifactPathHovered, setArtifactPathHovered] = useState(false);

  if (item.kind === 'reasoning') {
    return null;
  }

  if (item.kind === 'tool-call') {
    const yamlLines = item.argumentLines?.length ? jsonArgsToYaml(item.argumentLines) : null;
    return (
      <View style={timelineStyles.item}>
        <View style={timelineStyles.header}>
          <TimelineDot running={item.status === 'running'} colors={colors} />
          <Text style={[timelineStyles.label, { color: colors.timelineLabel }]}>
            ToolCall: {item.summary || 'tool_call'}
          </Text>
        </View>
        {yamlLines ? (
          <View style={timelineStyles.args}>
            {yamlLines.map((line, index) => (
              <Text
                key={`${item.id}-${index}`}
                style={[timelineStyles.argLine, { color: colors.timelineArg }]}
                numberOfLines={2}
              >
                {index === 0 ? '\u2514 ' : '  '}
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (item.kind === 'cumulative-cost') return null;

  if (item.kind === 'artifact') {
    const preview = buildArtifactPreview(item.text);
    const visibleLines =
      artifactExpanded || preview.omittedLineCount === 0
        ? item.text.split('\n')
        : preview.lines;
    const title = fileNameFromPath(item.path) ?? item.id;
    const action = classifyArtifactAction(item);
    const stats = countDiffStats(item.text);
    const palette = getArtifactPalette(colors);

    const isArtifactRunning = item.status === 'running';

    return (
      <View
        style={[
          timelineStyles.artifactCard,
          { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
        ]}
      >
        <View style={timelineStyles.artifactCardHeader}>
          <Pressable style={timelineStyles.artifactCardHeaderMain} onPress={() => setArtifactExpanded((value) => !value)}>
            <Text style={[timelineStyles.artifactAction, { color: colors.timelineArg }]}>{action}</Text>
            <Ionicons
              name={artifactExpanded ? 'chevron-down' : 'chevron-forward'}
              size={10}
              color={colors.timelineArg}
            />
          </Pressable>
          {onCopyMessage ? (
            <Pressable onPress={() => void onCopyMessage(item.text)} hitSlop={8}>
              <Ionicons name="copy-outline" size={13} color={colors.icon} />
            </Pressable>
          ) : null}
        </View>
        {artifactExpanded ? (
          <>
            <View
              style={[
                timelineStyles.artifactFileBar,
                { backgroundColor: palette.fileBarBg, borderColor: palette.cardBorder },
              ]}
            >
              <View style={timelineStyles.artifactFileNameWrap}>
                <View style={timelineStyles.artifactFileNameRow}>
                  {isArtifactRunning ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.tint}
                      style={timelineStyles.artifactFileSpinner}
                    />
                  ) : null}
                  <Pressable
                    disabled={!item.path}
                    onPress={() => item.path ? void onOpenArtifactPath?.(item.path) : undefined}
                    onHoverIn={() => setArtifactPathHovered(true)}
                    onHoverOut={() => setArtifactPathHovered(false)}
                    style={timelineStyles.artifactFileNamePressable}
                  >
                    <Text
                      style={[
                        timelineStyles.artifactFileName,
                        timelineStyles.artifactFileNameLink,
                        { color: colors.tint },
                      ]}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                  </Pressable>
                </View>
                {item.path && artifactPathHovered ? (
                  <View
                    style={[
                      timelineStyles.artifactTooltip,
                      {
                        backgroundColor: palette.cardBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        timelineStyles.artifactTooltipText,
                        { color: palette.metaText },
                      ]}
                    >
                      {item.path}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={timelineStyles.artifactStats}>
                <Text style={[timelineStyles.artifactStatAdd, { color: palette.addText }]}>+{stats.additions}</Text>
                <Text style={[timelineStyles.artifactStatDelete, { color: palette.removeText }]}>-{stats.deletions}</Text>
              </View>
            </View>
            {item.text.trim() ? (
              <View
                style={[
                  timelineStyles.artifactCodeBlock,
                  { backgroundColor: palette.codeBg, borderColor: palette.cardBorder },
                ]}
              >
                {visibleLines.map((line, index) => {
                  const tone = classifyArtifactLine(line);
                  const textColor =
                    tone === 'add'
                      ? palette.addText
                      : tone === 'remove'
                        ? palette.removeText
                        : tone === 'meta'
                          ? palette.metaText
                          : palette.plainText;
                  const backgroundColor =
                    tone === 'add'
                      ? palette.addBg
                      : tone === 'remove'
                        ? palette.removeBg
                        : 'transparent';

                  return (
                    <View
                      key={`${item.id}-${index}`}
                      style={[
                        timelineStyles.artifactCodeLine,
                        backgroundColor !== 'transparent' && { backgroundColor },
                      ]}
                    >
                      <Text style={[timelineStyles.artifactLineNumber, { color: palette.lineNumber }]}>
                        {index + 1}
                      </Text>
                      <Text style={[timelineStyles.artifactLineText, { color: textColor }]} numberOfLines={1}>
                        {line || ' '}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View
                style={[
                  timelineStyles.artifactCodeBlock,
                  { backgroundColor: palette.codeBg, borderColor: palette.cardBorder },
                ]}
              >
                <Text style={[timelineStyles.artifactOmitted, { color: palette.metaText }]}>Waiting for content...</Text>
              </View>
            )}
          </>
        ) : (
          <View
            style={[
              timelineStyles.artifactCollapsedBar,
              { backgroundColor: palette.fileBarBg, borderColor: palette.cardBorder },
            ]}
          >
            <View style={timelineStyles.artifactFileNameWrap}>
              <View style={timelineStyles.artifactFileNameRow}>
                {isArtifactRunning ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.tint}
                    style={timelineStyles.artifactFileSpinner}
                  />
                ) : null}
                <Pressable
                  disabled={!item.path}
                  onPress={() => item.path ? void onOpenArtifactPath?.(item.path) : undefined}
                  onHoverIn={() => setArtifactPathHovered(true)}
                  onHoverOut={() => setArtifactPathHovered(false)}
                  style={timelineStyles.artifactFileNamePressable}
                >
                  <Text style={[timelineStyles.artifactCollapsedTitle, { color: colors.tint }]} numberOfLines={1}>
                    {title}
                  </Text>
                </Pressable>
              </View>
              {item.path && artifactPathHovered ? (
                <View
                  style={[
                    timelineStyles.artifactTooltip,
                    {
                      backgroundColor: palette.cardBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      timelineStyles.artifactTooltipText,
                      { color: palette.metaText },
                    ]}
                  >
                    {item.path}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={timelineStyles.artifactStats}>
              <Text style={[timelineStyles.artifactStatAdd, { color: palette.addText }]}>+{stats.additions}</Text>
              <Text style={[timelineStyles.artifactStatDelete, { color: palette.removeText }]}>-{stats.deletions}</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (item.kind === 'text' && item.text.trim()) {
    return (
      <View style={timelineStyles.responseBlock}>
        <View style={[timelineStyles.dot, { backgroundColor: colors.timelineDotBlue, marginTop: 6 }]} />
        <Text style={[timelineStyles.responseText, { color: colors.timelineLabel }]}>{item.text.trim()}</Text>
      </View>
    );
  }

  return null;
}

function AgentInlineTimeline({
  entry,
  liveElapsed,
  colors,
  onCopyMessage,
  onOpenArtifactPath,
}: {
  entry: AgentResponseLogEntry;
  liveElapsed: number;
  colors: ReturnType<typeof resolveColors>;
  onCopyMessage?: (text: string) => void | Promise<void>;
  onOpenArtifactPath?: (path: string) => void | Promise<void>;
}): ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const timeline = entry.timeline;
  const isRunning = entry.status === 'running';
  const hasRunningTool = timeline.some((item) => item.kind === 'tool-call' && item.status === 'running');
  const hasRunningArtifact = timeline.some((item) => item.kind === 'artifact' && item.status === 'running');
  const hasRunningText = timeline.some(
    (item) => item.kind === 'text' && item.text.trim().length > 0 && item.completedAt == null,
  );
  const displayTimeline = timeline.filter((item) => item.kind !== 'reasoning');

  if (timeline.length === 0 && !isRunning) return null;

  const hasTimelineText = timeline.some((item) => item.kind === 'text' && item.text.trim().length > 0);
  const showSyntheticThinking =
    isRunning && !hasRunningTool && !hasRunningArtifact && !hasRunningText;
  const hiddenCount = expanded ? 0 : Math.max(0, displayTimeline.length - INITIAL_VISIBLE_TIMELINE);
  const visibleItems = expanded ? displayTimeline : displayTimeline.slice(hiddenCount);
  const elapsed = isRunning ? liveElapsed : entry.elapsedSeconds;
  const durationText = isRunning
    ? `Working ${formatDuration(elapsed ?? 0)}`
      : elapsed != null && elapsed > 0
      ? `Worked for ${formatDuration(elapsed)}`
      : null;
  const costItem = timeline.find((item) => item.kind === 'cumulative-cost');
  const costLabel = costItem?.kind === 'cumulative-cost' ? costItem.amountLabel : null;
  const taskCostLabel = entry.taskCostUsd != null
    ? `Cost: $${entry.taskCostUsd.toFixed(3)}`
    : costLabel
      ? `Cost: ${costLabel}`
      : null;

  return (
    <View style={timelineStyles.container}>
      {hiddenCount > 0 ? (
        <Pressable onPress={() => setExpanded(true)} style={timelineStyles.showEarlier}>
          <Ionicons name="chevron-down" size={14} color={colors.tint} />
          <Text style={[timelineStyles.showEarlierText, { color: colors.tint }]}>Show {hiddenCount} earlier</Text>
        </Pressable>
      ) : expanded && displayTimeline.length > INITIAL_VISIBLE_TIMELINE ? (
        <Pressable onPress={() => setExpanded(false)} style={timelineStyles.showEarlier}>
          <Ionicons name="chevron-up" size={14} color={colors.tint} />
          <Text style={[timelineStyles.showEarlierText, { color: colors.tint }]}>Show less</Text>
        </Pressable>
      ) : null}
      {visibleItems.map((item) => (
        <InlineTimelineItem
          key={item.id}
          item={item}
          colors={colors}
          onCopyMessage={onCopyMessage}
          onOpenArtifactPath={onOpenArtifactPath}
        />
      ))}
      {showSyntheticThinking ? (
        <View style={timelineStyles.item}>
          <View style={timelineStyles.header}>
            <TimelineDot running colors={colors} />
            <Text style={[timelineStyles.label, { color: colors.timelineLabel }]}>Thinking</Text>
          </View>
        </View>
      ) : null}
      {!hasTimelineText && entry.responseText?.trim() ? (
        <View style={timelineStyles.responseBlock}>
          <View style={[timelineStyles.dot, { backgroundColor: colors.timelineDotBlue, marginTop: 6 }]} />
          <Text style={[timelineStyles.responseText, { color: colors.timelineLabel }]}>
            {entry.responseText.trim()}
          </Text>
        </View>
      ) : null}
      {durationText ? (
        <View style={timelineStyles.durationRow}>
          <Text style={[timelineStyles.duration, { color: colors.timelineDuration }]}>{durationText}</Text>
          <View style={[timelineStyles.durationRule, { backgroundColor: colors.timelineDuration }]} />
        </View>
      ) : null}
      {taskCostLabel ? <Text style={[timelineStyles.cost, { color: colors.costText }]}>{taskCostLabel}</Text> : null}
    </View>
  );
}

export function ThreadMessageView({
  message,
  liveElapsed,
  colors: colorOverrides,
  onCopyMessage,
  onOpenArtifactPath,
}: ThreadMessageViewProps): ReactElement {
  const colors = resolveColors(colorOverrides);
  const [collapsed, setCollapsed] = useState(false);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const isUser = message.role === 'user';
  const agentEntry = !isUser && message.entry?.kind === 'agent-response'
    ? (message.entry as AgentResponseLogEntry)
    : null;
  const hasTimeline = agentEntry && (agentEntry.timeline.length > 0 || agentEntry.status === 'running');

  const handleCopy = useCallback(() => {
    if (!message.content || !onCopyMessage) return;
    void onCopyMessage(message.content);
  }, [message.content, onCopyMessage]);

  if (message.role === 'system') {
    return (
      <View style={styles.systemContainer}>
        <Text style={[styles.systemText, { color: colors.systemText }]}>{message.content}</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.messageContainer}>
        <View style={styles.messageHeader}>
          <View style={styles.authorRow}>
            <View style={[styles.authorAvatar, { backgroundColor: isUser ? colors.avatarUser : colors.avatarAgent }]}>
              {isUser ? <Text style={styles.avatarText}>You</Text> : null}
            </View>
            <Text style={[styles.authorName, { color: colors.authorText }]}>{message.author}</Text>
            <Text style={[styles.timestamp, { color: colors.timestampText }]}>{formatShortTimestamp(message.timestamp)}</Text>
          </View>
          <Pressable onPress={() => setCollapsed((value) => !value)} hitSlop={8}>
            <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-down'} size={18} color={colors.icon} />
          </Pressable>
        </View>
        {!collapsed ? (
          <View style={styles.messageBody}>
            {hasTimeline ? (
              <AgentInlineTimeline
                entry={agentEntry}
                liveElapsed={liveElapsed}
                colors={colors}
                onCopyMessage={onCopyMessage}
                onOpenArtifactPath={onOpenArtifactPath}
              />
            ) : Array.isArray(message.contentParts) && message.contentParts.length > 0 ? (
              <View style={styles.imageGroup}>
                {message.contentParts.map((part, index) =>
                  part.type === 'image' ? (
                    <Pressable key={`${message.id}-part-${index}`} onPress={() => setViewerImageUrl(part.url)} hitSlop={4}>
                      <Image source={{ uri: part.url }} style={styles.inlineImage} resizeMode="cover" />
                    </Pressable>
                  ) : (
                    <Pressable key={`${message.id}-part-${index}`} onLongPress={handleCopy}>
                      <Text style={[styles.content, { color: colors.text }]}>{part.text}</Text>
                    </Pressable>
                  ),
                )}
              </View>
            ) : message.content ? (
              <Pressable onLongPress={handleCopy}>
                <Text style={[styles.content, { color: colors.text }]}>{message.content}</Text>
              </Pressable>
            ) : message.statusLine ? (
              <Text style={[styles.statusLine, { color: colors.icon }]}>{message.statusLine}</Text>
            ) : null}
            {!isUser && message.content && !hasTimeline && onCopyMessage ? (
              <Pressable onPress={handleCopy} style={styles.copyButton}>
                <Ionicons name="copy-outline" size={16} color={colors.icon} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
      <Modal visible={viewerImageUrl !== null} transparent animationType="fade" onRequestClose={() => setViewerImageUrl(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewerImageUrl(null)}>
          <Pressable style={styles.viewerClose} onPress={() => setViewerImageUrl(null)} hitSlop={8}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </Pressable>
          {viewerImageUrl ? (
            <Image source={{ uri: viewerImageUrl }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  messageContainer: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  authorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#ffffff',
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 12,
  },
  messageBody: {
    paddingLeft: 32,
    paddingTop: 6,
  },
  content: {
    fontSize: 14,
    lineHeight: 22,
  },
  imageGroup: {
    marginBottom: 8,
    gap: 8,
  },
  inlineImage: {
    width: 240,
    maxWidth: '100%',
    height: 160,
    borderRadius: 10,
    backgroundColor: '#00000012',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
    maxWidth: 1200,
    maxHeight: 1200,
  },
  viewerClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  statusLine: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  copyButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  systemContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 8,
  },
  systemText: {
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

const timelineStyles = StyleSheet.create({
  container: {
    gap: 4,
  },
  showEarlier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  showEarlierText: {
    fontSize: 13,
    fontWeight: '500',
  },
  item: {
    gap: 2,
    paddingVertical: 2,
  },
  artifactCard: {
    borderRadius: 8,
    marginTop: 6,
    marginRight: 8,
    marginBottom: 6,
  },
  artifactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 2,
  },
  artifactCardHeaderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  artifactAction: {
    fontSize: 11,
    fontWeight: '500',
  },
  artifactFileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  artifactCollapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  artifactCollapsedTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
  },
  artifactFileNameWrap: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  artifactFileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  artifactFileSpinner: {
    width: 12,
    height: 12,
    transform: [{ scale: 0.8 }],
  },
  artifactFileNamePressable: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexShrink: 1,
  },
  artifactFileName: {
    fontSize: 13,
    fontWeight: '600',
  },
  artifactFileNameLink: {
    textDecorationLine: 'underline',
  },
  artifactStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  artifactStatAdd: {
    fontSize: 12,
    fontWeight: '600',
  },
  artifactStatDelete: {
    fontSize: 12,
    fontWeight: '600',
  },
  artifactCodeBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    paddingTop: 0,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  artifactCodeLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 1,
  },
  artifactLineNumber: {
    width: 24,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'right',
    marginRight: 10,
    fontFamily: 'monospace',
  },
  artifactLineText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  artifactOmitted: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingTop: 6,
    fontFamily: 'monospace',
  },
  artifactTooltip: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: 6,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: 320,
    zIndex: 10,
    elevation: 4,
  },
  artifactTooltipText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  args: {
    paddingLeft: 16,
    gap: 2,
  },
  argLine: {
    fontSize: 12,
    lineHeight: 18,
  },
  responseBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  responseText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  duration: {
    fontSize: 12,
  },
  durationRule: {
    height: StyleSheet.hairlineWidth,
    flex: 1,
    opacity: 0.5,
  },
  cost: {
    fontSize: 12,
    paddingTop: 2,
  },
});
