import { router, protectedProcedure } from '../index';
import { TRPCError } from '@trpc/server';
import { eq, and, lte } from 'drizzle-orm';
import { db, schema } from '../../db';
import { z } from 'zod';
import { appendTransaction } from '../../beancount/file-manager';

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

/** 计算下一次执行日期 */
function calcNextExecution(current: string, frequency: string): string {
  const d = new Date(current);
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

const recurringRouter = router({
  /** 列表：查看账本下的所有周期性交易 */
  list: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
  })).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);
    const items = await db.query.recurringTransactions.findMany({
      where: eq(schema.recurringTransactions.ledgerId, input.ledgerId),
    });
    return items;
  }),

  /** 创建周期性交易模板 */
  create: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    name: z.string().max(100),
    type: z.enum(['expense', 'income', 'transfer', 'reimbursement', 'borrow_in', 'borrow_out']),
    amount: z.number().positive(),
    fromAccountId: z.string().uuid().nullable(),
    toAccountId: z.string().uuid().nullable(),
    categoryId: z.string().uuid().nullable(),
    narration: z.string().nullable(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    startDate: z.string(),
    endDate: z.string().nullable(),
    totalCount: z.number().int().positive().nullable(),
    autoExecute: z.boolean().default(false),
  })).mutation(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const [recurring] = await db.insert(schema.recurringTransactions).values({
      ledgerId: input.ledgerId,
      name: input.name,
      type: input.type,
      amount: input.amount.toString(),
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      categoryId: input.categoryId,
      narration: input.narration,
      frequency: input.frequency,
      startDate: input.startDate,
      endDate: input.endDate,
      totalCount: input.totalCount,
      nextExecution: input.startDate,
      autoExecute: input.autoExecute,
    }).returning();

    return recurring;
  }),

  /** 更新周期性交易 */
  update: protectedProcedure.input(z.object({
    id: z.string().uuid(),
    name: z.string().max(100).optional(),
    amount: z.number().positive().optional(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
    endDate: z.string().nullable().optional(),
    autoExecute: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const recurring = await db.query.recurringTransactions.findFirst({
      where: eq(schema.recurringTransactions.id, input.id),
    });
    if (!recurring) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '周期性交易不存在' });
    }
    await assertLedgerAccess(recurring.ledgerId, ctx.user.id);

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.amount !== undefined) updateData.amount = input.amount.toString();
    if (input.frequency !== undefined) updateData.frequency = input.frequency;
    if (input.endDate !== undefined) updateData.endDate = input.endDate;
    if (input.autoExecute !== undefined) updateData.autoExecute = input.autoExecute;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    if (Object.keys(updateData).length === 0) return recurring;

    const [updated] = await db.update(schema.recurringTransactions)
      .set(updateData)
      .where(eq(schema.recurringTransactions.id, input.id))
      .returning();
    return updated;
  }),

  /** 删除周期性交易 */
  delete: protectedProcedure.input(z.object({
    id: z.string().uuid(),
  })).mutation(async ({ input, ctx }) => {
    const recurring = await db.query.recurringTransactions.findFirst({
      where: eq(schema.recurringTransactions.id, input.id),
    });
    if (!recurring) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '周期性交易不存在' });
    }
    await assertLedgerAccess(recurring.ledgerId, ctx.user.id);
    await db.delete(schema.recurringTransactions).where(eq(schema.recurringTransactions.id, input.id));
    return { success: true };
  }),

  /** 手动执行一次周期性交易（生成实际交易） */
  execute: protectedProcedure.input(z.object({
    id: z.string().uuid(),
  })).mutation(async ({ input, ctx }) => {
    const recurring = await db.query.recurringTransactions.findFirst({
      where: eq(schema.recurringTransactions.id, input.id),
    });
    if (!recurring) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '周期性交易不存在' });
    }
    await assertLedgerAccess(recurring.ledgerId, ctx.user.id);

    if (!recurring.isActive) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '该周期性交易已停用' });
    }

    // 检查是否达到上限
    if (recurring.totalCount && recurring.executedCount >= recurring.totalCount) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '已达到执行次数上限' });
    }

    const date = recurring.nextExecution;

    // 创建实际交易
    const [txn] = await db.insert(schema.transactions).values({
      ledgerId: recurring.ledgerId,
      date,
      type: recurring.type,
      amount: recurring.amount,
      narration: recurring.narration || recurring.name,
      categoryId: recurring.categoryId,
      createdBy: ctx.user.id,
    }).returning();

    // 创建分录
    if (recurring.fromAccountId && recurring.toAccountId) {
      const amount = parseFloat(recurring.amount);
      await db.insert(schema.postings).values([
        { transactionId: txn.id, accountId: recurring.fromAccountId, amount: (-amount).toString(), currency: 'CNY' },
        { transactionId: txn.id, accountId: recurring.toAccountId, amount: amount.toString(), currency: 'CNY' },
      ]);
    }

    // 同步到 Beancount 文件
    const ledger = await db.query.ledgers.findFirst({
      where: eq(schema.ledgers.id, recurring.ledgerId),
    });
    if (ledger && recurring.fromAccountId && recurring.toAccountId) {
      const fromAcc = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, recurring.fromAccountId),
      });
      const toAcc = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, recurring.toAccountId),
      });
      const amount = parseFloat(recurring.amount);

      await appendTransaction(ledger.filePath, {
        date,
        flag: '*',
        narration: recurring.narration || recurring.name,
        tags: [],
        meta: { id: txn.id, created_by: ctx.user.id, recurring: recurring.id },
        postings: [
          { account: fromAcc?.name || 'Unknown', amount: -amount, currency: 'CNY' },
          { account: toAcc?.name || 'Unknown', amount, currency: 'CNY' },
        ],
      });
    }

    // 更新周期性交易状态
    const nextExecution = calcNextExecution(date, recurring.frequency);
    const newExecutedCount = recurring.executedCount + 1;
    const shouldDeactivate = (recurring.totalCount && newExecutedCount >= recurring.totalCount) ||
      (recurring.endDate && nextExecution > recurring.endDate);

    await db.update(schema.recurringTransactions).set({
      executedCount: newExecutedCount,
      nextExecution,
      ...(shouldDeactivate ? { isActive: false } : {}),
    }).where(eq(schema.recurringTransactions.id, input.id));

    return txn;
  }),

  /** 获取到期需要执行的周期性交易（用于提醒） */
  pending: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
  })).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);
    const today = new Date().toISOString().slice(0, 10);

    const items = await db.query.recurringTransactions.findMany({
      where: and(
        eq(schema.recurringTransactions.ledgerId, input.ledgerId),
        eq(schema.recurringTransactions.isActive, true),
        lte(schema.recurringTransactions.nextExecution, today),
      ),
    });

    return items;
  }),
});

export { recurringRouter };
