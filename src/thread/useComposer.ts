import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentRuntimeInput, AgentRuntimePolicy } from '../client';
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

function cloneRuntime(runtime: AgentRuntimeInput | null | undefined): AgentRuntimeInput | null {
  if (!runtime) return null;
  const next: AgentRuntimeInput = {};
  if (typeof runtime.model === 'string' && runtime.model.trim().length > 0) {
    next.model = runtime.model;
  }
  if (typeof runtime.reasoningEffort === 'string' && runtime.reasoningEffort.trim().length > 0) {
    next.reasoningEffort = runtime.reasoningEffort;
  }
  if (typeof runtime.verbosity === 'string' && runtime.verbosity.trim().length > 0) {
    next.verbosity = runtime.verbosity;
  }
  return Object.keys(next).length > 0 ? next : null;
}

function cloneRuntimePolicy(policy: AgentRuntimePolicy | null | undefined): AgentRuntimePolicy | null {
  if (!policy) return null;
  return {
    provider: policy.provider,
    defaults: cloneRuntime(policy.defaults) ?? undefined,
    allowedModels: Array.isArray(policy.allowedModels) ? [...policy.allowedModels] : undefined,
    allowedReasoningEfforts: Array.isArray(policy.allowedReasoningEfforts)
      ? [...policy.allowedReasoningEfforts]
      : undefined,
    allowedVerbosity: Array.isArray(policy.allowedVerbosity) ? [...policy.allowedVerbosity] : undefined,
  };
}

function resolveRuntimeForRequest(
  runtime: AgentRuntimeInput | null | undefined,
  policy: AgentRuntimePolicy | null | undefined,
): AgentRuntimeInput | null {
  const defaults = cloneRuntime(policy?.defaults);
  const overrides = cloneRuntime(runtime);
  if (!defaults && !overrides) {
    return null;
  }
  return {
    ...(defaults ?? {}),
    ...(overrides ?? {}),
  };
}

function pruneRuntimeByPolicy(
  runtime: AgentRuntimeInput | null | undefined,
  policy: AgentRuntimePolicy | null | undefined,
): AgentRuntimeInput | null {
  const next = cloneRuntime(runtime);
  if (!next) return null;
  if (!policy) return next;

  if (
    next.model
    && Array.isArray(policy.allowedModels)
    && policy.allowedModels.length > 0
    && !policy.allowedModels.includes(next.model)
  ) {
    delete next.model;
  }
  if (
    next.reasoningEffort
    && Array.isArray(policy.allowedReasoningEfforts)
    && policy.allowedReasoningEfforts.length > 0
    && !policy.allowedReasoningEfforts.includes(next.reasoningEffort)
  ) {
    delete next.reasoningEffort;
  }
  if (
    next.verbosity
    && Array.isArray(policy.allowedVerbosity)
    && policy.allowedVerbosity.length > 0
    && !policy.allowedVerbosity.includes(next.verbosity)
  ) {
    delete next.verbosity;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function validateRuntime(runtime: AgentRuntimeInput | null, policy: AgentRuntimePolicy | null): string | null {
  if (!runtime || !policy) return null;
  if (
    runtime.model
    && Array.isArray(policy.allowedModels)
    && policy.allowedModels.length > 0
    && !policy.allowedModels.includes(runtime.model)
  ) {
    return `model "${runtime.model}" is not allowed for this agent`;
  }
  if (
    runtime.reasoningEffort
    && Array.isArray(policy.allowedReasoningEfforts)
    && policy.allowedReasoningEfforts.length > 0
    && !policy.allowedReasoningEfforts.includes(runtime.reasoningEffort)
  ) {
    return `reasoningEffort "${runtime.reasoningEffort}" is not allowed for this agent`;
  }
  if (
    runtime.verbosity
    && Array.isArray(policy.allowedVerbosity)
    && policy.allowedVerbosity.length > 0
    && !policy.allowedVerbosity.includes(runtime.verbosity)
  ) {
    return `verbosity "${runtime.verbosity}" is not allowed for this agent`;
  }
  return null;
}

function selectRuntimePolicy(args: {
  agents: Array<{
    agentId: string;
    runtimePolicy?: AgentRuntimePolicy | null;
  }>;
  defaultAgentId: string | null;
  resolvedAgentName: string;
  threadAgentName: string | null;
}): AgentRuntimePolicy | null {
  const candidates = [
    args.threadAgentName,
    args.resolvedAgentName,
    args.defaultAgentId,
  ].filter((value, index, array): value is string => typeof value === 'string' && array.indexOf(value) === index);

  for (const candidate of candidates) {
    const matched = args.agents.find((item) => item.agentId === candidate);
    if (matched?.runtimePolicy) {
      return cloneRuntimePolicy(matched.runtimePolicy);
    }
  }

  if (args.agents.length === 1) {
    return cloneRuntimePolicy(args.agents[0]?.runtimePolicy) ?? null;
  }

  return null;
}

export function useComposer(
  sessionId: string,
  thread: UseThreadResult,
  options: UseComposerOptions = {},
): UseComposerResult {
  const client = useAiKitClient();
  const activeAgentName = useAiKitActiveAgentName();
  const resolvedAgentName = options.agentName ?? activeAgentName;
  const runtimeEnabled = options.runtime?.enabled === true;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [runtimePolicy, setRuntimePolicy] = useState<AgentRuntimePolicy | null>(null);
  const [runtime, setRuntimeState] = useState<AgentRuntimeInput | null>(
    cloneRuntime(options.runtime?.initialValue) ?? null,
  );
  const [runtimeValidationError, setRuntimeValidationError] = useState<string | null>(null);
  const [runtimeSelectionError, setRuntimeSelectionError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortRequestedRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const runtimeSourceSessionRef = useRef<string | null>(null);
  const runtimeSourceAgentRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  const setRuntime = useCallback<UseComposerResult['setRuntime']>((next) => {
    let selectionError: string | null = null;
    setRuntimeState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      const normalized = cloneRuntime(resolved);
      selectionError = validateRuntime(normalized, runtimePolicy);
      return pruneRuntimeByPolicy(normalized, runtimePolicy);
    });
    setRuntimeSelectionError(selectionError);
  }, [runtimePolicy]);

  useEffect(() => {
    if (!runtimeEnabled) {
      setRuntimePolicy(null);
      setRuntimeState(null);
      setRuntimeValidationError(null);
      setRuntimeSelectionError(null);
      runtimeSourceSessionRef.current = null;
      runtimeSourceAgentRef.current = null;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const payload = await client.listAgents(resolvedAgentName);
        if (cancelled) return;
        const agents = Array.isArray(payload.agents) ? payload.agents : [];
        setRuntimePolicy(selectRuntimePolicy({
          agents,
          defaultAgentId: payload.defaultAgentId,
          resolvedAgentName,
          threadAgentName: thread.agentName,
        }));
      } catch {
        if (cancelled) return;
        setRuntimePolicy(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, resolvedAgentName, runtimeEnabled, thread.agentName]);

  useEffect(() => {
    if (!runtimeEnabled) return;

    const sessionKey = `${resolvedAgentName}:${sessionId}`;
    if (thread.lastRuntime && runtimeSourceSessionRef.current !== sessionKey) {
      runtimeSourceSessionRef.current = sessionKey;
      runtimeSourceAgentRef.current = resolvedAgentName;
      setRuntimeState(pruneRuntimeByPolicy(thread.lastRuntime, runtimePolicy));
      setRuntimeValidationError(null);
      setRuntimeSelectionError(null);
      return;
    }

    if (sessionId === 'new' && runtimeSourceAgentRef.current !== resolvedAgentName) {
      runtimeSourceSessionRef.current = sessionKey;
      runtimeSourceAgentRef.current = resolvedAgentName;
      setRuntimeState(pruneRuntimeByPolicy(options.runtime?.initialValue, runtimePolicy));
      setRuntimeValidationError(null);
      setRuntimeSelectionError(null);
    }
  }, [options.runtime?.initialValue, resolvedAgentName, runtimeEnabled, runtimePolicy, sessionId, thread.lastRuntime]);

  useEffect(() => {
    if (!runtimeEnabled) return;
    setRuntimeState((prev) => pruneRuntimeByPolicy(prev, runtimePolicy));
  }, [runtimeEnabled, runtimePolicy]);

  useEffect(() => {
    if (!runtimeEnabled) {
      setRuntimeValidationError(null);
      return;
    }
    setRuntimeValidationError(validateRuntime(runtime, runtimePolicy));
  }, [runtime, runtimeEnabled, runtimePolicy]);

  const runtimeError = runtimeSelectionError ?? runtimeValidationError;

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
      const params = options.resolveParams?.();
      const runtimeForRequest = runtimeEnabled
        ? resolveRuntimeForRequest(runtime, runtimePolicy) ?? undefined
        : undefined;

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
          runtime: runtimeForRequest,
          params,
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
        options.onAgentRunError?.(error);
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
    [client, options, resolvedAgentName, runtime, runtimeEnabled, thread],
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

      const validationError = runtimeEnabled ? validateRuntime(runtime, runtimePolicy) : null;
      if (validationError) {
        setRuntimeValidationError(validationError);
        return;
      }

      setIsSubmitting(true);
      try {
        await submitToAgent(text, attachments);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      appendSystemMessage,
      isSubmitting,
      options,
      runtime,
      runtimeEnabled,
      runtimePolicy,
      submitToAgent,
      thread,
    ],
  );

  return {
    submit,
    abort,
    isSubmitting,
    commandHistory,
    runtime,
    setRuntime,
    runtimePolicy,
    runtimeError,
  };
}
