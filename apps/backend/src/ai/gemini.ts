import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildSummaryPrompt, buildTodosPrompt } from "./prompts.js";
import type { Message, Summary, Todo } from "@viaduct/types";

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

if (!apiKey) {
  console.warn(
    "[viaduct] GEMINI_API_KEY is not set — AI summarization will be disabled.",
  );
}

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/** Returns a masked version of the key safe for logging: e.g. "AIzaSyAB..." */
function maskedKey(): string {
  if (!apiKey) return "(unset)";
  return apiKey.slice(0, 8) + "...";
}

export interface AIPipelineResult {
  summary: string;
  todos: Array<{ text: string; assignee: string | null }>;
}

export async function runAIPipeline(
  chatName: string,
  messages: Message[],
  priorSummaries: Summary[] = [],
  userName: string | null = null,
  priorTodos: Todo[] = [],
): Promise<AIPipelineResult> {
  if (messages.length === 0) {
    return { summary: "", todos: [] };
  }

  const client = getClient();
  const model = client.getGenerativeModel({ model: modelName });

  // Run summary and todo extraction in parallel
  const [summaryResult, todosResult] = await Promise.all([
    model.generateContent(buildSummaryPrompt(chatName, messages, priorSummaries)),
    model.generateContent(buildTodosPrompt(chatName, messages, userName, priorSummaries, priorTodos)),
  ]);

  const summary = summaryResult.response.text().trim();

  let todos: Array<{ text: string; assignee: string | null }> = [];
  try {
    const raw = todosResult.response.text().trim();
    // Strip markdown code fences if the model wraps the JSON
    const jsonStr = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      todos = parsed.map((item) => ({
        text: String(item.text ?? item),
        assignee: item.assignee ? String(item.assignee) : null,
      }));
    }
  } catch (err) {
    console.warn(`[viaduct] Failed to parse todos JSON from Gemini response. Key: ${maskedKey()}`, err);
  }

  return { summary, todos };
}
