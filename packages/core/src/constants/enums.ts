// === 枚举常量 ===

export const AccountType = {
  ASSETS: 'assets',
  LIABILITIES: 'liabilities',
  INCOME: 'income',
  EXPENSES: 'expenses',
  EQUITY: 'equity',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const TransactionType = {
  EXPENSE: 'expense',
  INCOME: 'income',
  TRANSFER: 'transfer',
  REIMBURSEMENT: 'reimbursement',
  BORROW_IN: 'borrow_in',
  BORROW_OUT: 'borrow_out',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const LedgerRole = {
  OWNER: 'owner',
  MEMBER: 'member',
} as const;
export type LedgerRole = (typeof LedgerRole)[keyof typeof LedgerRole];

export const RecurringFrequency = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;
export type RecurringFrequency = (typeof RecurringFrequency)[keyof typeof RecurringFrequency];
