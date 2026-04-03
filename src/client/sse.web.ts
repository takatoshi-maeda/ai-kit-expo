import { splitSseBuffer, type ConnectSseParams, type SseConnection } from './sse.shared';

export async function connectSse({
  url,
  body,
  getHeaders,
  signal,
  onEvent,
  onError,
  onComplete,
}: ConnectSseParams): Promise<SseConnection> {
  const headers = {
    ...(await getHeaders()),
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  };

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Streaming is not supported in this environment');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let closed = false;

    const pump = async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, remainder } = splitSseBuffer(buffer);
          buffer = remainder;
          events.forEach(onEvent);
        }
        if (buffer.trim().length > 0) {
          const { events } = splitSseBuffer(`${buffer}\n\n`);
          events.forEach(onEvent);
        }
        if (!closed) {
          closed = true;
          onComplete?.();
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (!closed) {
          closed = true;
          onError?.(error instanceof Error ? error : new Error('SSE connection error'));
        }
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    };

    void pump();

    return {
      close: () => {
        if (closed) return;
        closed = true;
        controller.abort();
        signal?.removeEventListener('abort', abort);
      },
    };
  } catch (error) {
    signal?.removeEventListener('abort', abort);
    throw error;
  }
}
