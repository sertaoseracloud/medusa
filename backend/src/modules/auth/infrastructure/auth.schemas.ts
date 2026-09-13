import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email('Formato de email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const loginResponseSchema = z.object({
  data: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number(),
    user: z.object({
      id: z.string(),
      email: z.string(),
    }),
  }),
  message: z.string(),
  timestamp: z.string(),
});

export const meResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    email: z.string(),
  }),
  message: z.string(),
  timestamp: z.string(),
});
