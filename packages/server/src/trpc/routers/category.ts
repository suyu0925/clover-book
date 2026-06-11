import { router, protectedProcedure } from '../index';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull } from 'drizzle-orm';
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

const categoryRouter = router({
  /** 获取账本的所有分类（树形结构） */
  list: protectedProcedure.input(z.object({ ledgerId: z.string().uuid() })).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const all = await db.query.categories.findMany({
      where: eq(schema.categories.ledgerId, input.ledgerId),
      orderBy: (c, { asc }) => [asc(c.sortOrder), asc(c.name)],
    });

    // 组装为树形结构
    const roots = all.filter((c) => !c.parentId);
    return roots.map((root) => ({
      ...root,
      children: all.filter((c) => c.parentId === root.id),
    }));
  }),

  /** 创建分类 */
  create: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    name: z.string().min(1).max(50),
    parentId: z.string().uuid().optional(),
    icon: z.string().max(50).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    // 如果有 parentId，验证父分类存在且属于同一账本
    if (input.parentId) {
      const parent = await db.query.categories.findFirst({
        where: and(
          eq(schema.categories.id, input.parentId),
          eq(schema.categories.ledgerId, input.ledgerId),
        ),
      });
      if (!parent) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '父分类不存在' });
      }
      // 不允许三级嵌套
      if (parent.parentId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '最多支持两级分类' });
      }
    }

    const [category] = await db.insert(schema.categories).values({
      ledgerId: input.ledgerId,
      name: input.name,
      parentId: input.parentId,
      icon: input.icon,
    }).returning();

    return category;
  }),

  /** 更新分类 */
  update: protectedProcedure.input(z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(50).optional(),
    icon: z.string().max(50).optional(),
    sortOrder: z.number().int().optional(),
  })).mutation(async ({ input, ctx }) => {
    const category = await db.query.categories.findFirst({
      where: eq(schema.categories.id, input.id),
    });
    if (!category) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '分类不存在' });
    }

    await assertLedgerAccess(category.ledgerId, ctx.user.id);

    const updates: Record<string, any> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.icon !== undefined) updates.icon = input.icon;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

    if (Object.keys(updates).length === 0) return category;

    const [updated] = await db.update(schema.categories)
      .set(updates)
      .where(eq(schema.categories.id, input.id))
      .returning();

    return updated;
  }),

  /** 删除分类 */
  delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const category = await db.query.categories.findFirst({
      where: eq(schema.categories.id, input.id),
    });
    if (!category) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '分类不存在' });
    }

    await assertLedgerAccess(category.ledgerId, ctx.user.id);

    // 删除子分类
    await db.delete(schema.categories).where(eq(schema.categories.parentId, input.id));
    // 删除自身
    await db.delete(schema.categories).where(eq(schema.categories.id, input.id));

    return { success: true };
  }),
});

export { categoryRouter };
