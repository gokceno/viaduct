import { z } from "zod";

// ── Path / query param schemas ─────────────────────────────────────────────────

const JID_RE = /^[^@]+@(s\.whatsapp\.net|g\.us|lid)$/;

export const JidParamSchema = z.object({
  jid: z.string().transform(decodeURIComponent).pipe(z.string().regex(JID_RE, "Invalid JID format")),
});

export const TodoIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const MessagesQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(200).catch(50),
  offset: z.coerce.number().int().min(0).catch(0),
});

export const TodosFilterSchema = z.object({
  filter: z.enum(["all", "done", "pending"]).catch("all"),
});

export type JidParam = z.infer<typeof JidParamSchema>;
export type TodoIdParam = z.infer<typeof TodoIdParamSchema>;
export type MessagesQuery = z.infer<typeof MessagesQuerySchema>;
export type TodosFilter = z.infer<typeof TodosFilterSchema>;

// ── Request body schemas ───────────────────────────────────────────────────────

export const AddChatBodySchema = z.object({
  action: z.literal("add"),
  jid: z.string().optional(),
  phone: z.string().optional(),
  name: z.string().optional(),
  type: z.enum(["group", "contact"]).optional(),
});

export const RemoveChatBodySchema = z.object({
  action: z.literal("remove"),
  jid: z.string(),
});

export const PatchChatBodySchema = z.discriminatedUnion("action", [
  AddChatBodySchema,
  RemoveChatBodySchema,
]);

export const PatchTodoBodySchema = z.object({
  done: z.boolean(),
});

export const PatchConfigBodySchema = z.object({
  quiet_period_minutes: z.number().int().min(1).optional(),
  allow_all_contacts: z.boolean().optional(),
  allow_all_groups: z.boolean().optional(),
});

export type AddChatBody = z.infer<typeof AddChatBodySchema>;
export type RemoveChatBody = z.infer<typeof RemoveChatBodySchema>;
export type PatchChatBody = z.infer<typeof PatchChatBodySchema>;
export type PatchTodoBody = z.infer<typeof PatchTodoBodySchema>;
export type PatchConfigBody = z.infer<typeof PatchConfigBodySchema>;
