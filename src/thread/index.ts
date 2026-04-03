import type { ReactElement } from 'react';

export type ThreadPaneProps = {
  sessionId?: string | null;
};

export type ThreadListProps = {
  selectedSessionId?: string | null;
};

export type ThreadState = {
  status: 'idle';
};

export type ComposerState = {
  status: 'idle';
};

export type ThreadMessagesState = {
  messages: [];
};

function notImplemented(name: string): never {
  throw new Error(`${name} is not implemented in Phase 0.`);
}

export function useThread(): ThreadState {
  return notImplemented('useThread');
}

export function useComposer(): ComposerState {
  return notImplemented('useComposer');
}

export function useThreadMessages(): ThreadMessagesState {
  return notImplemented('useThreadMessages');
}

export function ThreadPane(_props: ThreadPaneProps): ReactElement | null {
  return null;
}

export function ThreadList(_props: ThreadListProps): ReactElement | null {
  return null;
}
