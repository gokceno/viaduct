import { z } from "zod";

export const MessageSchema = z.object({
  id: z.string(),
  chat_jid: z.string(),
  sender_jid: z.string(),
  sender_name: z.string(),
  text: z.string(),
  timestamp: z.number().int(),
});

export type Message = z.infer<typeof MessageSchema>;
