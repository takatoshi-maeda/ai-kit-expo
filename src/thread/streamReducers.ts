import type { AgentResponseLogEntry, AgentRunContext, AgentTimelineItem, ResultItem } from './types';
import type { AgentStreamEvent } from './streamParser';

function createUniqueId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function makeResultId(ctx: AgentRunContext): string {
  ctx.resultCounter += 1;
  return `${ctx.agentEntryId}-result-${ctx.resultCounter}`;
}

function findIndex(timeline: AgentTimelineItem[], kind: AgentTimelineItem['kind'], id: string): number {
  return timeline.findIndex((item) => item.kind === kind && item.id === id);
}

function completeById(
  timeline: AgentTimelineItem[],
  kind: 'reasoning' | 'tool-call',
  id: string | null | undefined,
): boolean {
  if (!id) return false;
  const index = findIndex(timeline, kind, id);
  if (index < 0) return false;
  const item = timeline[index];
  if ((item.kind !== 'reasoning' && item.kind !== 'tool-call') || item.status === 'completed') {
    return true;
  }
  timeline[index] = { ...item, status: 'completed' };
  return true;
}

function completeLatestRunningReasoning(timeline: AgentTimelineItem[]): string | null {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const item = timeline[i];
    if (item.kind === 'reasoning' && item.status !== 'completed') {
      timeline[i] = { ...item, status: 'completed' };
      return item.id;
    }
  }
  return null;
}

function moveToEnd(timeline: AgentTimelineItem[], index: number): void {
  if (index >= 0 && index < timeline.length - 1) {
    const [moved] = timeline.splice(index, 1);
    if (moved) timeline.push(moved);
  }
}

function splitArgumentLines(description?: string): string[] | undefined {
  if (!description) return undefined;
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : undefined;
}

function findText(timeline: AgentTimelineItem[], id: string) {
  const index = findIndex(timeline, 'text', id);
  if (index < 0) return undefined;
  const item = timeline[index];
  if (item.kind !== 'text') return undefined;
  return { item, index };
}

function findLatestRunningToolCallIndex(timeline: AgentTimelineItem[]): number {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const item = timeline[i];
    if (item.kind === 'tool-call' && item.status === 'running') return i;
  }
  return -1;
}

function unbindToolTimeline(ctx: AgentRunContext, timelineId: string): void {
  for (const [key, value] of ctx.reasoning.toolTimelineIdsByToolCallId.entries()) {
    if (value === timelineId) ctx.reasoning.toolTimelineIdsByToolCallId.delete(key);
  }
  for (const [key, value] of ctx.reasoning.toolTimelineIdsByPartId.entries()) {
    if (value === timelineId) ctx.reasoning.toolTimelineIdsByPartId.delete(key);
  }
}

function completeLatestRunningToolCall(ctx: AgentRunContext, timeline: AgentTimelineItem[]): void {
  const index = findLatestRunningToolCallIndex(timeline);
  if (index < 0) return;
  const item = timeline[index];
  if (item.kind !== 'tool-call' || item.status !== 'running') return;
  timeline[index] = { ...item, status: 'completed' };
  unbindToolTimeline(ctx, item.id);
}

function bindToolTimeline(
  ctx: AgentRunContext,
  timelineId: string,
  event: { toolCallId?: string; partId?: string },
): void {
  if (event.toolCallId) {
    ctx.reasoning.toolTimelineIdsByToolCallId.set(event.toolCallId, timelineId);
  }
  if (event.partId) {
    ctx.reasoning.toolTimelineIdsByPartId.set(event.partId, timelineId);
  }
}

function resolveToolTimelineId(
  ctx: AgentRunContext,
  event: { toolCallId?: string; partId?: string },
): string | null {
  if (event.toolCallId) {
    const resolved = ctx.reasoning.toolTimelineIdsByToolCallId.get(event.toolCallId);
    if (resolved) return resolved;
  }
  if (event.partId) {
    const resolved = ctx.reasoning.toolTimelineIdsByPartId.get(event.partId);
    if (resolved) return resolved;
  }
  return null;
}

export type DispatchStreamEventResult = {
  entry: AgentResponseLogEntry;
  agentName?: string;
};

export function dispatchStreamEvent(
  ctx: AgentRunContext,
  event: AgentStreamEvent,
  entry: AgentResponseLogEntry,
): DispatchStreamEventResult {
  if (event.kind === 'progress') {
    return {
      entry: {
        ...entry,
        progressSummary: event.summary,
        progressDescription: event.description,
      },
    };
  }

  if (event.kind === 'changeStateStarted') {
    return { entry, agentName: event.agentName ?? event.agentId };
  }

  if (event.kind === 'textDelta') {
    const now = Date.now();
    ctx.text.currentBuffer += event.delta;
    const timeline = [...entry.timeline];

    if (ctx.reasoning.postToolCallThinkingId) {
      completeById(timeline, 'reasoning', ctx.reasoning.postToolCallThinkingId);
      ctx.reasoning.postToolCallThinkingId = null;
    }
    completeLatestRunningToolCall(ctx, timeline);

    let timelineId = ctx.text.currentTimelineId;
    if (!timelineId) {
      ctx.text.segmentCounter += 1;
      timelineId = createUniqueId(`${ctx.agentEntryId}-text-${ctx.text.segmentCounter}`);
      ctx.text.currentTimelineId = timelineId;
      if (!ctx.text.currentPartKey) {
        ctx.text.currentPartKey = `__implicit-text-${ctx.text.segmentCounter}`;
      }
      if (ctx.text.currentPartKey) {
        ctx.text.timelineIdsByPartId.set(ctx.text.currentPartKey, timelineId);
      }
      timeline.push({
        id: timelineId,
        kind: 'text',
        text: '',
        startedAt: now,
        updatedAt: now,
        previousCompletedAt: ctx.text.lastCompletionMs,
      });
    }

    const found = findText(timeline, timelineId);
    const updatedItem: AgentTimelineItem = {
      id: timelineId,
      kind: 'text',
      text: ctx.text.currentBuffer,
      startedAt: found?.item.startedAt ?? now,
      updatedAt: now,
      previousCompletedAt: found?.item.previousCompletedAt ?? ctx.text.lastCompletionMs,
      completedAt: found?.item.completedAt,
      durationSeconds: found?.item.durationSeconds,
    };

    if (found) {
      timeline[found.index] = updatedItem;
      moveToEnd(timeline, found.index);
    } else {
      timeline.push(updatedItem);
    }

    return {
      entry: {
        ...entry,
        responseText: (entry.responseText ?? '') + event.delta,
        timeline,
      },
    };
  }

  if (event.kind === 'reasoningSummaryDelta') {
    const timeline = [...entry.timeline];
    if (ctx.reasoning.postToolCallThinkingId) {
      completeById(timeline, 'reasoning', ctx.reasoning.postToolCallThinkingId);
      ctx.reasoning.postToolCallThinkingId = null;
    }

    const activeId = ctx.reasoning.activeTimelineId;
    const activeIndex = activeId ? findIndex(timeline, 'reasoning', activeId) : -1;
    const activeItem =
      activeIndex >= 0 && timeline[activeIndex]?.kind === 'reasoning'
        ? timeline[activeIndex]
        : null;

    if (activeItem && activeItem.status !== 'completed') {
      timeline[activeIndex] = {
        ...activeItem,
        text: `${activeItem.text}${event.delta}`,
        status: 'running',
        placeholder: undefined,
      };
      return { entry: { ...entry, timeline } };
    }

    const newId = createUniqueId(`${ctx.agentEntryId}-reasoning`);
    timeline.push({ id: newId, kind: 'reasoning', status: 'running', text: event.delta });
    ctx.reasoning.activeTimelineId = newId;
    return { entry: { ...entry, timeline } };
  }

  if (event.kind === 'toolCall') {
    const timeline = [...entry.timeline];
    if (!completeById(timeline, 'reasoning', ctx.reasoning.activeTimelineId)) {
      completeLatestRunningReasoning(timeline);
    }
    const timelineId = createUniqueId(`${ctx.agentEntryId}-tool`);
    timeline.push({
      id: timelineId,
      kind: 'tool-call',
      summary: event.summary,
      status: 'running',
      argumentLines: splitArgumentLines(event.description),
    });
    bindToolTimeline(ctx, timelineId, event);
    ctx.reasoning.activeTimelineId = null;
    return { entry: { ...entry, timeline } };
  }

  if (event.kind === 'toolCallFinish') {
    const timeline = [...entry.timeline];
    const results: ResultItem[] = [];
    const summary = typeof event.summary === 'string' ? event.summary.trim() : '';
    const description = typeof event.description === 'string' ? event.description.trimEnd() : undefined;
    if (summary || description) {
      let resultSummary = summary;
      let resultDescription = description;
      if (!resultSummary && resultDescription) {
        const [first, ...rest] = resultDescription.split(/\r?\n/);
        resultSummary = first?.trim() || '(tool result)';
        const remaining = rest.join('\n').trimEnd();
        resultDescription = remaining.length > 0 ? remaining : undefined;
      }
      if (resultSummary) {
        results.push({
          id: makeResultId(ctx),
          kind: 'text',
          summary: resultSummary,
          description: resultDescription,
        });
      }
    }

    const mappedId = resolveToolTimelineId(ctx, event);
    const mappedIndex = mappedId ? findIndex(timeline, 'tool-call', mappedId) : -1;
    const targetIndex = mappedIndex >= 0 ? mappedIndex : findLatestRunningToolCallIndex(timeline);

    if (targetIndex >= 0) {
      const item = timeline[targetIndex];
      if (item.kind === 'tool-call') {
        timeline[targetIndex] = {
          ...item,
          status: 'completed',
          results: [...(item.results ?? []), ...results],
        };
        unbindToolTimeline(ctx, item.id);
      }
    }

    return { entry: { ...entry, timeline } };
  }

  if (event.kind === 'text') {
    return {
      entry: {
        ...entry,
        results: [
          ...entry.results,
          {
            id: makeResultId(ctx),
            kind: 'text',
            summary: event.summary,
            description: event.description,
          },
        ],
        responseId: entry.responseId ?? event.responseId,
      },
    };
  }

  if (event.kind === 'json') {
    return {
      entry: {
        ...entry,
        results: [...entry.results, { id: makeResultId(ctx), kind: 'json', data: event.data }],
        responseId: entry.responseId ?? event.responseId,
      },
    };
  }

  if (event.kind === 'table') {
    return {
      entry: {
        ...entry,
        results: [
          ...entry.results,
          { id: makeResultId(ctx), kind: 'table', headers: event.headers, rows: event.data },
        ],
        responseId: entry.responseId ?? event.responseId,
      },
    };
  }

  if (event.kind === 'cumulativeCost') {
    return {
      entry: {
        ...entry,
        taskCostUsd: event.currency === 'USD' || !event.currency ? event.amount : entry.taskCostUsd,
        monthlyCostUsd: event.currency === 'USD' || !event.currency ? event.amount : entry.monthlyCostUsd,
      },
    };
  }

  return { entry };
}

export function finalizeAgentEntry(
  ctx: AgentRunContext,
  entry: AgentResponseLogEntry,
  exitCode: number | null,
  wasAborted: boolean,
  errorMessage?: string,
): AgentResponseLogEntry {
  const status = wasAborted
    ? 'failed'
    : exitCode === 0
      ? 'succeeded'
      : 'failed';
  const completedAt = Date.now();
  const results = [...entry.results];

  if (status === 'failed' && errorMessage) {
    results.push({ id: makeResultId(ctx), kind: 'error', message: errorMessage });
  }

  return {
    ...entry,
    status,
    errorMessage,
    elapsedSeconds: Math.max(0, Math.round((completedAt - ctx.startedAt) / 1000)),
    results,
  };
}
