import { z } from 'zod';

export const saveCredentialsBodySchema = z.object({
  accessKey: z.string().min(16, 'Chave de acesso deve ter ao menos 16 caracteres'),
  secretKey: z.string().min(16, 'Chave secreta deve ter ao menos 16 caracteres'),
});

export type SaveCredentialsBody = z.infer<typeof saveCredentialsBodySchema>;

const settingsDtoSchema = z.object({
  exchangeId: z.literal('binance'),
  configured: z.boolean(),
  accessKeyMasked: z.string().nullable(),
  secretKeyMasked: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const settingsResponseSchema = z.object({
  data: settingsDtoSchema,
  message: z.string(),
  timestamp: z.string(),
});
