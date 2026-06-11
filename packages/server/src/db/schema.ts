import { pgTable, uuid, varchar, text, timestamp, integer, decimal, date, boolean, pgEnum } from 'drizzle-orm/pg-core';

// === Enums ===

export const ledgerRoleEnum = pgEnum('ledger_role', ['owner', 'member']);
export const accountTypeEnum = pgEnum('account_type', ['assets', 'liabilities', 'income', 'expenses', 'equity']);
export const transactionTypeEnum = pgEnum('transaction_type', ['expense', 'income', 'transfer', 'reimbursement', 'borrow_in', 'borrow_out']);
export const frequencyEnum = pgEnum('frequency', ['daily', 'weekly', 'monthly', 'yearly']);

// === Tables ===

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ledgers = pgTable('ledgers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  ownerId: uuid('owner_id').references(() => users.id).notNull(),
  filePath: varchar('file_path', { length: 500 }).notNull(),
  version: integer('version').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ledgerMembers = pgTable('ledger_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  ledgerId: uuid('ledger_id').references(() => ledgers.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  role: ledgerRoleEnum('role').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ledgerId: uuid('ledger_id').references(() => ledgers.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  type: accountTypeEnum('type').notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('CNY').notNull(),
  isClosed: boolean('is_closed').default(false).notNull(),
  openingDate: date('opening_date').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  ledgerId: uuid('ledger_id').references(() => ledgers.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 50 }).notNull(),
  parentId: uuid('parent_id'),
  icon: varchar('icon', { length: 50 }),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ledgerId: uuid('ledger_id').references(() => ledgers.id, { onDelete: 'cascade' }).notNull(),
  date: date('date').notNull(),
  type: transactionTypeEnum('type').notNull(),
  payee: varchar('payee', { length: 200 }),
  narration: text('narration').notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  categoryId: uuid('category_id').references(() => categories.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  beancountLine: integer('beancount_line'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const postings = pgTable('postings', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }).notNull(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('CNY').notNull(),
});

export const transactionTags = pgTable('transaction_tags', {
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }).notNull(),
  tag: varchar('tag', { length: 50 }).notNull(),
});

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  ledgerId: uuid('ledger_id').references(() => ledgers.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => categories.id),
  yearMonth: varchar('year_month', { length: 7 }).notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const recurringTransactions = pgTable('recurring_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ledgerId: uuid('ledger_id').references(() => ledgers.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  type: transactionTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  fromAccountId: uuid('from_account_id').references(() => accounts.id),
  toAccountId: uuid('to_account_id').references(() => accounts.id),
  categoryId: uuid('category_id').references(() => categories.id),
  narration: text('narration'),
  frequency: frequencyEnum('frequency').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  totalCount: integer('total_count'),
  executedCount: integer('executed_count').default(0).notNull(),
  nextExecution: date('next_execution').notNull(),
  autoExecute: boolean('auto_execute').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }).notNull(),
  ledgerId: uuid('ledger_id').references(() => ledgers.id, { onDelete: 'cascade' }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  filePath: varchar('file_path', { length: 500 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
