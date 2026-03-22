import { z } from "zod";

export const TodoSchema = z.object({
  id: z.number().int(),
  summary_id: z.number().int(),
  chat_jid: z.string(),
  text: z.string(),
  done: z.number().int(),
  created_at: z.number().int(),
});

export const TodoWithChatSchema = TodoSchema.extend({
  chat_name: z.string(),
  chat_type: z.enum(["group", "contact"]),
});

export type Todo = z.infer<typeof TodoSchema>;
export type TodoWithChat = z.infer<typeof TodoWithChatSchema>;
