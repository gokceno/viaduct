import { z } from "zod";

export const ChatSchema = z.object({
  jid: z.string(),
  name: z.string(),
  type: z.enum(["group", "contact"]),
  active: z.number().int(),
  added_at: z.number().int(),
  message_count: z.number().int(),
  summary_count: z.number().int(),
});

export type Chat = z.infer<typeof ChatSchema>;

// Lightweight shape returned by GET /api/dashboard — one row per active chat
// with enough data to render the dashboard without per-chat follow-up requests.
export const DashboardChatSchema = z.object({
  jid: z.string(),
  name: z.string(),
  type: z.enum(["group", "contact"]),
  pending_todos: z.number().int(),
  message_count: z.number().int(),
  last_summary_content: z.string().nullable(),
  last_summary_at: z.number().int().nullable(),
});

export type DashboardChat = z.infer<typeof DashboardChatSchema>;
