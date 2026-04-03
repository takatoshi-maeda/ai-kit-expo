import { useMemo } from 'react';

import type { AgentResponseLogEntry, AgentTimelineItem, LogEntry, ResultItem, ThreadMessage, ThreadMessageAttachment } from './types';

const MAX_PREVIEW_LINES = 8;
const MAX_PREVIEW_CHARS = 900;
const MAX_TABLE_ROWS = 3;

function trimPreview(value: string, maxLines = MAX_PREVIEW_LINES): string {
  const normalized = value.trimEnd();
  if (!normalized) return '';
  const lines = normalized.split(/\r?\n/);
  const trimmedLines = lines.slice(0, maxLines);
  let output = trimmedLines.join('\n');
  if (output.length > MAX_PREVIEW_CHARS) {
    output = `${output.slice(0, MAX_PREVIEW_CHARS).trimEnd()}...`;
  }
  if (lines.length > maxLines) {
    output = `${output}\n... (${lines.length - maxLines} more lines)`;
  }
  return output;
}

function stringifyJsonPreview(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function formatTablePreview(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.join(' | ');
  const rowLines = rows
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => headers.map((header) => String(row[header] ?? '')).join(' | '));
  let preview = [headerLine, ...rowLines].join('\n');
  if (rows.length > rowLines.length) {
    preview = `${preview}\n... (${rows.length - rowLines.length} more rows)`;
  }
  return trimPreview(preview);
}

function findLatestRunningToolCall(entry: AgentResponseLogEntry): Extract<AgentTimelineItem, { kind: 'tool-call' }> | null {
  for (let i = entry.timeline.length - 1; i >= 0; i -= 1) {
    const item = entry.timeline[i];
    if (item.kind === 'tool-call' && item.status === 'running') return item;
  }
  return null;
}

function collectAgentAttachments(entry: AgentResponseLogEntry): ThreadMessageAttachment[] {
  const attachments: ThreadMessageAttachment[] = [];
  let counter = 0;
  const add = (label: string, preview?: string) => {
    const trimmed = preview?.trim() ?? '';
    attachments.push({
      id: `${entry.id}-att-${counter}`,
      label,
      preview: trimmed.length > 0 ? trimmed : undefined,
    });
    counter += 1;
  };

  for (const result of entry.results) {
    if (result.displayMode === 'agent-only' || result.kind === 'text') continue;
    if (result.kind === 'json') {
      add('JSON result', trimPreview(stringifyJsonPreview(result.data)));
    } else if (result.kind === 'table') {
      add(`Table result (${result.rows.length} rows)`, formatTablePreview(result.headers, result.rows));
    } else if (result.kind === 'error') {
      add('Error result', result.message);
    }
  }

  return attachments;
}

function getAgentMessageContent(entry: AgentResponseLogEntry): string {
  const chunks: string[] = [];

  if (entry.responseText?.trim()) {
    chunks.push(entry.responseText.trim());
  }

  const textResults = entry.results.filter(
    (result): result is Extract<ResultItem, { kind: 'text' }> => result.kind === 'text',
  );

  if (textResults.length > 0) {
    const resultText = textResults
      .map((result) =>
        [result.summary, result.description]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .join('\n'),
      )
      .filter((value) => value.trim().length > 0)
      .join('\n\n');
    if (resultText.trim()) chunks.push(resultText.trim());
  }

  if (chunks.length > 0) return chunks.join('\n\n').trim();

  for (let i = entry.timeline.length - 1; i >= 0; i -= 1) {
    const item = entry.timeline[i];
    if (item.kind === 'text' && item.text.trim()) return item.text.trim();
  }

  return '';
}

function formatDuration(seconds: number): string {
  const normalized = Math.max(0, Math.floor(seconds));
  const s = normalized % 60;
  const totalMinutes = Math.floor(normalized / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function buildAgentStatusLine(entry: AgentResponseLogEntry, indicatorSeconds: number): string | null {
  if (entry.status !== 'running') return null;
  const parts: string[] = [];
  const summary = entry.progressSummary?.trim();
  const description = entry.progressDescription?.trim();
  if (summary && summary.toLowerCase() !== 'thinking') parts.push(summary);
  if (description) parts.push(description);
  if (parts.length === 0) {
    const runningTool = findLatestRunningToolCall(entry);
    if (runningTool?.summary) parts.push(`Tool: ${runningTool.summary.trim()}`);
  }
  if (parts.length === 0) parts.push('Thinking');
  if (indicatorSeconds > 0) parts.push(`(${formatDuration(indicatorSeconds)})`);
  return parts.join(' ');
}

export function useThreadMessages(
  logEntries: LogEntry[],
  appName: string,
  indicatorSeconds: number,
): ThreadMessage[] {
  return useMemo(() => {
    const messages: ThreadMessage[] = [];
    for (const entry of logEntries) {
      if (entry.kind === 'user-command' && entry.displayMode === 'userMessage') {
        messages.push({
          id: entry.id,
          role: 'user',
          author: 'You',
          timestamp: entry.timestamp,
          content: entry.inputText,
          contentParts: entry.inputParts,
          entry,
          status: 'completed',
        });
      }
      if (entry.kind === 'agent-response') {
        messages.push({
          id: entry.id,
          role: 'agent',
          author: appName,
          timestamp: entry.timestamp,
          content: getAgentMessageContent(entry),
          entry,
          status: entry.status === 'running' ? 'running' : 'completed',
          statusLine: buildAgentStatusLine(entry, indicatorSeconds) ?? undefined,
          attachments: collectAgentAttachments(entry),
        });
      }
      if (entry.kind === 'system-message') {
        messages.push({
          id: entry.id,
          role: 'system',
          author: 'System',
          timestamp: entry.timestamp,
          content: entry.message,
          entry,
          status: 'completed',
        });
      }
    }
    return messages;
  }, [appName, indicatorSeconds, logEntries]);
}
