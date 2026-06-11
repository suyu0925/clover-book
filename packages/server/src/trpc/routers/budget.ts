import { router, protectedProcedure } from '../index';
import { TRPCError } from '@trpc/server';
import { eq, and, sql } from 'drizzle-orm';
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

const budgetRouter = router({
  /** 获取指定月份的预算列表 */
  list: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    yearMonth: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  })).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const budgets = await db.query.budgets.findMany({
      where: and(
        eq(schema.budgets.ledgerId, input.ledgerId),
        eq(schema.budgets.yearMonth, input.yearMonth),
      ),
    });

    // 查询该月实际支出按分类汇总
    const startDate = `${input.yearMonth}-01`;
    const endDate = getMonthEndDate(input.yearMonth);

    const spending = await db.select({
      categoryId: schema.transactions.categoryId,
      total: sql<string>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.ledgerId, input.ledgerId),
        eq(schema.transactions.type, 'expense'),
        sql`${schema.transactions.date} >= ${startDate}`,
        sql`${schema.transactions.date} <= ${endDate}`,
      ))
      .groupBy(schema.transactions.categoryId);

    const spendingMap = new Map(
      spending.map((s) => [s.categoryId, parseFloat(s.total) || 0])
    );

    // 查询分类名称
    const categories = await db.query.categories.findMany({
      where: eq(schema.categories.ledgerId, input.ledgerId),
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return budgets.map((b) => {
      const cat = b.categoryId ? categoryMap.get(b.categoryId) : null;
      const spent = b.categoryId ? (spendingMap.get(b.categoryId) || 0) : getTotalSpending(spendingMap);
      return {
        ...b,
        amount: parseFloat(b.amount),
        categoryName: cat ? cat.name : '总预算',
        spent,
        remaining: parseFloat(b.amount) - spent,
        isOverBudget: spent > parseFloat(b.amount),
      };
    });
  }),

  /** 创建/更新预算（upsert） */
  upsert: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
    categoryId: z.string().uuid().nullable(),
    amount: z.number().positive(),
  })).mutation(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    // 检查是否已存在
    const conditions = [
      eq(schema.budgets.ledgerId, input.ledgerId),
      eq(schema.budgets.yearMonth, input.yearMonth),
    ];
    if (input.categoryId) {
      conditions.push(eq(schema.budgets.categoryId, input.categoryId));
    } else {
      conditions.push(sql`${schema.budgets.categoryId} IS NULL`);
    }

    const existing = await db.query.budgets.findFirst({
      where: and(...conditions),
    });

    if (existing) {
      const [updated] = await db.update(schema.budgets)
        .set({ amount: input.amount.toString(), updatedAt: new Date() })
        .where(eq(schema.budgets.id, existing.id))
        .returning();
      return updated;
    }

    const [budget] = await db.insert(schema.budgets).values({
      ledgerId: input.ledgerId,
      yearMonth: input.yearMonth,
      categoryId: input.categoryId,
      amount: input.amount.toString(),
    }).returning();

    return budget;
  }),

  /** 删除预算 */
  delete: protectedProcedure.input(z.object({
    id: z.string().uuid(),
  })).mutation(async ({ input, ctx }) => {
    const budget = await db.query.budgets.findFirst({
      where: eq(schema.budgets.id, input.id),
    });
    if (!budget) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '预算不存在' });
    }
    await assertLedgerAccess(budget.ledgerId, ctx.user.id);
    await db.delete(schema.budgets).where(eq(schema.budgets.id, input.id));
    return { success: true };
  }),

  /** 超支提醒：获取当月所有超支的预算 */
  overBudget: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
  })).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startDate = `${yearMonth}-01`;
    const endDate = getMonthEndDate(yearMonth);

    const budgets = await db.query.budgets.findMany({
      where: and(
        eq(schema.budgets.ledgerId, input.ledgerId),
        eq(schema.budgets.yearMonth, yearMonth),
      ),
    });

    if (budgets.length === 0) return [];

    const spending = await db.select({
      categoryId: schema.transactions.categoryId,
      total: sql<string>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.ledgerId, input.ledgerId),
        eq(schema.transactions.type, 'expense'),
        sql`${schema.transactions.date} >= ${startDate}`,
        sql`${schema.transactions.date} <= ${endDate}`,
      ))
      .groupBy(schema.transactions.categoryId);

    const spendingMap = new Map(
      spending.map((s) => [s.categoryId, parseFloat(s.total) || 0])
    );

    const categories = await db.query.categories.findMany({
      where: eq(schema.categories.ledgerId, input.ledgerId),
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return budgets
      .map((b) => {
        const budgetAmount = parseFloat(b.amount);
        const spent = b.categoryId ? (spendingMap.get(b.categoryId) || 0) : getTotalSpending(spendingMap);
        const cat = b.categoryId ? categoryMap.get(b.categoryId) : null;
        return {
          id: b.id,
          categoryName: cat ? cat.name : '总预算',
          amount: budgetAmount,
          spent,
          overAmount: spent - budgetAmount,
        };
      })
      .filter((b) => b.overAmount > 0);
  }),
});

function getMonthEndDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

function getTotalSpending(spendingMap: Map<string | null, number>): number {
  let total = 0;
  for (const [, amount] of spendingMap) {
    total += amount;
  }
  return total;
}

export { budgetRouter };
