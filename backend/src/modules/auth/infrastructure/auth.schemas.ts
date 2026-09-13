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

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

export type RefreshBody = z.infer<typeof refreshBodySchema>;

export const refreshResponseSchema = z.object({
  data: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresIn: z.number(),
  }),
  message: z.string(),
  timestamp: z.string(),
});

export const logoutBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

export type LogoutBody = z.infer<typeof logoutBodySchema>;

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória'),
  newPassword: z.string().min(12, 'A nova senha deve ter no mínimo 12 caracteres'),
});

export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
