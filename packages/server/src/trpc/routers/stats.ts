import { router, protectedProcedure } from '../index';
import { TRPCError } from '@trpc/server';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
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

const statsRouter = router({
  /**
   * 收支汇总：指定时间段内的总收入、总支出、净收入
   */
  summary: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    startDate: z.string(), // YYYY-MM-DD
    endDate: z.string(),   // YYYY-MM-DD
  })).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const result = await db.select({
      type: schema.transactions.type,
      total: sql<string>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.ledgerId, input.ledgerId),
        gte(schema.transactions.date, input.startDate),
        lte(schema.transactions.date, input.endDate),
      ))
      .groupBy(schema.transactions.type);

    let totalIncome = 0;
    let totalExpense = 0;

    for (const row of result) {
      const amount = parseFloat(row.total) || 0;
      if (row.type === 'income') totalIncome += amount;
      else if (row.type === 'expense') totalExpense += amount;
    }

    return {
      totalIncome,
      totalExpense,
      netIncome: totalIncome - totalExpense,
    };
  }),

  /**
   * 分类统计：指定时间段内按分类汇总金额（用于饼图）
   */
  byCategory: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    startDate: z.string(),
    endDate: z.string(),
    type: z.enum(['expense', 'income']).default('expense'),
  })).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    // 查询带分类ID的交易汇总
    const result = await db.select({
      categoryId: schema.transactions.categoryId,
      total: sql<string>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.ledgerId, input.ledgerId),
        eq(schema.transactions.type, input.type),
        gte(schema.transactions.date, input.startDate),
        lte(schema.transactions.date, input.endDate),
      ))
      .groupBy(schema.transactions.categoryId);

    // 查询所有分类用于映射名称
    const categories = await db.query.categories.findMany({
      where: eq(schema.categories.ledgerId, input.ledgerId),
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const items = result.map((row) => {
      const cat = row.categoryId ? categoryMap.get(row.categoryId) : null;
      let name = '未分类';
      if (cat) {
        if (cat.parentId) {
          const parent = categoryMap.get(cat.parentId);
          name = parent ? `${parent.name}/${cat.name}` : cat.name;
        } else {
          name = cat.name;
        }
      }
      return {
        categoryId: row.categoryId,
        name,
        total: parseFloat(row.total) || 0,
        count: parseInt(row.count) || 0,
      };
    });

    // 按金额降序
    items.sort((a, b) => b.total - a.total);

    return items;
  }),

  /**
   * 月度趋势：按月汇总收支（用于折线图）
   */
  monthlyTrend: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    months: z.number().min(1).max(24).default(6), // 最近 N 个月
  })).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    // 计算起始日期
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - input.months + 1, 1);
    const startStr = startDate.toISOString().slice(0, 10);

    const result = await db.select({
      month: sql<string>`TO_CHAR(${schema.transactions.date}::date, 'YYYY-MM')`,
      type: schema.transactions.type,
      total: sql<string>`COALESCE(SUM(${schema.transactions.amount}), 0)`,
    })
      .from(schema.transactions)
      .where(and(
        eq(schema.transactions.ledgerId, input.ledgerId),
        gte(schema.transactions.date, startStr),
      ))
      .groupBy(sql`TO_CHAR(${schema.transactions.date}::date, 'YYYY-MM')`, schema.transactions.type);

    // 构建月份列表
    const months: { month: string; income: number; expense: number }[] = [];
    for (let i = 0; i < input.months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - input.months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ month: key, income: 0, expense: 0 });
    }

    // 填充数据
    for (const row of result) {
      const entry = months.find((m) => m.month === row.month);
      if (entry) {
        const amount = parseFloat(row.total) || 0;
        if (row.type === 'income') entry.income = amount;
        else if (row.type === 'expense') entry.expense = amount;
      }
    }

    return months;
  }),
});

export { statsRouter };
