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

function formatCostLabel(amount: number, currency?: string): string {
  const unit = currency ?? 'USD';
  if (Number.isFinite(amount)) {
    return `Cost: ${unit === 'USD' ? '$' : `${unit} `}${amount.toFixed(3)}`;
  }
  return `Cost: ${amount} ${unit}`;
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

function findArtifact(timeline: AgentTimelineItem[], id: string) {
  const index = findIndex(timeline, 'artifact', id);
  if (index < 0) return undefined;
  const item = timeline[index];
  if (item.kind !== 'artifact') return undefined;
  return { item, index };
}

function findLatestRunningToolCallIndex(timeline: AgentTimelineItem[]): number {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const item = timeline[i];
    if (item.kind === 'tool-call' && item.status === 'running') return i;
  }
  return -1;
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
  if (!event.partId && ctx.reasoning.pendingToolPartId) {
    ctx.reasoning.toolTimelineIdsByPartId.set(ctx.reasoning.pendingToolPartId, timelineId);
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

function unbindToolTimeline(ctx: AgentRunContext, timelineId: string): void {
  for (const [key, value] of ctx.reasoning.toolTimelineIdsByToolCallId.entries()) {
    if (value === timelineId) ctx.reasoning.toolTimelineIdsByToolCallId.delete(key);
  }
  for (const [key, value] of ctx.reasoning.toolTimelineIdsByPartId.entries()) {
    if (value === timelineId) ctx.reasoning.toolTimelineIdsByPartId.delete(key);
  }
}

function ensureTextResult(entry: AgentResponseLogEntry, ctx: AgentRunContext): ResultItem[] {
  if (entry.results.length > 0) return entry.results;
  const text = entry.responseText?.trim();
  if (!text) return entry.results;
  return [
    ...entry.results,
    { id: makeResultId(ctx), kind: 'text', summary: text },
  ];
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

    const shouldStartNew = ctx.reasoning.hasPendingPart;
    const activeId = ctx.reasoning.activeTimelineId;
    let reasoningIndex = activeId ? findIndex(timeline, 'reasoning', activeId) : -1;
    type ReasoningItem = Extract<AgentTimelineItem, { kind: 'reasoning' }>;
    let existing: ReasoningItem | null = null;

    if (reasoningIndex >= 0) {
      const candidate = timeline[reasoningIndex] as ReasoningItem;
      if (candidate.status !== 'completed') {
        existing = candidate;
      } else {
        reasoningIndex = -1;
      }
    }

    if (!existing && !shouldStartNew) {
      for (let i = timeline.length - 1; i >= 0; i -= 1) {
        const item = timeline[i];
        if (item.kind === 'reasoning' && item.status !== 'completed') {
          existing = item;
          reasoningIndex = i;
          break;
        }
      }
    }

    if (!existing) {
      if (shouldStartNew) completeLatestRunningReasoning(timeline);
      const newId = createUniqueId(`${ctx.agentEntryId}-reasoning`);
      timeline.push({ id: newId, kind: 'reasoning', status: 'running', text: event.delta });
      const pendingPartId = ctx.reasoning.pendingPartId;
      if (pendingPartId) ctx.reasoning.timelineIdsByPartId.set(pendingPartId, newId);
      ctx.reasoning.pendingPartId = null;
      ctx.reasoning.activeTimelineId = newId;
      ctx.reasoning.hasPendingPart = false;
      return { entry: { ...entry, timeline } };
    }

    timeline[reasoningIndex] = {
      ...existing,
      text: `${existing.text ?? ''}${event.delta}`,
      status: 'running',
      placeholder: undefined,
    };
    ctx.reasoning.activeTimelineId = existing.id;
    ctx.reasoning.pendingPartId = null;
    ctx.reasoning.hasPendingPart = false;
    return { entry: { ...entry, timeline } };
  }

  if (event.kind === 'artifactAdded') {
    const timeline = [...entry.timeline];
    const found = findArtifact(timeline, event.itemId);
    const nextItem: AgentTimelineItem = {
      id: event.itemId,
      kind: 'artifact',
      text: found?.item.text ?? '',
      path: event.path ?? found?.item.path,
      contentType: event.contentType,
      status: 'running',
    };

    if (found) {
      timeline[found.index] = nextItem;
      moveToEnd(timeline, found.index);
    } else {
      timeline.push(nextItem);
    }

    return { entry: { ...entry, timeline } };
  }

  if (event.kind === 'artifactDelta') {
    const timeline = [...entry.timeline];
    const found = findArtifact(timeline, event.itemId);
    const nextItem: AgentTimelineItem = {
      id: event.itemId,
      kind: 'artifact',
      text: `${found?.item.text ?? ''}${event.delta}`,
      path: found?.item.path,
      contentType: 'artifact',
      status: 'running',
    };

    if (found) {
      timeline[found.index] = nextItem;
      moveToEnd(timeline, found.index);
    } else {
      timeline.push(nextItem);
    }

    return { entry: { ...entry, timeline } };
  }

  if (event.kind === 'artifactDone') {
    const timeline = [...entry.timeline];
    const found = findArtifact(timeline, event.itemId);
    const nextItem: AgentTimelineItem = {
      id: event.itemId,
      kind: 'artifact',
      text: found?.item.text ?? '',
      path: event.path ?? found?.item.path,
      contentType: event.contentType,
      status: 'completed',
    };

    if (found) {
      timeline[found.index] = nextItem;
      moveToEnd(timeline, found.index);
    } else {
      timeline.push(nextItem);
    }

    return { entry: { ...entry, timeline } };
  }

  if (event.kind === 'toolCall') {
    const timeline = [...entry.timeline];

    if (ctx.reasoning.postToolCallThinkingId) {
      completeById(timeline, 'reasoning', ctx.reasoning.postToolCallThinkingId);
      ctx.reasoning.postToolCallThinkingId = null;
    }

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
    ctx.reasoning.pendingPartId = null;
    ctx.reasoning.hasPendingPart = false;
    ctx.reasoning.pendingToolPartId = null;
    return { entry: { ...entry, timeline } };
  }

  if (event.kind === 'toolCallFinish') {
    const existingPlaceholderId = ctx.reasoning.postToolCallThinkingId;
    const timeline = [...entry.timeline];

    if (existingPlaceholderId) {
      completeById(timeline, 'reasoning', existingPlaceholderId);
    }

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
    const targetIndex =
      mappedIndex >= 0 && timeline[mappedIndex]?.kind === 'tool-call'
        ? mappedIndex
        : findLatestRunningToolCallIndex(timeline);

    if (targetIndex >= 0) {
      const item = timeline[targetIndex];
      if (item.kind === 'tool-call') {
        const existingResults = Array.isArray(item.results) ? item.results : [];
        timeline[targetIndex] = {
          ...item,
          status: 'completed',
          results: results.length > 0 ? [...existingResults, ...results] : existingResults,
        };
        unbindToolTimeline(ctx, item.id);
      }
    }

    let nextPlaceholderId: string | null = null;
    if (entry.status === 'running') {
      nextPlaceholderId = createUniqueId(`${ctx.agentEntryId}-thinking`);
      timeline.push({
        id: nextPlaceholderId,
        kind: 'reasoning',
        status: 'running',
        text: '',
        placeholder: true,
      });
    }

    ctx.reasoning.postToolCallThinkingId = nextPlaceholderId;
    ctx.reasoning.activeTimelineId = null;
    ctx.reasoning.pendingPartId = null;
    ctx.reasoning.hasPendingPart = false;
    ctx.reasoning.pendingToolPartId = null;
    return { entry: { ...entry, timeline } };
  }

  if (event.kind === 'text') {
    const summaryText = event.summary?.trim() ?? '';
    const descriptionText = event.description?.trimEnd();
    const combinedText = summaryText && descriptionText
      ? `${summaryText}\n${descriptionText}`
      : summaryText || descriptionText || '';

    const timeline = [...entry.timeline];
    completeLatestRunningToolCall(ctx, timeline);
    const existingTextIndex = timeline.findIndex(
      (item) => item.kind === 'text' && item.text.trim().length === 0,
    );
    const hasAnyText = timeline.some(
      (item) => item.kind === 'text' && item.text.trim().length > 0,
    );

    if (combinedText && !hasAnyText) {
      const completedAt = Date.now();
      const baseline = ctx.text.lastCompletionMs ?? ctx.startedAt;
      const durationSeconds = Math.max(0, Math.floor((completedAt - baseline) / 1000));

      if (existingTextIndex >= 0) {
        const existing = timeline[existingTextIndex] as Extract<AgentTimelineItem, { kind: 'text' }>;
        timeline[existingTextIndex] = {
          ...existing,
          text: combinedText,
          completedAt,
          durationSeconds,
          updatedAt: completedAt,
        };
      } else {
        ctx.text.segmentCounter += 1;
        timeline.push({
          id: createUniqueId(`${ctx.agentEntryId}-text-${ctx.text.segmentCounter}`),
          kind: 'text',
          text: combinedText,
          startedAt: completedAt,
          updatedAt: completedAt,
          completedAt,
          previousCompletedAt: ctx.text.lastCompletionMs,
          durationSeconds,
        });
      }
      ctx.text.lastCompletionMs = completedAt;
    }

    const responseText =
      entry.responseText && entry.responseText.trim().length > 0
        ? entry.responseText
        : combinedText || entry.responseText;

    return {
      entry: {
        ...entry,
        responseId: entry.responseId ?? event.responseId,
        responseText,
        timeline,
        results: [
          ...entry.results,
          {
            id: makeResultId(ctx),
            kind: 'text',
            summary: event.summary,
            description: event.description,
          },
        ],
      },
    };
  }

  if (event.kind === 'json') {
    return {
      entry: {
        ...entry,
        responseId: entry.responseId ?? event.responseId,
        results: [...entry.results, { id: makeResultId(ctx), kind: 'json', data: event.data }],
      },
    };
  }

  if (event.kind === 'table') {
    return {
      entry: {
        ...entry,
        responseId: entry.responseId ?? event.responseId,
        results: [
          ...entry.results,
          { id: makeResultId(ctx), kind: 'table', headers: event.headers, rows: event.data },
        ],
      },
    };
  }

  if (event.kind === 'cumulativeCost') {
    const { amount, currency } = event;
    if (ctx.costBaseline === undefined) ctx.costBaseline = amount;
    ctx.lastCumulativeAmount = amount;

    let taskCost: number | undefined;
    if (ctx.costBaseline !== undefined) {
      const delta = amount - ctx.costBaseline;
      taskCost = delta > 0 ? delta : amount;
    } else {
      taskCost = amount;
    }

    return {
      entry: {
        ...entry,
        taskCostUsd: Number.isFinite(taskCost) ? taskCost : entry.taskCostUsd,
        monthlyCostUsd: Number.isFinite(amount) ? amount : entry.monthlyCostUsd,
        timeline: [
          ...entry.timeline,
          {
            id: createUniqueId(`${ctx.agentEntryId}-cost`),
            kind: 'cumulative-cost',
            amountLabel: formatCostLabel(amount, currency),
          },
        ],
      },
    };
  }

  if (event.kind === 'partAdded') {
    if (event.partType === 'ReasoningSummary') {
      const placeholderId = ctx.reasoning.postToolCallThinkingId;
      const partId = event.partId ?? null;
      const activeId = ctx.reasoning.activeTimelineId;
      const timeline = [...entry.timeline];

      if (activeId && activeId !== placeholderId) {
        completeById(timeline, 'reasoning', activeId);
      }

      if (placeholderId) {
        const index = findIndex(timeline, 'reasoning', placeholderId);
        if (index >= 0) {
          const item = timeline[index] as Extract<AgentTimelineItem, { kind: 'reasoning' }>;
          timeline[index] = { ...item, placeholder: undefined, status: 'running', text: '' };
        }
        if (partId) ctx.reasoning.timelineIdsByPartId.set(partId, placeholderId);
        ctx.reasoning.activeTimelineId = placeholderId;
        ctx.reasoning.postToolCallThinkingId = null;
        ctx.reasoning.pendingPartId = null;
        ctx.reasoning.hasPendingPart = false;
      } else {
        ctx.reasoning.activeTimelineId = null;
        ctx.reasoning.pendingPartId = partId;
        ctx.reasoning.hasPendingPart = true;
      }
      return { entry: { ...entry, timeline } };
    }

    if (event.partType === 'TextResult') {
      const timeline = [...entry.timeline];
      completeLatestRunningToolCall(ctx, timeline);
      const existingTimelineId = ctx.text.currentTimelineId;
      if (existingTimelineId) {
        const previousKey = ctx.text.currentPartKey;
        const partKey = event.partId ?? previousKey ?? `__implicit-text-${ctx.text.segmentCounter || 1}`;
        if (previousKey && previousKey !== partKey) {
          ctx.text.timelineIdsByPartId.delete(previousKey);
        }
        ctx.text.timelineIdsByPartId.set(partKey, existingTimelineId);
        ctx.text.currentPartKey = partKey;
        return { entry: { ...entry, timeline } };
      }

      const now = Date.now();
      ctx.text.segmentCounter += 1;
      const timelineId = createUniqueId(`${ctx.agentEntryId}-text-${ctx.text.segmentCounter}`);
      const partKey = event.partId ?? `__implicit-text-${ctx.text.segmentCounter}`;
      ctx.text.timelineIdsByPartId.set(partKey, timelineId);
      ctx.text.currentPartKey = partKey;
      ctx.text.currentTimelineId = timelineId;
      ctx.text.currentBuffer = '';
      return {
        entry: {
          ...entry,
          timeline: [
            ...timeline,
            {
              id: timelineId,
              kind: 'text',
              text: '',
              startedAt: now,
              updatedAt: now,
              previousCompletedAt: ctx.text.lastCompletionMs,
            },
          ],
        },
      };
    }

    if (event.partType === 'ToolCall') {
      ctx.reasoning.pendingToolPartId = event.partId ?? null;
    }

    return { entry };
  }

  if (event.kind === 'partDone') {
    if (event.partType === 'ReasoningSummary') {
      const partId = event.partId;
      const timelineId =
        (partId ? ctx.reasoning.timelineIdsByPartId.get(partId) : undefined) ??
        ctx.reasoning.activeTimelineId;
      if (timelineId) {
        const timeline = [...entry.timeline];
        completeById(timeline, 'reasoning', timelineId);
        entry = { ...entry, timeline };
      }
      if (partId) ctx.reasoning.timelineIdsByPartId.delete(partId);
      if (ctx.reasoning.activeTimelineId === timelineId) ctx.reasoning.activeTimelineId = null;
      if (ctx.reasoning.pendingPartId === partId) ctx.reasoning.pendingPartId = null;
      ctx.reasoning.hasPendingPart = false;
      return { entry };
    }

    if (event.partType === 'TextResult') {
      const partKey = event.partId ?? ctx.text.currentPartKey;
      const timelineId =
        (partKey ? ctx.text.timelineIdsByPartId.get(partKey) : undefined) ??
        ctx.text.currentTimelineId;
      if (timelineId) {
        const completedAt = Date.now();
        const finalText = ctx.text.currentBuffer;
        const timeline = [...entry.timeline];
        const found = findText(timeline, timelineId);
        if (found) {
          const baseline = found.item.previousCompletedAt ?? ctx.text.lastCompletionMs;
          const durationSeconds = Math.max(0, Math.floor((completedAt - baseline) / 1000));
          timeline[found.index] = {
            ...found.item,
            text: finalText.length > 0 ? finalText : found.item.text,
            completedAt,
            durationSeconds,
            updatedAt: completedAt,
          };
          entry = { ...entry, timeline };
        }
        ctx.text.lastCompletionMs = completedAt;
      }
      if (partKey) ctx.text.timelineIdsByPartId.delete(partKey);
      ctx.text.currentTimelineId = null;
      ctx.text.currentPartKey = null;
      ctx.text.currentBuffer = '';
      return { entry };
    }

    if (event.partType === 'ToolCall') {
      const timeline = [...entry.timeline];
      const mappedTimelineId =
        (event.partId ? ctx.reasoning.toolTimelineIdsByPartId.get(event.partId) : undefined) ?? null;
      const mappedIndex =
        mappedTimelineId != null ? findIndex(timeline, 'tool-call', mappedTimelineId) : -1;
      const targetIndex =
        mappedIndex >= 0 && timeline[mappedIndex]?.kind === 'tool-call'
          ? mappedIndex
          : findLatestRunningToolCallIndex(timeline);
      if (targetIndex >= 0) {
        const item = timeline[targetIndex];
        if (item.kind === 'tool-call' && item.status === 'running') {
          timeline[targetIndex] = { ...item, status: 'completed' };
          unbindToolTimeline(ctx, item.id);
        }
        entry = { ...entry, timeline };
      }
      if (event.partId) ctx.reasoning.toolTimelineIdsByPartId.delete(event.partId);
      if (ctx.reasoning.pendingToolPartId === event.partId) ctx.reasoning.pendingToolPartId = null;
      return { entry };
    }
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
  const finishedAt = Date.now();
  const status: AgentResponseLogEntry['status'] = exitCode === 0 ? 'succeeded' : 'failed';
  const resolvedErrorMessage =
    status === 'failed'
      ? wasAborted
        ? '実行をキャンセルしました'
        : errorMessage || `agent exited with code ${exitCode ?? 'null'}`
      : undefined;

  let lastTextCompletionMs = ctx.text.lastCompletionMs;
  const timeline: AgentTimelineItem[] = entry.timeline.map((item) => {
    if (item.kind === 'reasoning' && item.status === 'running') {
      return { ...item, status: 'completed' };
    }
    if (item.kind === 'tool-call' && item.status === 'running') {
      return { ...item, status: 'completed' };
    }
    if (item.kind === 'artifact' && item.status === 'running') {
      return { ...item, status: 'completed' };
    }
    if (item.kind === 'text') {
      if (typeof item.durationSeconds === 'number') {
        if (typeof item.completedAt === 'number') {
          lastTextCompletionMs = Math.max(lastTextCompletionMs, item.completedAt);
        }
        return item;
      }
      const completedAt = finishedAt;
      const baseline = item.previousCompletedAt ?? lastTextCompletionMs ?? ctx.startedAt;
      const durationSeconds = Math.max(0, Math.floor((completedAt - baseline) / 1000));
      lastTextCompletionMs = completedAt;
      return { ...item, completedAt, durationSeconds, updatedAt: completedAt };
    }
    return item;
  });

  const elapsedSeconds = Math.max(0, Math.round((finishedAt - ctx.startedAt) / 1000));
  const results = ensureTextResult({ ...entry, timeline }, ctx);

  const baselineAmount =
    typeof ctx.costBaseline === 'number' && Number.isFinite(ctx.costBaseline)
      ? ctx.costBaseline
      : null;
  const lastAmount =
    typeof ctx.lastCumulativeAmount === 'number' && Number.isFinite(ctx.lastCumulativeAmount)
      ? ctx.lastCumulativeAmount
      : null;

  let taskCostUsd = entry.taskCostUsd;
  if (lastAmount != null && baselineAmount != null) {
    const delta = lastAmount - baselineAmount;
    taskCostUsd = delta > 0 ? delta : lastAmount;
  } else if (lastAmount != null) {
    taskCostUsd = lastAmount;
  }

  ctx.text.lastCompletionMs = lastTextCompletionMs;
  ctx.text.currentTimelineId = null;
  ctx.text.currentPartKey = null;
  ctx.text.currentBuffer = '';
  ctx.text.timelineIdsByPartId.clear();
  ctx.reasoning.activeTimelineId = null;
  ctx.reasoning.pendingPartId = null;
  ctx.reasoning.hasPendingPart = false;
  ctx.reasoning.postToolCallThinkingId = null;
  ctx.reasoning.pendingToolPartId = null;
  ctx.reasoning.timelineIdsByPartId.clear();
  ctx.reasoning.toolTimelineIdsByPartId.clear();
  ctx.reasoning.toolTimelineIdsByToolCallId.clear();

  return {
    ...entry,
    status,
    errorMessage: resolvedErrorMessage,
    elapsedSeconds,
    taskCostUsd,
    timeline,
    results,
    progressSummary: status === 'succeeded' ? undefined : entry.progressSummary,
    progressDescription: status === 'succeeded' ? undefined : entry.progressDescription,
  };
}
