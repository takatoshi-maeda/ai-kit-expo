type PartType = 'ToolCall' | 'TextResult' | 'ReasoningSummary';

export type AgentStreamEvent =
  | { kind: 'progress'; summary: string; description?: string }
  | { kind: 'changeStateStarted'; sessionId?: string; runId?: string; agentId?: string; agentName?: string }
  | { kind: 'json'; data: unknown; responseId?: string }
  | { kind: 'text'; summary: string; description?: string; responseId?: string }
  | { kind: 'table'; headers: string[]; data: Record<string, unknown>[]; responseId?: string }
  | { kind: 'textDelta'; delta: string }
  | { kind: 'reasoningSummaryDelta'; delta: string }
  | { kind: 'artifactAdded'; itemId: string; path?: string; contentType: 'artifact' }
  | { kind: 'artifactDelta'; itemId: string; delta: string }
  | { kind: 'artifactDone'; itemId: string; path?: string; contentType: 'artifact' }
  | { kind: 'toolCall'; summary: string; description?: string; toolCallId?: string; partId?: string }
  | { kind: 'toolCallFinish'; summary?: string; description?: string; toolCallId?: string; partId?: string }
  | { kind: 'cumulativeCost'; amount: number; currency?: string }
  | { kind: 'partAdded'; partType: PartType; partId?: string }
  | { kind: 'partDone'; partType: PartType; partId?: string };

type NormalizedResultType = 'text' | 'json' | 'table';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

function parseArtifactPath(payload: Record<string, unknown>): string | undefined {
  const item = payload.item;
  if (!item || typeof item !== 'object') return undefined;
  return str((item as Record<string, unknown>).path);
}

function parseTextResultPayload(payload: Record<string, unknown>, responseId?: string) {
  const summary = str(payload.summary);
  if (!summary) return undefined;
  return { kind: 'text' as const, summary, description: str(payload.description), responseId };
}

function parseTableResultPayload(payload: Record<string, unknown>, responseId?: string) {
  const headers = Array.isArray(payload.headers)
    ? payload.headers.filter((value): value is string => typeof value === 'string')
    : undefined;
  const data = Array.isArray(payload.data)
    ? payload.data.filter((value): value is Record<string, unknown> => isRecord(value))
    : undefined;
  if (!headers || headers.length === 0 || !data) return undefined;
  return { kind: 'table' as const, headers, data, responseId };
}

function parseJsonResultPayload(payload: unknown, responseId?: string) {
  if (isRecord(payload) && 'data' in payload) {
    return { kind: 'json' as const, data: payload.data, responseId };
  }
  return { kind: 'json' as const, data: payload, responseId };
}

function normalizeResultType(value: unknown): NormalizedResultType | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'text' || normalized === 'json' || normalized === 'table') {
    return normalized;
  }
  return undefined;
}

function normalizeItemType(value: unknown): NormalizedResultType | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'agent.text_result') return 'text';
  if (value === 'agent.json_result') return 'json';
  if (value === 'agent.table_result') return 'table';
  return undefined;
}

export function parseAgentStreamLine(line: string): AgentStreamEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return undefined;
  }

  if (!isRecord(payload)) return undefined;
  const type = payload.type;

  if (type === 'agent.change_state.started') {
    return {
      kind: 'changeStateStarted',
      sessionId: str(payload.session_id ?? payload.sessionId),
      runId: str(payload.run_id ?? payload.runId),
      agentId: str(payload.agent_id ?? payload.agentId),
      agentName: str(payload.agent_name ?? payload.agentName),
    };
  }

  if (type === 'agent.progress') {
    const summary = str(payload.summary);
    if (!summary) return undefined;
    return { kind: 'progress', summary, description: str(payload.description) };
  }

  if (type === 'agent.json_result') return parseJsonResultPayload(payload);
  if (type === 'agent.text_result') return parseTextResultPayload(payload);
  if (type === 'agent.table_result') return parseTableResultPayload(payload);

  if (type === 'agent.text_delta') {
    return typeof payload.delta === 'string' ? { kind: 'textDelta', delta: payload.delta } : undefined;
  }

  if (type === 'agent.reasoning_summary_delta') {
    return typeof payload.delta === 'string'
      ? { kind: 'reasoningSummaryDelta', delta: payload.delta }
      : undefined;
  }

  if (type === 'agent.output_item.added') {
    const itemId = str(payload.itemId ?? payload.item_id);
    if (!itemId) return undefined;
    return {
      kind: 'artifactAdded',
      itemId,
      path: parseArtifactPath(payload),
      contentType: 'artifact',
    };
  }

  if (type === 'agent.artifact_delta') {
    const itemId = str(payload.itemId ?? payload.item_id);
    if (!itemId || typeof payload.delta !== 'string') return undefined;
    return {
      kind: 'artifactDelta',
      itemId,
      delta: payload.delta,
    };
  }

  if (type === 'agent.output_item.done') {
    const itemId = str(payload.itemId ?? payload.item_id);
    if (!itemId) return undefined;
    return {
      kind: 'artifactDone',
      itemId,
      path: parseArtifactPath(payload),
      contentType: 'artifact',
    };
  }

  if (type === 'agent.tool_call') {
    const summary = str(payload.summary);
    if (!summary) return undefined;
    return {
      kind: 'toolCall',
      summary,
      description: str(payload.description),
      toolCallId: str(payload.toolCallId ?? payload.tool_call_id),
      partId: str(payload.partId ?? payload.part_id),
    };
  }

  if (type === 'agent.tool_call_finish') {
    return {
      kind: 'toolCallFinish',
      summary: str(payload.summary),
      description: str(payload.description),
      toolCallId: str(payload.toolCallId ?? payload.tool_call_id),
      partId: str(payload.partId ?? payload.part_id),
    };
  }

  if (type === 'agent.cumulative_cost') {
    const amountRaw = payload.amount;
    const amount =
      typeof amountRaw === 'number'
        ? amountRaw
        : typeof amountRaw === 'string'
          ? Number(amountRaw)
          : Number.NaN;
    if (Number.isNaN(amount)) return undefined;
    return { kind: 'cumulativeCost', amount, currency: str(payload.currency) };
  }

  if (type === 'agent.part_added' || type === 'agent.part_done') {
    const partType = payload.part_type;
    if (
      partType !== 'ToolCall' &&
      partType !== 'TextResult' &&
      partType !== 'ReasoningSummary'
    ) {
      return undefined;
    }
    return {
      kind: type === 'agent.part_added' ? 'partAdded' : 'partDone',
      partType,
      partId: str(payload.part_id),
    };
  }

  if (type === 'agent.result') {
    const itemCandidate = payload.item ?? payload.items;
    const responseId = str(payload.responseId ?? payload.response_id);
    const normalizedType =
      normalizeResultType(payload.result_type) ??
      (isRecord(itemCandidate) ? normalizeItemType(itemCandidate.type) : undefined);
    if (!normalizedType) return undefined;
    if (normalizedType === 'json') return parseJsonResultPayload(itemCandidate, responseId);
    if (!isRecord(itemCandidate)) return undefined;
    if (normalizedType === 'text') return parseTextResultPayload(itemCandidate, responseId);
    return parseTableResultPayload(itemCandidate, responseId);
  }

  return undefined;
}
