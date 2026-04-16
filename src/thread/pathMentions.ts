export type ThreadPathMentionSelection = {
  start: number;
  end: number;
};

export type ThreadPathMentionCandidate = {
  value: string;
  subtitle?: string;
  keywords?: string[];
};

export type ActiveThreadPathMention = {
  token: string;
  query: string;
  start: number;
  end: number;
};

const MENTION_PREFIX_PATTERN = /[\s([{"'`<]/;
const MENTION_TERMINATOR_PATTERN = /[\s()[\]{}<>,"';`]/;

export function findActiveThreadPathMention(
  text: string,
  selection: ThreadPathMentionSelection | null | undefined,
): ActiveThreadPathMention | null {
  if (!selection || selection.start !== selection.end) {
    return null;
  }

  const cursor = selection.start;
  let start = cursor;
  while (start > 0 && !MENTION_TERMINATOR_PATTERN.test(text.charAt(start - 1))) {
    start -= 1;
  }

  let end = cursor;
  while (end < text.length && !MENTION_TERMINATOR_PATTERN.test(text.charAt(end))) {
    end += 1;
  }

  const token = text.slice(start, end);
  if (!token.startsWith('@')) {
    return null;
  }
  if (token.includes('@', 1)) {
    return null;
  }

  const previous = start === 0 ? '' : text.charAt(start - 1);
  if (previous && !MENTION_PREFIX_PATTERN.test(previous)) {
    return null;
  }

  return {
    token,
    query: token.slice(1),
    start,
    end,
  };
}

export function replaceActiveThreadPathMention(
  text: string,
  activeMention: ActiveThreadPathMention,
  mention: string,
): { text: string; selection: ThreadPathMentionSelection } {
  const suffix = text.slice(activeMention.end);
  const separator = /^\s/.test(suffix) ? '' : ' ';
  const nextText = `${text.slice(0, activeMention.start)}${mention}${separator}${suffix}`;
  const cursor = activeMention.start + mention.length + separator.length;
  return {
    text: nextText,
    selection: {
      start: cursor,
      end: cursor,
    },
  };
}
