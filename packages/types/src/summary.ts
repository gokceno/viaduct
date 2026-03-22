import { z } from "zod";

export const SummarySchema = z.object({
  id: z.number().int(),
  chat_jid: z.string(),
  period_start: z.number().int(),
  period_end: z.number().int(),
  content: z.string(),
  created_at: z.number().int(),
});

export type Summary = z.infer<typeof SummarySchema>;
