import type {
  AiKitDocumentClient,
  AiKitFetch,
  AiKitHeadersResolver,
  DocumentFileResult,
  DocumentTreeResult,
  DocumentWatchEvent,
  SaveDocumentFileArgs,
} from './types';

const DEFAULT_DOCUMENT_BASE_PATH = '/api/documents';

function getFetch(client: AiKitDocumentClient): AiKitFetch {
  return client.config.authFetch ?? fetch;
}

async function resolveHeaders(headers: AiKitHeadersResolver): Promise<HeadersInit | undefined> {
  if (typeof headers === 'function') {
    return headers();
  }
  return headers;
}

async function buildRequestHeaders(
  client: AiKitDocumentClient,
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

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function getDocumentBasePath(client: AiKitDocumentClient): string {
  return client.config.documentBasePath ?? DEFAULT_DOCUMENT_BASE_PATH;
}

function getDocumentEndpoints(client: AiKitDocumentClient) {
  const basePath = getDocumentBasePath(client).replace(/\/+$/, '');
  return {
    tree: joinBaseUrl(client.config.baseUrl, `${basePath}/tree`),
    file: joinBaseUrl(client.config.baseUrl, `${basePath}/file`),
    asset: joinBaseUrl(client.config.baseUrl, `${basePath}/asset`),
    watch: joinBaseUrl(client.config.baseUrl, `${basePath}/watch`),
  } as const;
}

function parseSseBlock(block: string): { event: string; data: string | null } | null {
  let eventName = 'message';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return {
    event: eventName,
    data: dataLines.length > 0 ? dataLines.join('\n') : null,
  };
}

export async function listDocumentsTree(client: AiKitDocumentClient): Promise<DocumentTreeResult> {
  const response = await getFetch(client)(getDocumentEndpoints(client).tree, {
    method: 'GET',
    headers: await buildRequestHeaders(client, { Accept: 'application/json' }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as DocumentTreeResult;
}

export async function getDocumentFile(
  client: AiKitDocumentClient,
  path: string,
): Promise<DocumentFileResult> {
  const url = new URL(getDocumentEndpoints(client).file);
  url.searchParams.set('path', path);
  const response = await getFetch(client)(url, {
    method: 'GET',
    headers: await buildRequestHeaders(client, { Accept: 'application/json' }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return (await response.json()) as DocumentFileResult;
}

export async function saveDocumentFile(
  client: AiKitDocumentClient,
  args: SaveDocumentFileArgs,
): Promise<DocumentFileResult> {
  const response = await getFetch(client)(getDocumentEndpoints(client).file, {
    method: 'PUT',
    headers: await buildRequestHeaders(client, {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return (await response.json()) as DocumentFileResult;
}

export async function watchDocuments(
  client: AiKitDocumentClient,
  args: {
    signal?: AbortSignal;
    onEvent?: (event: DocumentWatchEvent) => void;
  },
): Promise<void> {
  const response = await getFetch(client)(getDocumentEndpoints(client).watch, {
    method: 'GET',
    headers: await buildRequestHeaders(client, { Accept: 'text/event-stream' }),
    signal: args.signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = response.body;
  if (!body) {
    throw new Error('Document watch stream was not available.');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex >= 0) {
        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        const parsed = parseSseBlock(block);
        if (parsed?.data) {
          try {
            args.onEvent?.({
              type: parsed.event as DocumentWatchEvent['type'],
              payload: JSON.parse(parsed.data) as DocumentWatchEvent['payload'],
            } as DocumentWatchEvent);
          } catch {
            // Ignore malformed frames so a single bad event does not kill the stream.
          }
        }
        boundaryIndex = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function getDocumentAssetUrl(client: AiKitDocumentClient, path: string): string {
  const url = new URL(getDocumentEndpoints(client).asset);
  url.searchParams.set('path', path);
  return url.toString();
}
