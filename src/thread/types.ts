export type UserInputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string };

export type ResultDisplayMode = 'default' | 'agent-only';

type ResultBase = {
  id: string;
  displayMode?: ResultDisplayMode;
};

export type ResultItem =
  | (ResultBase & {
      kind: 'text';
      summary: string;
      description?: string;
    })
  | (ResultBase & {
      kind: 'json';
      data: unknown;
    })
  | (ResultBase & {
      kind: 'table';
      headers: string[];
      rows: Record<string, unknown>[];
    })
  | (ResultBase & {
      kind: 'error';
      message: string;
    });

export type AgentTimelineItem =
  | {
      id: string;
      kind: 'reasoning';
      text: string;
      status: 'running' | 'completed';
      placeholder?: boolean;
    }
  | {
      id: string;
      kind: 'tool-call';
      summary: string;
      argumentLines?: string[];
      truncatedLineCount?: number;
      status: 'running' | 'completed' | 'failed';
      results?: ResultItem[];
    }
  | {
      id: string;
      kind: 'text';
      text: string;
      startedAt?: number;
      updatedAt?: number;
      completedAt?: number;
      previousCompletedAt?: number;
      durationSeconds?: number;
    }
  | {
      id: string;
      kind: 'cumulative-cost';
      amountLabel: string;
    };

export interface LogBase {
  id: string;
  kind: 'user-command' | 'agent-response' | 'tool-call' | 'system-message';
  timestamp: string;
  synthetic?: boolean;
}

export interface UserCommandLogEntry extends LogBase {
  kind: 'user-command';
  commandDisplay: string;
  inputText: string;
  inputParts?: UserInputPart[];
  displayMode?: 'default' | 'userMessage';
}

export interface AgentResponseLogEntry extends LogBase {
  kind: 'agent-response';
  status: 'running' | 'succeeded' | 'failed';
  responseId?: string;
  elapsedSeconds?: number;
  progressSummary?: string;
  progressDescription?: string;
  timeline: AgentTimelineItem[];
  results: ResultItem[];
  responseText?: string;
  taskCostUsd?: number;
  monthlyCostUsd?: number;
  errorMessage?: string;
}

export interface ToolCallLogEntry extends LogBase {
  kind: 'tool-call';
  status: 'running' | 'succeeded' | 'failed';
  toolLabel: string;
  summary?: string;
  argumentLines?: string[];
  truncatedLineCount?: number;
  results: ResultItem[];
  errorMessage?: string;
}

export interface SystemMessageLogEntry extends LogBase {
  kind: 'system-message';
  level: 'info' | 'warning' | 'error';
  message: string;
}

export type LogEntry =
  | UserCommandLogEntry
  | AgentResponseLogEntry
  | ToolCallLogEntry
  | SystemMessageLogEntry;

export type ReasoningState = {
  activeTimelineId: string | null;
  pendingPartId: string | null;
  timelineIdsByPartId: Map<string, string>;
  hasPendingPart: boolean;
  postToolCallThinkingId: string | null;
  pendingToolPartId: string | null;
  toolTimelineIdsByPartId: Map<string, string>;
  toolTimelineIdsByToolCallId: Map<string, string>;
};

export type TextState = {
  segmentCounter: number;
  currentTimelineId: string | null;
  currentPartKey: string | null;
  timelineIdsByPartId: Map<string, string>;
  lastCompletionMs: number;
  currentBuffer: string;
};

export interface AgentRunContext {
  controller: AbortController;
  agentEntryId: string;
  startedAt: number;
  sessionId: string | null;
  userEntry: UserCommandLogEntry;
  stdoutBuffer: string;
  stderrBuffer: string;
  resultCounter: number;
  toolCounter: number;
  costBaseline?: number;
  lastCumulativeAmount?: number;
  reasoning: ReasoningState;
  text: TextState;
}

export type ThreadMessageAttachment = {
  id: string;
  label: string;
  preview?: string;
};

export type ThreadMessage = {
  id: string;
  role: 'user' | 'agent' | 'system';
  author: string;
  timestamp: string;
  content: string;
  contentParts?: UserInputPart[];
  entry?: LogEntry;
  status?: 'running' | 'completed';
  statusLine?: string;
  attachments?: ThreadMessageAttachment[];
};

export type ThreadState = {
  logEntries: LogEntry[];
  agentName: string | null;
  isRunning: boolean;
  runStartedAt: number | null;
  isLoading: boolean;
};

export type UseThreadResult = ThreadState & {
  appendEntry: (entry: LogEntry) => void;
  updateAgentEntry: (
    id: string,
    updater: (entry: AgentResponseLogEntry) => AgentResponseLogEntry,
  ) => void;
  replaceEntries: (entries: LogEntry[]) => void;
  setRunning: (running: boolean, startedAt: number | null) => void;
  setAgentName: (name: string | null) => void;
};

export type ComposerImageAttachment = {
  id: string;
  name: string;
  mediaType: string;
  dataBase64: string;
  byteSize: number;
};

export type UseThreadOptions = {
  agentName?: string;
  pollIntervalMs?: number;
};

export type UseComposerOptions = {
  agentName?: string;
  onRefreshSessions?: () => Promise<void> | void;
  onSyncUsageFromLogEntries?: (entries: LogEntry[]) => void;
  onSessionIdChange?: (sessionId: string) => void;
  onHandleSlashCommand?: (text: string, thread: UseThreadResult) => boolean;
  createSystemMessage?: (message: string) => SystemMessageLogEntry;
};

export type UseComposerResult = {
  submit: (text: string, attachments?: ComposerImageAttachment[]) => Promise<void>;
  abort: () => void;
  isSubmitting: boolean;
  commandHistory: string[];
};
