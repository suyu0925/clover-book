import { router, protectedProcedure } from '../index';
import { createLedgerSchema, shareLedgerSchema } from '@clover-book/core';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../../db';
import { z } from 'zod';
import { initLedgerFile, appendAccounts } from '../../beancount/file-manager';

const ledgerRouter = router({
  create: protectedProcedure.input(createLedgerSchema).mutation(async ({ input, ctx }) => {
    const ledgerId = crypto.randomUUID();
    const filePath = `ledgers/${ledgerId}/main.beancount`;

    const [ledger] = await db.insert(schema.ledgers).values({
      id: ledgerId,
      name: input.name,
      description: input.description,
      ownerId: ctx.user.id,
      filePath,
    }).returning();

    // 将创建者加入成员表
    await db.insert(schema.ledgerMembers).values({
      ledgerId: ledger.id,
      userId: ctx.user.id,
      role: 'owner',
    });

    // 初始化默认账户
    const today = new Date().toISOString().slice(0, 10);
    const defaultAccounts = [
      { ledgerId: ledger.id, name: 'Assets:Cash', type: 'assets' as const, displayName: '现金', openingDate: today },
      { ledgerId: ledger.id, name: 'Assets:Bank', type: 'assets' as const, displayName: '银行卡', openingDate: today },
      { ledgerId: ledger.id, name: 'Expenses:Food', type: 'expenses' as const, displayName: '餐饮', openingDate: today },
      { ledgerId: ledger.id, name: 'Expenses:Transport', type: 'expenses' as const, displayName: '交通', openingDate: today },
      { ledgerId: ledger.id, name: 'Expenses:Shopping', type: 'expenses' as const, displayName: '购物', openingDate: today },
      { ledgerId: ledger.id, name: 'Expenses:General', type: 'expenses' as const, displayName: '其他支出', openingDate: today },
      { ledgerId: ledger.id, name: 'Income:Salary', type: 'income' as const, displayName: '工资', openingDate: today },
      { ledgerId: ledger.id, name: 'Income:Other', type: 'income' as const, displayName: '其他收入', openingDate: today },
    ];
    await db.insert(schema.accounts).values(defaultAccounts);

    // 初始化 Beancount 文件
    await initLedgerFile(filePath, input.name);
    await appendAccounts(filePath, defaultAccounts.map((a) => ({
      date: today,
      action: 'open' as const,
      account: a.name,
      currencies: ['CNY'],
      comment: a.displayName,
    })));

    // 初始化默认分类（两级）
    const expenseParents = [
      { ledgerId: ledger.id, name: '餐饮', icon: 'utensils', sortOrder: 1 },
      { ledgerId: ledger.id, name: '交通', icon: 'car', sortOrder: 2 },
      { ledgerId: ledger.id, name: '购物', icon: 'shopping-bag', sortOrder: 3 },
      { ledgerId: ledger.id, name: '居住', icon: 'home', sortOrder: 4 },
      { ledgerId: ledger.id, name: '娱乐', icon: 'gamepad', sortOrder: 5 },
      { ledgerId: ledger.id, name: '其他', icon: 'more-horizontal', sortOrder: 6 },
    ];
    const incomeParents = [
      { ledgerId: ledger.id, name: '工资', icon: 'briefcase', sortOrder: 10 },
      { ledgerId: ledger.id, name: '奖金', icon: 'gift', sortOrder: 11 },
      { ledgerId: ledger.id, name: '其他收入', icon: 'plus-circle', sortOrder: 12 },
    ];
    const parentRows = await db.insert(schema.categories)
      .values([...expenseParents, ...incomeParents])
      .returning();

    // 二级分类
    const foodId = parentRows.find((r) => r.name === '餐饮')!.id;
    const transportId = parentRows.find((r) => r.name === '交通')!.id;
    const shoppingId = parentRows.find((r) => r.name === '购物')!.id;
    await db.insert(schema.categories).values([
      { ledgerId: ledger.id, name: '早餐', parentId: foodId, sortOrder: 1 },
      { ledgerId: ledger.id, name: '午餐', parentId: foodId, sortOrder: 2 },
      { ledgerId: ledger.id, name: '晚餐', parentId: foodId, sortOrder: 3 },
      { ledgerId: ledger.id, name: '零食', parentId: foodId, sortOrder: 4 },
      { ledgerId: ledger.id, name: '公交地铁', parentId: transportId, sortOrder: 1 },
      { ledgerId: ledger.id, name: '打车', parentId: transportId, sortOrder: 2 },
      { ledgerId: ledger.id, name: '日用品', parentId: shoppingId, sortOrder: 1 },
      { ledgerId: ledger.id, name: '衣服', parentId: shoppingId, sortOrder: 2 },
    ]);

    return ledger;
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const members = await db.query.ledgerMembers.findMany({
      where: eq(schema.ledgerMembers.userId, ctx.user.id),
    });
    if (members.length === 0) return [];

    const ledgerIds = members.map((m) => m.ledgerId);
    const ledgers = await db.query.ledgers.findMany({
      where: (l, { inArray }) => inArray(l.id, ledgerIds),
    });

    return ledgers.map((l) => ({
      ...l,
      role: members.find((m) => m.ledgerId === l.id)!.role,
    }));
  }),

  get: protectedProcedure.input(z.object({ ledgerId: z.string().uuid() })).query(async ({ input, ctx }) => {
    const member = await db.query.ledgerMembers.findFirst({
      where: and(
        eq(schema.ledgerMembers.ledgerId, input.ledgerId),
        eq(schema.ledgerMembers.userId, ctx.user.id),
      ),
    });
    if (!member) {
      throw new TRPCError({ code: 'FORBIDDEN', message: '无权访问此账本' });
    }

    const ledger = await db.query.ledgers.findFirst({
      where: eq(schema.ledgers.id, input.ledgerId),
    });
    if (!ledger) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '账本不存在' });
    }

    return { ...ledger, role: member.role };
  }),

  delete: protectedProcedure.input(z.object({ ledgerId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const ledger = await db.query.ledgers.findFirst({
      where: eq(schema.ledgers.id, input.ledgerId),
    });
    if (!ledger) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '账本不存在' });
    }
    if (ledger.ownerId !== ctx.user.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: '只有账本所有者可以删除' });
    }

    await db.delete(schema.ledgers).where(eq(schema.ledgers.id, input.ledgerId));
    return { success: true };
  }),

  share: protectedProcedure.input(shareLedgerSchema).mutation(async ({ input, ctx }) => {
    // 验证是账本成员
    const member = await db.query.ledgerMembers.findFirst({
      where: and(
        eq(schema.ledgerMembers.ledgerId, input.ledgerId),
        eq(schema.ledgerMembers.userId, ctx.user.id),
      ),
    });
    if (!member) {
      throw new TRPCError({ code: 'FORBIDDEN', message: '无权操作此账本' });
    }

    // 查找目标用户
    const targetUser = await db.query.users.findFirst({
      where: eq(schema.users.username, input.username),
    });
    if (!targetUser) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });
    }

    // 检查是否已是成员
    const existing = await db.query.ledgerMembers.findFirst({
      where: and(
        eq(schema.ledgerMembers.ledgerId, input.ledgerId),
        eq(schema.ledgerMembers.userId, targetUser.id),
      ),
    });
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: '该用户已是账本成员' });
    }

    await db.insert(schema.ledgerMembers).values({
      ledgerId: input.ledgerId,
      userId: targetUser.id,
      role: 'member',
    });

    return { success: true };
  }),
});

export { ledgerRouter };
