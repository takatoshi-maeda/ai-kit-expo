import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AgentResponseLogEntry, AgentTimelineItem } from '../types';
import { resolveColors } from './colors';
import { formatDuration, formatShortTimestamp } from './format';
import type { ThreadMessageViewProps } from './types';

const INITIAL_VISIBLE_TIMELINE = 3;

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
}: {
  item: AgentTimelineItem;
  colors: ReturnType<typeof resolveColors>;
}): ReactElement | null {
  if (item.kind === 'reasoning') {
    return (
      <View style={timelineStyles.item}>
        <View style={timelineStyles.header}>
          <TimelineDot running={item.status === 'running'} colors={colors} />
          <Text style={[timelineStyles.label, { color: colors.timelineLabel }]}>Thinking</Text>
        </View>
      </View>
    );
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
}: {
  entry: AgentResponseLogEntry;
  liveElapsed: number;
  colors: ReturnType<typeof resolveColors>;
}): ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const timeline = entry.timeline;
  const isRunning = entry.status === 'running';

  if (timeline.length === 0 && !isRunning) return null;

  const hasThinkingOrTool = timeline.some((item) => item.kind === 'reasoning' || item.kind === 'tool-call');
  const hasTimelineText = timeline.some((item) => item.kind === 'text' && item.text.trim().length > 0);
  const hasResponseText = Boolean(entry.responseText?.trim());
  const showSyntheticThinking = isRunning && !hasThinkingOrTool && !hasResponseText;
  const hiddenCount = expanded ? 0 : Math.max(0, timeline.length - INITIAL_VISIBLE_TIMELINE);
  const visibleItems = expanded ? timeline : timeline.slice(hiddenCount);
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
      ) : expanded && timeline.length > INITIAL_VISIBLE_TIMELINE ? (
        <Pressable onPress={() => setExpanded(false)} style={timelineStyles.showEarlier}>
          <Ionicons name="chevron-up" size={14} color={colors.tint} />
          <Text style={[timelineStyles.showEarlierText, { color: colors.tint }]}>Show less</Text>
        </Pressable>
      ) : null}
      {showSyntheticThinking ? (
        <View style={timelineStyles.item}>
          <View style={timelineStyles.header}>
            <TimelineDot running colors={colors} />
            <Text style={[timelineStyles.label, { color: colors.timelineLabel }]}>Thinking</Text>
          </View>
        </View>
      ) : null}
      {visibleItems.map((item) => (
        <InlineTimelineItem key={item.id} item={item} colors={colors} />
      ))}
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
              <AgentInlineTimeline entry={agentEntry} liveElapsed={liveElapsed} colors={colors} />
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
