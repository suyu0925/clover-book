import { z } from 'zod';

// === Transaction Schemas ===

export const createTransactionSchema = z.object({
  ledgerId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['expense', 'income', 'transfer', 'reimbursement', 'borrow_in', 'borrow_out']),
  amount: z.number().positive(),
  payee: z.string().max(200).optional(),
  narration: z.string().max(500),
  categoryId: z.string().uuid().optional(),
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  tags: z.array(z.string().max(50)).optional(),
});

export const listTransactionsSchema = z.object({
  ledgerId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.enum(['expense', 'income', 'transfer', 'reimbursement', 'borrow_in', 'borrow_out']).optional(),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  tag: z.string().optional(),
  memberId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type ListTransactionsInput = z.infer<typeof listTransactionsSchema>;
