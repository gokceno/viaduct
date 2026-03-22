import { DateTime } from "luxon";
import type { Message, Summary, Todo } from "@viaduct/types";

const locale = process.env.SUMMARY_LOCALE ?? "en-US";

// Resolve a human-readable language name from the locale tag for the prompt
// (e.g. "tr-TR" → "Turkish", "en-US" → "English").
function localeName(tag: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: "language" }).of(
      tag.split("-")[0],
    ) ?? tag;
  } catch {
    return tag;
  }
}

const languageInstruction = `Write your response in ${localeName(locale)} (locale: ${locale}).`;

// ─── Summary prompt ───────────────────────────────────────────────────────────

export function buildSummaryPrompt(
  chatName: string,
  messages: Message[],
  priorSummaries: Summary[] = [],
): string {
  const lines = messages
    .map((m) => {
      const ts = DateTime.fromSeconds(m.timestamp).toISO();
      return `[${ts}] ${m.sender_name}: ${m.text}`;
    })
    .join("\n");

  const priorContext = priorSummaries.length > 0
    ? `PREVIOUS SUMMARIES (oldest → newest, for context only):
${priorSummaries
  .map((s) => {
    const ts = DateTime.fromSeconds(s.created_at).toISO();
    return `[${ts}] ${s.content}`;
  })
  .join("\n\n")}

`
    : "";

  return `You are a helpful assistant that summarizes WhatsApp conversations.
${languageInstruction}

${priorContext}Below is a new batch of messages from the chat "${chatName}".
Write a single concise paragraph summarising the key facts, decisions, and information from these messages.
Rules:
- State only concrete facts and decisions — do NOT describe the conversation itself (avoid "the group discussed…", "participants talked about…").
- Use the previous summaries above purely for continuity and context; do not re-summarise them.
- Omit greetings, pleasantries, and off-topic chatter entirely.
- Do NOT use bullet points. Write flowing prose.
- Be as brief as possible while preserving all meaningful content.

CONVERSATION:
${lines}

SUMMARY:`;
}

// ─── Todo extraction prompt ───────────────────────────────────────────────────

export function buildTodosPrompt(
  chatName: string,
  messages: Message[],
  userName: string | null,
  priorSummaries: Summary[] = [],
  priorTodos: Todo[] = [],
): string {
  const lines = messages
    .map((m) => {
      const ts = DateTime.fromSeconds(m.timestamp).toISO();
      return `[${ts}] ${m.sender_name}: ${m.text}`;
    })
    .join("\n");

  const userClause = userName
    ? `The platform user's name is "${userName}". Extract ONLY tasks that are explicitly directed at or assigned to "${userName}". Ignore tasks assigned to other people or tasks with no clear assignee.`
    : `Extract ONLY tasks that appear to be directed at the reader/platform user — i.e. tasks with no assignee or tasks explicitly addressed to "you". Ignore tasks clearly assigned to named third parties.`;

  const priorSummaryContext = priorSummaries.length > 0
    ? `PREVIOUS SUMMARIES (for context):
${priorSummaries.map((s) => {
  const ts = DateTime.fromSeconds(s.created_at).toISO();
  return `[${ts}] ${s.content}`;
}).join("\n\n")}

`
    : "";

  const priorTodoContext = priorTodos.length > 0
    ? `PREVIOUSLY EXTRACTED TASKS (do not duplicate these):
${priorTodos.map((t) => `- ${t.text}`).join("\n")}

`
    : "";

  return `You are a helpful assistant that extracts action items from WhatsApp conversations.
${languageInstruction}

${priorSummaryContext}${priorTodoContext}Below is a new batch of messages from the chat "${chatName}".
${userClause}
Do NOT extract tasks that are already listed in "PREVIOUSLY EXTRACTED TASKS" above.
Return ONLY a valid JSON array of objects with this exact shape:
[
  { "text": "description of the action item", "assignee": "name or null" }
]

If there are no qualifying action items, return an empty array: []
Do NOT include any explanation, markdown, or extra text — ONLY the JSON array.

CONVERSATION:
${lines}

ACTION ITEMS (JSON):`;
}
