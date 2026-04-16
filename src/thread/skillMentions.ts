import type { AgentRuntimeInput } from '../client';
import type { ThreadPathMentionCandidate, ThreadPathMentionSelection } from './pathMentions';

export type ActiveThreadSkillMention = {
  token: string;
  query: string;
  start: number;
  end: number;
};

const SKILL_MENTION_PREFIX_PATTERN = /[\s([{"'`<]/;
const SKILL_ALLOWED_CHAR_PATTERN = /[A-Za-z0-9_-]/;

export function findActiveThreadSkillMention(
  text: string,
  selection: ThreadPathMentionSelection | null | undefined,
): ActiveThreadSkillMention | null {
  if (!selection || selection.start !== selection.end) {
    return null;
  }

  const cursor = selection.start;
  let start = cursor;
  while (start > 0 && SKILL_ALLOWED_CHAR_PATTERN.test(text.charAt(start - 1))) {
    start -= 1;
  }

  const sigilIndex = start - 1;
  if (sigilIndex < 0 || text.charAt(sigilIndex) !== '$') {
    return null;
  }

  const previous = sigilIndex === 0 ? '' : text.charAt(sigilIndex - 1);
  if (previous && !SKILL_MENTION_PREFIX_PATTERN.test(previous)) {
    return null;
  }

  let end = cursor;
  while (end < text.length && SKILL_ALLOWED_CHAR_PATTERN.test(text.charAt(end))) {
    end += 1;
  }

    return {
    token: text.slice(sigilIndex, end),
    query: text.slice(start, end),
    start: sigilIndex,
    end,
  };
}

export function replaceActiveThreadSkillMention(
  text: string,
  activeMention: ActiveThreadSkillMention,
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

export type ThreadSkillMentionCandidate = ThreadPathMentionCandidate & {
  agentRuntime?: AgentRuntimeInput | null;
};
