import { z } from 'zod';

// === Auth Schemas ===

export const loginSchema = z.object({
  username: z.string().min(2).max(50),
  password: z.string().min(6).max(100),
});

export const registerSchema = z.object({
  username: z.string().min(2).max(50),
  password: z.string().min(6).max(100),
  displayName: z.string().min(1).max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
