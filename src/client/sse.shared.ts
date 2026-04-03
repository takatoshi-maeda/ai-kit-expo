export type SseEvent = {
  data: string;
  raw: string;
};

export type SseConnection = {
  close: () => void;
};

export type ConnectSseParams = {
  url: string;
  body: string;
  getHeaders: () => Promise<Record<string, string>>;
  signal?: AbortSignal;
  onEvent: (event: SseEvent) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
};

function extractDataFromBlock(block: string): string | null {
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return dataLines.length > 0 ? dataLines.join('\n') : null;
}

export function splitSseBuffer(buffer: string): { events: SseEvent[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const remainder = parts.pop() ?? '';
  const events = parts.flatMap((part) => {
    const data = extractDataFromBlock(part);
    return data ? [{ data, raw: part }] : [];
  });
  return { events, remainder };
}
