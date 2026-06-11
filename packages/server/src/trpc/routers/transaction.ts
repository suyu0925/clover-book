import { router, protectedProcedure } from '../index';
import { createTransactionSchema, listTransactionsSchema } from '@clover-book/core';
import { TRPCError } from '@trpc/server';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db, schema } from '../../db';
import { z } from 'zod';

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

const transactionRouter = router({
  create: protectedProcedure.input(createTransactionSchema).mutation(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const [txn] = await db.insert(schema.transactions).values({
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

    await db.delete(schema.transactions).where(eq(schema.transactions.id, input.id));
    return { success: true };
  }),
});

export { transactionRouter };
