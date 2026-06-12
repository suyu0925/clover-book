import { eq, inArray } from 'drizzle-orm';
import { readLedgerFile } from './file-manager';
import { db, schema } from '../db';
import type { BeancountFile, Posting, TransactionDirective } from '@clover-book/core';

type AccountType = 'assets' | 'liabilities' | 'income' | 'expenses' | 'equity';

const ACCOUNT_TYPE_MAP: Record<string, AccountType> = {
  Assets: 'assets',
  Liabilities: 'liabilities',
  Income: 'income',
  Expenses: 'expenses',
  Equity: 'equity',
};

function accountTypeFromName(accountName: string): AccountType {
  return ACCOUNT_TYPE_MAP[accountName.split(':')[0]] ?? 'assets';
}

function displayNameFromAccount(accountName: string, comment?: string): string {
  return comment?.trim() || accountName.split(':').at(-1) || accountName;
}

function amountFromTransaction(txn: TransactionDirective): number {
  const positive = txn.postings.find((posting) => posting.amount > 0);
  return Math.abs(positive?.amount ?? txn.postings[0]?.amount ?? 0);
}

async function resolveCreatedBy(userId: string | undefined, fallbackUserId: string) {
  if (!userId) return fallbackUserId;
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  return user?.id ?? fallbackUserId;
}

async function insertAccountsFromFile(ledgerId: string, file: BeancountFile) {
  const latestByName = new Map<string, { isClosed: boolean; date: string; comment?: string }>();

  for (const account of file.accounts) {
    latestByName.set(account.account, {
      isClosed: account.action === 'close',
      date: account.date,
      comment: account.comment,
    });
  }

  if (latestByName.size === 0) return new Map<string, string>();

  const existingAccounts = await db.query.accounts.findMany({
    where: eq(schema.accounts.ledgerId, ledgerId),
  });
  const existingByName = new Map(existingAccounts.map((account) => [account.name, account]));
  const accountIdsByName = new Map(existingAccounts.map((account) => [account.name, account.id]));

  for (const [name, value] of latestByName.entries()) {
    const existing = existingByName.get(name);
    if (existing) {
      await db.update(schema.accounts)
        .set({
          type: accountTypeFromName(name),
          displayName: displayNameFromAccount(name, value.comment),
          currency: 'CNY',
          isClosed: value.isClosed,
          openingDate: value.date,
        })
        .where(eq(schema.accounts.id, existing.id));
      continue;
    }

    const [inserted] = await db.insert(schema.accounts).values({
      ledgerId,
      name,
      type: accountTypeFromName(name),
      displayName: displayNameFromAccount(name, value.comment),
      currency: 'CNY',
      isClosed: value.isClosed,
      openingDate: value.date,
    }).returning();

    accountIdsByName.set(inserted.name, inserted.id);
  }

  return accountIdsByName;
}

async function ensurePostingAccount(
  ledgerId: string,
  accountIdsByName: Map<string, string>,
  posting: Posting,
) {
  const existingId = accountIdsByName.get(posting.account);
  if (existingId) return existingId;

  const [account] = await db.insert(schema.accounts).values({
    ledgerId,
    name: posting.account,
    type: accountTypeFromName(posting.account),
    displayName: displayNameFromAccount(posting.account),
    currency: posting.currency || 'CNY',
    openingDate: new Date().toISOString().slice(0, 10),
  }).returning();

  accountIdsByName.set(account.name, account.id);
  return account.id;
}

export async function rebuildLedgerCache(ledgerId: string) {
  const ledger = await db.query.ledgers.findFirst({
    where: eq(schema.ledgers.id, ledgerId),
  });
  if (!ledger) {
    throw new Error('Ledger not found');
  }

  const file = await readLedgerFile(ledger.filePath);
  const existingTransactions = await db.query.transactions.findMany({
    where: eq(schema.transactions.ledgerId, ledgerId),
  });
  const existingById = new Map(existingTransactions.map((txn) => [txn.id, txn]));
  const fileTransactionIds = new Set(file.transactions.map((txn) => txn.meta.id).filter(Boolean));
  const existingTransactionIds = existingTransactions.map((txn) => txn.id);

  if (existingTransactionIds.length > 0) {
    await db.delete(schema.postings).where(inArray(schema.postings.transactionId, existingTransactionIds));
    await db.delete(schema.transactionTags).where(inArray(schema.transactionTags.transactionId, existingTransactionIds));
  }

  for (const txn of existingTransactions) {
    if (!fileTransactionIds.has(txn.id)) {
      await db.delete(schema.transactions).where(eq(schema.transactions.id, txn.id));
    }
  }

  const accountIdsByName = await insertAccountsFromFile(ledgerId, file);

  for (const txn of file.transactions) {
    const transactionId = txn.meta.id || crypto.randomUUID();
    const existing = existingById.get(transactionId);
    const createdBy = await resolveCreatedBy(txn.meta.created_by, ledger.ownerId);
    const [insertedTxn] = await db.insert(schema.transactions).values({
      id: transactionId,
      ledgerId,
      date: txn.date,
      type: existing?.type || 'expense',
      payee: txn.payee || null,
      narration: txn.narration,
      createdBy,
      amount: amountFromTransaction(txn).toString(),
    }).onConflictDoUpdate({
      target: schema.transactions.id,
      set: {
        date: txn.date,
        type: existing?.type || 'expense',
        payee: txn.payee || null,
        narration: txn.narration,
        createdBy,
        amount: amountFromTransaction(txn).toString(),
        updatedAt: new Date(),
      },
    }).returning();

    for (const posting of txn.postings) {
      const accountId = await ensurePostingAccount(ledgerId, accountIdsByName, posting);
      await db.insert(schema.postings).values({
        transactionId: insertedTxn.id,
        accountId,
        amount: posting.amount.toString(),
        currency: posting.currency || 'CNY',
      });
    }

    if (txn.tags.length > 0) {
      await db.insert(schema.transactionTags).values(
        txn.tags.map((tag) => ({ transactionId: insertedTxn.id, tag })),
      );
    }
  }

  const [updatedLedger] = await db.update(schema.ledgers)
    .set({
      version: file.header.version,
      updatedAt: file.header.lastModified ? new Date(file.header.lastModified) : new Date(),
    })
    .where(eq(schema.ledgers.id, ledgerId))
    .returning();

  return {
    ledger: updatedLedger,
    accounts: accountIdsByName.size,
    transactions: file.transactions.length,
  };
}
