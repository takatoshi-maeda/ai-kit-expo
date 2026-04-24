import type { ReactNode } from 'react';

import type { AgentRuntimeInput, AgentRuntimePolicy } from '../../client';
import type { ThreadPathMentionCandidate } from '../pathMentions';
import type { ThreadSkillMentionCandidate } from '../skillMentions';

import type {
  ComposerImageAttachment,
  ThreadMessage,
} from '../types';
import type { ThreadUiColors } from './colors';

export type ThreadListItem = {
  sessionId: string;
  subject: string;
  preview: string;
  updatedAt: string;
  turnCount: number;
  isDraft?: boolean;
  status?: 'idle' | 'progress';
};

export type ThreadCheckpointCandidate = {
  label: string;
  rawTimestamp: string;
};

export type ThreadHistoryItem = {
  sessionId: string;
  label: string;
};

export type ThreadHeaderNavigationItem = {
  key: string;
  label: string;
};

export type ThreadListProps = {
  items: ThreadListItem[];
  isLoading: boolean;
  onSelect: (sessionId: string) => void;
  onRefresh: () => void;
  onCompose?: () => void;
  headerAccessory?: ReactNode;
  selectedSessionId?: string | null;
  colors?: ThreadUiColors;
  emptyTitle?: string;
  emptyHint?: string;
};

export type ThreadMessageViewProps = {
  message: ThreadMessage;
  liveElapsed: number;
  colors?: ThreadUiColors;
  onCopyMessage?: (text: string) => void | Promise<void>;
  onOpenArtifactPath?: (path: string) => void | Promise<void>;
  onPressMessageLink?: (target: string, label: string) => void | Promise<void>;
};

export type ThreadDetailProps = {
  messages: ThreadMessage[];
  elapsedSeconds: number;
  colors?: ThreadUiColors;
  onCopyMessage?: (text: string) => void | Promise<void>;
  onOpenArtifactPath?: (path: string) => void | Promise<void>;
  onPressMessageLink?: (target: string, label: string) => void | Promise<void>;
};

export type ComposerProps = {
  onSubmit: (text: string, attachments: ComposerImageAttachment[]) => void;
  onAbort: () => void;
  isSubmitting: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  colors?: ThreadUiColors;
  placeholder?: string;
  allowImageAttachments?: boolean;
  composerAccessory?: ReactNode;
  draftRestore?: {
    value: string;
    revision: number;
  };
  onKeyDown?: (event: {
    key?: string;
    shiftKey?: boolean;
    isComposing?: boolean;
    preventDefault: () => void;
  }) => boolean | void;
  runtimeControls?: {
    value: AgentRuntimeInput | null;
    policy: AgentRuntimePolicy | null;
    error?: string | null;
    onChange: (patch: Partial<AgentRuntimeInput>) => void;
  };
  pathMentions?: {
    search: (query: string) => Promise<ThreadPathMentionCandidate[]>;
  };
  skillMentions?: {
    search: (query: string) => Promise<ThreadSkillMentionCandidate[]>;
    onSelect?: (item: ThreadSkillMentionCandidate) => void;
  };
};

export type CheckpointPanelProps = {
  candidates: ThreadCheckpointCandidate[];
  selectionIndex: number;
  onSelect: (index: number) => void;
  onApply: () => void;
  onCancel: () => void;
  colors?: ThreadUiColors;
  formatTimestamp?: (isoString: string) => string;
};

export type ThreadPaneProps = {
  title?: string;
  navigation?: {
    label: string;
    items: ThreadHeaderNavigationItem[];
    selectedKey?: string | null;
    onSelect: (key: string) => void;
  };
  headerAccessory?: ReactNode;
  usageSummary?: {
    cumulativeUsd?: number;
    monthlyUsd?: number;
    weeklyUsd?: number;
    dailyUsd?: number;
  };
  messages: ThreadMessage[];
  elapsedSeconds: number;
  onSubmit: (text: string, attachments: ComposerImageAttachment[]) => void;
  onAbort: () => void;
  isSubmitting: boolean;
  onComposerFocus?: () => void;
  colors?: ThreadUiColors;
  placeholder?: string;
  allowImageAttachments?: boolean;
  composerAccessory?: ReactNode;
  draftRestore?: {
    value: string;
    revision: number;
  };
  runtimeControls?: {
    value: AgentRuntimeInput | null;
    policy: AgentRuntimePolicy | null;
    error?: string | null;
    onChange: (patch: Partial<AgentRuntimeInput>) => void;
  };
  pathMentions?: {
    search: (query: string) => Promise<ThreadPathMentionCandidate[]>;
  };
  skillMentions?: {
    search: (query: string) => Promise<ThreadSkillMentionCandidate[]>;
    onSelect?: (item: ThreadSkillMentionCandidate) => void;
  };
  onCopyMessage?: (text: string) => void | Promise<void>;
  onOpenArtifactPath?: (path: string) => void | Promise<void>;
  onPressMessageLink?: (target: string, label: string) => void | Promise<void>;
  onCopyAll?: () => void | Promise<void>;
  showCopyButton?: boolean;
  showHistoryButton?: boolean;
  isHistoryOpen?: boolean;
  canUseHistory?: boolean;
  isHistoryLoading?: boolean;
  historyItems?: ThreadHistoryItem[];
  selectedSessionId?: string | null;
  onToggleHistory?: () => void;
  onSelectHistorySession?: (sessionId: string) => void;
  onComposeNew?: () => void;
  newSessionLabel?: string;
  checkpoint?: {
    visible: boolean;
    candidates: ThreadCheckpointCandidate[];
    selectionIndex: number;
    onOpen?: () => void;
    onMoveSelection?: (delta: number) => void;
    onSelect: (index: number) => void;
    onApply: () => void;
    onCancel: () => void;
    formatTimestamp?: (isoString: string) => string;
    keyboardShortcuts?: {
      enabled?: boolean;
      doubleEscapeWindowMs?: number;
    };
  };
};
