import { router, protectedProcedure } from '../index';
import { createLedgerSchema, shareLedgerSchema } from '@clover-book/core';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../../db';
import { z } from 'zod';

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
