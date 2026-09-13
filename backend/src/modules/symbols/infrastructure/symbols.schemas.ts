import { z } from 'zod';

export const listSymbolsQuerySchema = z.object({
  quote: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
});

export type ListSymbolsQuery = z.infer<typeof listSymbolsQuerySchema>;
