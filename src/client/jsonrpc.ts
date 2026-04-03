import { connectSse } from './sse';
import { buildMcpEndpoints, getResolvedAgentName, getResolvedProtocolVersion, joinBaseUrl, nextRequestId } from './mcp';
import type {
  AiKitClient,
  AiKitDocumentClient,
  AiKitFetch,
  AiKitHeadersResolver,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  StreamRequestOptions,
} from './types';

const initPromiseByAgentAndBaseUrl = new Map<string, Promise<void>>();

function getFetch(client: AiKitClient | AiKitDocumentClient): AiKitFetch {
  return client.config.authFetch ?? fetch;
}

async function resolveHeaders(headers: AiKitHeadersResolver): Promise<HeadersInit | undefined> {
  if (typeof headers === 'function') {
    return headers();
  }
  return headers;
}

function createAbortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

async function buildRequestHeaders(
  client: AiKitClient | AiKitDocumentClient,
  extra: HeadersInit | undefined,
): Promise<Record<string, string>> {
  const headers = new Headers(await resolveHeaders(client.config.headers));
  if (extra) {
    new Headers(extra).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return Object.fromEntries(headers.entries());
}

async function sendNotification(
  client: AiKitClient,
  message: JsonRpcNotification,
  agentName: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await getFetch(client)(
    joinBaseUrl(client.config.baseUrl, buildMcpEndpoints(agentName).mcpInit),
    {
      method: 'POST',
      headers: await buildRequestHeaders(client, {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': getResolvedProtocolVersion(client),
      }),
      body: JSON.stringify(message),
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`MCP notification failed: HTTP ${response.status}`);
  }
}

function extractStructuredResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') {
    return result;
  }
  const record = result as Record<string, unknown>;
  if (record.structuredContent !== undefined) {
    return record.structuredContent;
  }
  const content = record.content;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown> | undefined;
    if (first && typeof first === 'object' && typeof first.text === 'string') {
      try {
        return JSON.parse(first.text);
      } catch {
        return first.text;
      }
    }
  }
  return result;
}

async function sendJsonRequestTo(
  client: AiKitClient,
  endpoint: string,
  message: unknown,
  options: StreamRequestOptions = {},
): Promise<JsonRpcResponse> {
  const response = await getFetch(client)(endpoint, {
    method: 'POST',
    headers: await buildRequestHeaders(client, {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'MCP-Protocol-Version': getResolvedProtocolVersion(client),
    }),
    body: JSON.stringify(message),
    signal: options.signal,
  });
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      typeof errorPayload.error === 'string' && errorPayload.error.trim().length > 0
        ? errorPayload.error
        : `HTTP ${response.status}`,
    );
  }
  return (await response.json()) as JsonRpcResponse;
}

async function sendSseJsonRpcRequestTo(
  client: AiKitClient,
  endpoint: string,
  message: unknown,
  options: StreamRequestOptions = {},
  expectedId?: string | number | null,
): Promise<JsonRpcResponse> {
  let responseMessage: JsonRpcResponse | null = null;

  await new Promise<void>(async (resolve, reject) => {
    let isSettled = false;

    const settleResolve = () => {
      if (isSettled) return;
      isSettled = true;
      resolve();
    };

    const settleReject = (error: Error) => {
      if (isSettled) return;
      isSettled = true;
      reject(error);
    };

    try {
      const connection = await connectSse({
        url: endpoint,
        body: JSON.stringify(message),
        signal: options.signal,
        getHeaders: () =>
          buildRequestHeaders(client, {
            'MCP-Protocol-Version': getResolvedProtocolVersion(client),
          }),
        onEvent: (event) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(event.data);
          } catch {
            parsed = null;
          }
          if (!parsed || typeof parsed !== 'object') return;

          const candidate = parsed as JsonRpcResponse | JsonRpcNotification;
          if ('id' in candidate) {
            if (
              responseMessage === null &&
              (expectedId === undefined || expectedId === null || candidate.id === expectedId)
            ) {
              responseMessage = candidate as JsonRpcResponse;
            }
            return;
          }

          if ('method' in candidate) {
            options.onNotification?.(candidate as JsonRpcNotification);
          }
        },
        onError: settleReject,
        onComplete: settleResolve,
      });

      if (options.signal?.aborted) {
        connection.close();
        settleReject(createAbortError());
      }
    } catch (error) {
      settleReject(error instanceof Error ? error : new Error('SSE connection error'));
    }
  });

  if (!responseMessage) {
    throw new Error('MCP response did not include a result.');
  }
  return responseMessage;
}

export async function ensureInitialized(
  client: AiKitClient,
  signal?: AbortSignal,
  agentName?: string | null,
): Promise<void> {
  const resolvedAgentName = getResolvedAgentName(client, agentName);
  const initKey = `${resolvedAgentName}@@${client.config.baseUrl}`;

  if (!initPromiseByAgentAndBaseUrl.has(initKey)) {
    const initPromise = (async () => {
      try {
        const initRequest: JsonRpcRequest = {
          jsonrpc: '2.0',
          id: nextRequestId(),
          method: 'initialize',
          params: {
            protocolVersion: getResolvedProtocolVersion(client),
            capabilities: {},
            clientInfo: client.config.clientInfo ?? {
              name: 'ai-kit-expo',
              version: '0.1.0',
            },
          },
        };
        await sendSseJsonRpcRequestTo(
          client,
          joinBaseUrl(client.config.baseUrl, buildMcpEndpoints(resolvedAgentName).mcpInit),
          initRequest,
          { signal },
          initRequest.id,
        );
        await sendNotification(
          client,
          { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
          resolvedAgentName,
          signal,
        );
      } catch (error) {
        initPromiseByAgentAndBaseUrl.delete(initKey);
        throw error;
      }
    })();
    initPromiseByAgentAndBaseUrl.set(initKey, initPromise);
  }

  const activeInitPromise = initPromiseByAgentAndBaseUrl.get(initKey);
  if (!activeInitPromise) {
    throw new Error(`MCP initialization state missing for agent: ${resolvedAgentName}`);
  }
  return activeInitPromise;
}

export async function callTool<T>(
  client: AiKitClient,
  toolName: string,
  args: Record<string, unknown>,
  options: StreamRequestOptions = {},
  agentName?: string | null,
): Promise<T> {
  const resolvedAgentName = getResolvedAgentName(client, agentName);
  await ensureInitialized(client, options.signal, resolvedAgentName);
  const endpoint = joinBaseUrl(
    client.config.baseUrl,
    buildMcpEndpoints(resolvedAgentName).toolCall(toolName),
  );
  const response = await sendJsonRequestTo(client, endpoint, args, options);
  if (response.error) {
    throw new Error(
      typeof response.error.message === 'string' ? response.error.message : 'MCP error',
    );
  }
  return extractStructuredResult(response.result) as T;
}

export async function callToolStream<T>(
  client: AiKitClient,
  toolName: string,
  args: Record<string, unknown>,
  options: StreamRequestOptions = {},
  agentName?: string | null,
): Promise<T> {
  const resolvedAgentName = getResolvedAgentName(client, agentName);
  await ensureInitialized(client, options.signal, resolvedAgentName);
  const endpoint = joinBaseUrl(
    client.config.baseUrl,
    buildMcpEndpoints(resolvedAgentName).toolCall(toolName),
  );
  const response = await sendSseJsonRpcRequestTo(client, endpoint, args, options, null);
  if (response.error) {
    throw new Error(
      typeof response.error.message === 'string' ? response.error.message : 'MCP error',
    );
  }
  return extractStructuredResult(response.result) as T;
}

export async function fetchAgentStatus(
  client: AiKitClient,
  agentName?: string | null,
  options: { signal?: AbortSignal; warmup?: boolean } = {},
): Promise<unknown> {
  const resolvedAgentName = getResolvedAgentName(client, agentName);
  const url = new URL(
    joinBaseUrl(client.config.baseUrl, buildMcpEndpoints(resolvedAgentName).mcpStatus),
  );
  url.searchParams.set('warmup', options.warmup === false ? '0' : '1');

  const response = await getFetch(client)(url, {
    method: 'GET',
    headers: await buildRequestHeaders(client, undefined),
    signal: options.signal,
  });
  return response.json().catch(() => null);
}
