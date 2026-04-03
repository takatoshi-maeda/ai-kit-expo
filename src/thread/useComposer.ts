import { useCallback, useRef, useState } from 'react';

import { useAiKitActiveAgentName, useAiKitClient } from '../runtime';
import {
  completeActiveRun,
  createActiveRun,
  getActiveRun,
  rekeyActiveRun,
  setActiveRunAgentName,
  updateActiveRunAgentEntry,
} from './activeRuns';
import { createAgentRunContext } from './createRunContext';
import { parseAgentStreamLine } from './streamParser';
import { dispatchStreamEvent, finalizeAgentEntry } from './streamReducers';
import type {
  AgentResponseLogEntry,
  ComposerImageAttachment,
  SystemMessageLogEntry,
  UseComposerOptions,
  UseComposerResult,
  UseThreadResult,
  UserCommandLogEntry,
  UserInputPart,
} from './types';

function createUniqueId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function defaultSystemMessage(message: string): SystemMessageLogEntry {
  return {
    id: createUniqueId('log-sys'),
    kind: 'system-message',
    timestamp: new Date().toISOString(),
    level: 'info',
    message,
  };
}

type AgentInputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } };

function buildAgentInput(text: string, attachments: ComposerImageAttachment[]): AgentInputPart[] {
  const parts: AgentInputPart[] = [];
  if (text.trim().length > 0) {
    parts.push({ type: 'text', text });
  }
  for (const attachment of attachments) {
    parts.push({
      type: 'image',
      source: {
        type: 'url',
        url: `data:${attachment.mediaType};base64,${attachment.dataBase64}`,
      },
    });
  }
  return parts;
}

function buildUserDisplayText(text: string, attachments: ComposerImageAttachment[]): string {
  if (text.trim().length > 0) return text;
  if (attachments.length === 0) return text;
  if (attachments.length === 1) return `[画像添付] ${attachments[0].name}`;
  return `[画像添付] ${attachments.length} files`;
}

function buildUserInputParts(text: string, attachments: ComposerImageAttachment[]): UserInputPart[] {
  const parts: UserInputPart[] = [];
  if (text.trim().length > 0) {
    parts.push({ type: 'text', text });
  }
  for (const attachment of attachments) {
    parts.push({
      type: 'image',
      url: `data:${attachment.mediaType};base64,${attachment.dataBase64}`,
    });
  }
  return parts;
}

export function useComposer(
  sessionId: string,
  thread: UseThreadResult,
  options: UseComposerOptions = {},
): UseComposerResult {
  const client = useAiKitClient();
  const activeAgentName = useAiKitActiveAgentName();
  const resolvedAgentName = options.agentName ?? activeAgentName;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortRequestedRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const appendSystemMessage = useCallback(
    (message: string) => {
      thread.appendEntry((options.createSystemMessage ?? defaultSystemMessage)(message));
    },
    [options.createSystemMessage, thread],
  );

  const abort = useCallback(() => {
    abortRequestedRef.current = true;
    abortControllerRef.current?.abort();
  }, []);

  const submitToAgent = useCallback(
    async (text: string, attachments: ComposerImageAttachment[]) => {
      const activeSessionId = sessionIdRef.current;
      const startedAt = Date.now();
      const agentEntryId = createUniqueId('log-agent');
      const hasAttachments = attachments.length > 0;
      const input = hasAttachments ? buildAgentInput(text, attachments) : [];
      const textForAgent =
        text.trim().length > 0
          ? text
          : hasAttachments
            ? '添付画像を確認してください。'
            : text;

      const userEntry: UserCommandLogEntry = {
        id: createUniqueId('log-user'),
        kind: 'user-command',
        timestamp: new Date(startedAt - 1).toISOString(),
        commandDisplay: buildUserDisplayText(text, attachments).trim(),
        inputText: buildUserDisplayText(text, attachments),
        inputParts: buildUserInputParts(text, attachments),
        displayMode: 'userMessage',
      };

      const agentEntry: AgentResponseLogEntry = {
        id: agentEntryId,
        kind: 'agent-response',
        timestamp: new Date(startedAt).toISOString(),
        status: 'running',
        timeline: [],
        results: [],
        responseText: '',
      };

      thread.appendEntry(userEntry);
      thread.appendEntry(agentEntry);
      thread.setRunning(true, startedAt);

      const storeKey = activeSessionId === 'new' ? 'new' : activeSessionId;
      const activeRunKey = { current: storeKey };
      createActiveRun(storeKey, [...thread.logEntries, userEntry, agentEntry], thread.agentName, startedAt);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      abortRequestedRef.current = false;

      const ctx = createAgentRunContext({
        controller,
        agentEntryId,
        startedAt,
        sessionId: activeSessionId === 'new' ? null : activeSessionId,
        userEntry,
      });

      const syncReactFromStore = () => {
        const snapshot = getActiveRun(activeRunKey.current);
        if (snapshot) thread.replaceEntries(snapshot.logEntries);
      };

      let hasRefreshedList = false;

      try {
        const result = await client.runAgent({
          message: hasAttachments ? undefined : textForAgent,
          input: hasAttachments ? input : undefined,
          sessionId: activeSessionId === 'new' ? undefined : activeSessionId,
          agentName: resolvedAgentName,
          signal: controller.signal,
          onStreamEvent: (payload) => {
            if (!hasRefreshedList) {
              hasRefreshedList = true;
              void options.onRefreshSessions?.();
            }

            const event = parseAgentStreamLine(JSON.stringify(payload));
            if (!event) return;

            let detectedAgentName: string | undefined;
            updateActiveRunAgentEntry(activeRunKey.current, agentEntryId, (entry) => {
              const reduced = dispatchStreamEvent(ctx, event, entry);
              detectedAgentName = reduced.agentName;
              return reduced.entry;
            });

            if (detectedAgentName) {
              setActiveRunAgentName(activeRunKey.current, detectedAgentName);
              thread.setAgentName(detectedAgentName);
            }

            if (event.kind === 'changeStateStarted' && event.sessionId) {
              rekeyActiveRun(activeRunKey.current, event.sessionId);
              activeRunKey.current = event.sessionId;
              if (sessionIdRef.current !== event.sessionId) {
                sessionIdRef.current = event.sessionId;
                options.onSessionIdChange?.(event.sessionId);
              }
            }

            syncReactFromStore();
          },
        });

        if (result.sessionId && result.sessionId !== sessionIdRef.current) {
          ctx.sessionId = result.sessionId;
          sessionIdRef.current = result.sessionId;
          options.onSessionIdChange?.(result.sessionId);
        }

        if (result.responseId || result.message) {
          updateActiveRunAgentEntry(activeRunKey.current, agentEntryId, (entry) => ({
            ...entry,
            responseId: entry.responseId ?? result.responseId,
            responseText:
              entry.responseText && entry.responseText.trim().length > 0
                ? entry.responseText
                : typeof result.message === 'string'
                  ? result.message
                  : entry.responseText,
          }));
          syncReactFromStore();
        }

        const exitCode =
          result.status === 'success' ? 0 : result.status === 'cancelled' ? null : 1;

        updateActiveRunAgentEntry(activeRunKey.current, agentEntryId, (entry) =>
          finalizeAgentEntry(
            ctx,
            entry,
            exitCode,
            abortRequestedRef.current,
            typeof result.errorMessage === 'string' ? result.errorMessage : undefined,
          ),
        );
        syncReactFromStore();
        void options.onRefreshSessions?.();
      } catch (error) {
        const isAbort =
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'AbortError';
        const message = isAbort
          ? 'エージェント実行が中断されました。'
          : error instanceof Error
            ? error.message
            : 'エージェント実行で未知のエラーが発生しました。';

        updateActiveRunAgentEntry(activeRunKey.current, agentEntryId, (entry) =>
          finalizeAgentEntry(
            ctx,
            entry,
            null,
            abortRequestedRef.current,
            abortRequestedRef.current ? undefined : message,
          ),
        );
        syncReactFromStore();
      } finally {
        abortControllerRef.current = null;
        abortRequestedRef.current = false;
        thread.setRunning(false, null);
        completeActiveRun(activeRunKey.current);
        setTimeout(() => {
          options.onSyncUsageFromLogEntries?.(thread.logEntries);
        }, 0);
      }
    },
    [client, options, resolvedAgentName, thread],
  );

  const submit = useCallback(
    async (rawText: string, attachments: ComposerImageAttachment[] = []) => {
      const text = rawText.trimEnd();
      const hasAttachments = attachments.length > 0;
      if (text.length === 0 && !hasAttachments) return;

      if (text.length > 0) {
        setCommandHistory((prev) => (prev.at(-1) === text ? prev : [...prev, text]));
      }

      if (options.onHandleSlashCommand?.(text, thread)) return;

      if (isSubmitting) {
        appendSystemMessage('別のコマンドを処理中のため、完了までお待ちください。');
        return;
      }

      setIsSubmitting(true);
      try {
        await submitToAgent(text, attachments);
      } finally {
        setIsSubmitting(false);
      }
    },
    [appendSystemMessage, isSubmitting, options, submitToAgent, thread],
  );

  return { submit, abort, isSubmitting, commandHistory };
}
