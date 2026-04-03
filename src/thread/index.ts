import type { ReactElement } from 'react';

export { createAgentRunContext, createReasoningState, createTextState } from './createRunContext';
export {
  completeActiveRun,
  createActiveRun,
  getActiveRun,
  rekeyActiveRun,
  setActiveRunAgentName,
  subscribeActiveRun,
  updateActiveRunAgentEntry,
} from './activeRuns';
export { parseAgentStreamLine } from './streamParser';
export { dispatchStreamEvent, finalizeAgentEntry } from './streamReducers';
export { useThread } from './useThread';
export { useComposer } from './useComposer';
export { useThreadMessages } from './useThreadMessages';
export type {
  AgentResponseLogEntry,
  AgentRunContext,
  AgentTimelineItem,
  ComposerImageAttachment,
  LogEntry,
  ResultItem,
  SystemMessageLogEntry,
  ThreadMessage,
  ThreadMessageAttachment,
  ThreadState,
  UseComposerOptions,
  UseComposerResult,
  UseThreadOptions,
  UseThreadResult,
  UserCommandLogEntry,
  UserInputPart,
} from './types';

export type ThreadPaneProps = {
  sessionId?: string | null;
};

export type ThreadListProps = {
  selectedSessionId?: string | null;
};

export function ThreadPane(_props: ThreadPaneProps): ReactElement | null {
  return null;
}

export function ThreadList(_props: ThreadListProps): ReactElement | null {
  return null;
}
