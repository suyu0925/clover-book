import { router, protectedProcedure } from '../index';
import { createTransactionSchema, listTransactionsSchema } from '@clover-book/core';
import { TRPCError } from '@trpc/server';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db, schema } from '../../db';
import { z } from 'zod';
import { appendTransaction, removeTransaction, updateTransaction } from '../../beancount/file-manager';

/** 检查用户是否有权访问账本 */
async function assertLedgerAccess(ledgerId: string, userId: string) {
  const member = await db.query.ledgerMembers.findFirst({
    where: and(
      eq(schema.ledgerMembers.ledgerId, ledgerId),
      eq(schema.ledgerMembers.userId, userId),
    ),
  });
  if (!member) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '无权访问此账本' });
  }
  return member;
}

/** 获取分类路径（父/子） */
async function getCategoryPath(categoryId: string): Promise<string> {
  const cat = await db.query.categories.findFirst({
    where: eq(schema.categories.id, categoryId),
  });
  if (!cat) return '';
  if (cat.parentId) {
    const parent = await db.query.categories.findFirst({
      where: eq(schema.categories.id, cat.parentId),
    });
    return parent ? `${parent.name}/${cat.name}` : cat.name;
  }
  return cat.name;
}

const transactionRouter = router({
  create: protectedProcedure.input(createTransactionSchema).mutation(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const ledger = await db.query.ledgers.findFirst({
      where: eq(schema.ledgers.id, input.ledgerId),
    });
    if (!ledger) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '账本不存在' });
    }
    const fromAccount = await db.query.accounts.findFirst({
      where: and(eq(schema.accounts.id, input.fromAccountId), eq(schema.accounts.ledgerId, input.ledgerId)),
    });
    const toAccount = await db.query.accounts.findFirst({
      where: and(eq(schema.accounts.id, input.toAccountId), eq(schema.accounts.ledgerId, input.ledgerId)),
    });
    if (!fromAccount || !toAccount) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '账户不存在或不属于此账本' });
    }

    const transactionId = crypto.randomUUID();
    const header = await appendTransaction(ledger.filePath, {
      date: input.date,
      flag: '*',
      payee: input.payee,
      narration: input.narration,
      tags: input.tags || [],
      meta: {
        id: transactionId,
        created_by: ctx.user.id,
        ...(input.categoryId ? { category: await getCategoryPath(input.categoryId) } : {}),
      },
      postings: [
        { account: fromAccount.name, amount: -input.amount, currency: 'CNY' },
        { account: toAccount.name, amount: input.amount, currency: 'CNY' },
      ],
    });

    const [txn] = await db.insert(schema.transactions).values({
      id: transactionId,
      ledgerId: input.ledgerId,
      date: input.date,
      type: input.type,
      amount: input.amount.toString(),
      payee: input.payee,
      narration: input.narration,
      categoryId: input.categoryId,
      createdBy: ctx.user.id,
    }).returning();

    // 写入分录
    await db.insert(schema.postings).values([
      { transactionId: txn.id, accountId: input.fromAccountId, amount: (-input.amount).toString(), currency: 'CNY' },
      { transactionId: txn.id, accountId: input.toAccountId, amount: input.amount.toString(), currency: 'CNY' },
    ]);

    // 写入标签
    if (input.tags && input.tags.length > 0) {
      await db.insert(schema.transactionTags).values(
        input.tags.map((tag) => ({ transactionId: txn.id, tag })),
      );
    }

    await db.update(schema.ledgers)
      .set({ version: header.version, updatedAt: new Date(header.lastModified) })
      .where(eq(schema.ledgers.id, input.ledgerId));

    return txn;
  }),

  list: protectedProcedure.input(listTransactionsSchema).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const conditions = [eq(schema.transactions.ledgerId, input.ledgerId)];
    if (input.startDate) conditions.push(gte(schema.transactions.date, input.startDate));
    if (input.endDate) conditions.push(lte(schema.transactions.date, input.endDate));
    if (input.type) conditions.push(eq(schema.transactions.type, input.type));
    if (input.categoryId) conditions.push(eq(schema.transactions.categoryId, input.categoryId));
    if (input.memberId) conditions.push(eq(schema.transactions.createdBy, input.memberId));

    const txns = await db.query.transactions.findMany({
      where: and(...conditions),
      orderBy: [desc(schema.transactions.date), desc(schema.transactions.createdAt)],
      limit: input.limit,
      offset: input.offset,
    });

    return { items: txns };
  }),

  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input, ctx }) => {
    const txn = await db.query.transactions.findFirst({
      where: eq(schema.transactions.id, input.id),
    });
    if (!txn) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '交易不存在' });
    }

    await assertLedgerAccess(txn.ledgerId, ctx.user.id);

    // 获取分录
    const postings = await db.query.postings.findMany({
      where: eq(schema.postings.transactionId, txn.id),
    });

    // 获取标签
    const tags = await db.query.transactionTags.findMany({
      where: eq(schema.transactionTags.transactionId, txn.id),
    });

    return { ...txn, postings, tags: tags.map((t) => t.tag) };
  }),

  delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const txn = await db.query.transactions.findFirst({
      where: eq(schema.transactions.id, input.id),
    });
    if (!txn) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '交易不存在' });
    }

    await assertLedgerAccess(txn.ledgerId, ctx.user.id);

    const ledger = await db.query.ledgers.findFirst({
      where: eq(schema.ledgers.id, txn.ledgerId),
    });
    if (!ledger) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '账本不存在' });
    }
    const header = await removeTransaction(ledger.filePath, txn.id);

    await db.delete(schema.transactions).where(eq(schema.transactions.id, input.id));
    await db.update(schema.ledgers)
      .set({ version: header.version, updatedAt: new Date(header.lastModified) })
      .where(eq(schema.ledgers.id, txn.ledgerId));
    return { success: true };
  }),

  update: protectedProcedure.input(z.object({
    id: z.string().uuid(),
    date: z.string().optional(),
    type: z.enum(['expense', 'income', 'transfer', 'reimbursement', 'borrow_in', 'borrow_out']).optional(),
    amount: z.number().positive().optional(),
    payee: z.string().max(200).nullable().optional(),
    narration: z.string().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    fromAccountId: z.string().uuid().optional(),
    toAccountId: z.string().uuid().optional(),
    tags: z.array(z.string()).optional(),
  })).mutation(async ({ input, ctx }) => {
    const txn = await db.query.transactions.findFirst({
      where: eq(schema.transactions.id, input.id),
    });
    if (!txn) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '交易不存在' });
    }

    await assertLedgerAccess(txn.ledgerId, ctx.user.id);

    const ledger = await db.query.ledgers.findFirst({
      where: eq(schema.ledgers.id, txn.ledgerId),
    });
    if (!ledger) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '账本不存在' });
    }

    const existingPostings = await db.query.postings.findMany({
      where: eq(schema.postings.transactionId, input.id),
    });
    const amount = input.amount ?? parseFloat(txn.amount);
    const from = input.fromAccountId || existingPostings.find(p => parseFloat(p.amount) < 0)?.accountId;
    const to = input.toAccountId || existingPostings.find(p => parseFloat(p.amount) > 0)?.accountId;
    if (!from || !to) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '无法确定交易分录账户' });
    }

    const fromAccount = await db.query.accounts.findFirst({
      where: and(eq(schema.accounts.id, from), eq(schema.accounts.ledgerId, txn.ledgerId)),
    });
    const toAccount = await db.query.accounts.findFirst({
      where: and(eq(schema.accounts.id, to), eq(schema.accounts.ledgerId, txn.ledgerId)),
    });
    if (!fromAccount || !toAccount) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '账户不存在或不属于此账本' });
    }

    const tags = input.tags ?? (await db.query.transactionTags.findMany({
      where: eq(schema.transactionTags.transactionId, input.id),
    })).map(t => t.tag);
    const categoryId = input.categoryId === undefined ? txn.categoryId : input.categoryId;
    const categoryPath = categoryId ? await getCategoryPath(categoryId) : '';

    const nextTransaction = {
      id: txn.id,
      ledgerId: txn.ledgerId,
      date: input.date ?? txn.date,
      type: input.type ?? txn.type,
      amount,
      payee: input.payee === undefined ? txn.payee : input.payee,
      narration: input.narration ?? txn.narration,
      categoryId,
      createdBy: txn.createdBy,
    };

    const header = await updateTransaction(ledger.filePath, input.id, {
      date: nextTransaction.date,
      flag: '*',
      payee: nextTransaction.payee || undefined,
      narration: nextTransaction.narration,
      tags,
      meta: {
        id: nextTransaction.id,
        created_by: nextTransaction.createdBy,
        ...(categoryPath ? { category: categoryPath } : {}),
      },
      postings: [
        { account: fromAccount.name, amount: -amount, currency: 'CNY' },
        { account: toAccount.name, amount, currency: 'CNY' },
      ],
    });

    const [updated] = await db.update(schema.transactions)
      .set({
        date: nextTransaction.date,
        type: nextTransaction.type,
        amount: nextTransaction.amount.toString(),
        payee: nextTransaction.payee,
        narration: nextTransaction.narration,
        categoryId: nextTransaction.categoryId,
        updatedAt: new Date(),
      })
      .where(eq(schema.transactions.id, input.id))
      .returning();

    await db.delete(schema.postings).where(eq(schema.postings.transactionId, input.id));
    await db.insert(schema.postings).values([
      { transactionId: input.id, accountId: from, amount: (-amount).toString(), currency: 'CNY' },
      { transactionId: input.id, accountId: to, amount: amount.toString(), currency: 'CNY' },
    ]);

    if (input.tags !== undefined) {
      await db.delete(schema.transactionTags).where(eq(schema.transactionTags.transactionId, input.id));
      if (tags.length > 0) {
        await db.insert(schema.transactionTags).values(
          tags.map((tag) => ({ transactionId: input.id, tag })),
        );
      }
    }

    await db.update(schema.ledgers)
      .set({ version: header.version, updatedAt: new Date(header.lastModified) })
      .where(eq(schema.ledgers.id, txn.ledgerId));

    return updated;
  }),
});

export { transactionRouter };
