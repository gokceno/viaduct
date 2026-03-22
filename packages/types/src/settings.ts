import { z } from "zod";

export const AppConfigSchema = z.object({
  logoutUrl: z.string().default(""),
  quiet_period_minutes: z.number().int().min(1),
  allow_all_contacts: z.boolean(),
  allow_all_groups: z.boolean(),
});

export const WAStatusSchema = z.object({
  whatsapp: z.enum(["connecting", "qr", "open", "closed"]),
  qrDataUrl: z.string().nullable(),
  qrRaw: z.string().nullable(),
});

export const MeSchema = z.object({
  userId: z.string(),
  username: z.string(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type WAStatus = z.infer<typeof WAStatusSchema>;
export type Me = z.infer<typeof MeSchema>;
