import { z } from 'zod';

// === Ledger Schemas ===

export const createLedgerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const shareLedgerSchema = z.object({
  ledgerId: z.string().uuid(),
  username: z.string().min(2).max(50),
});

export type CreateLedgerInput = z.infer<typeof createLedgerSchema>;
export type ShareLedgerInput = z.infer<typeof shareLedgerSchema>;
