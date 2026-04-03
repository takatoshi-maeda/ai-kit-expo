import type { AgentRunContext, ReasoningState, TextState, UserCommandLogEntry } from './types';

export function createReasoningState(): ReasoningState {
  return {
    activeTimelineId: null,
    pendingPartId: null,
    timelineIdsByPartId: new Map(),
    hasPendingPart: false,
    postToolCallThinkingId: null,
    pendingToolPartId: null,
    toolTimelineIdsByPartId: new Map(),
    toolTimelineIdsByToolCallId: new Map(),
  };
}

export function createTextState(): TextState {
  return {
    segmentCounter: 0,
    currentTimelineId: null,
    currentPartKey: null,
    timelineIdsByPartId: new Map(),
    lastCompletionMs: 0,
    currentBuffer: '',
  };
}

export function createAgentRunContext(params: {
  controller: AbortController;
  agentEntryId: string;
  startedAt: number;
  sessionId: string | null;
  userEntry: UserCommandLogEntry;
}): AgentRunContext {
  return {
    controller: params.controller,
    agentEntryId: params.agentEntryId,
    startedAt: params.startedAt,
    sessionId: params.sessionId,
    userEntry: params.userEntry,
    stdoutBuffer: '',
    stderrBuffer: '',
    resultCounter: 0,
    toolCounter: 0,
    reasoning: createReasoningState(),
    text: {
      ...createTextState(),
      lastCompletionMs: params.startedAt,
    },
  };
}
