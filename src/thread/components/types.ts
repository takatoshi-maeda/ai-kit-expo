import type { ReactNode } from 'react';

import type { ThreadPathMentionCandidate } from '../pathMentions';

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
};

export type ThreadDetailProps = {
  messages: ThreadMessage[];
  elapsedSeconds: number;
  colors?: ThreadUiColors;
  onCopyMessage?: (text: string) => void | Promise<void>;
};

export type ComposerProps = {
  onSubmit: (text: string, attachments: ComposerImageAttachment[]) => void;
  onAbort: () => void;
  isSubmitting: boolean;
  colors?: ThreadUiColors;
  placeholder?: string;
  allowImageAttachments?: boolean;
  pathMentions?: {
    search: (query: string) => Promise<ThreadPathMentionCandidate[]>;
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
  messages: ThreadMessage[];
  elapsedSeconds: number;
  onSubmit: (text: string, attachments: ComposerImageAttachment[]) => void;
  onAbort: () => void;
  isSubmitting: boolean;
  colors?: ThreadUiColors;
  placeholder?: string;
  allowImageAttachments?: boolean;
  pathMentions?: {
    search: (query: string) => Promise<ThreadPathMentionCandidate[]>;
  };
  onCopyMessage?: (text: string) => void | Promise<void>;
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
    onSelect: (index: number) => void;
    onApply: () => void;
    onCancel: () => void;
    formatTimestamp?: (isoString: string) => string;
  };
};
