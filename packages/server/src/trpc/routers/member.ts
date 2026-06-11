import { router, protectedProcedure } from '../index';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../../db';
import { z } from 'zod';

/** 检查用户是否是账本 owner */
async function assertOwner(ledgerId: string, userId: string) {
  const member = await db.query.ledgerMembers.findFirst({
    where: and(
      eq(schema.ledgerMembers.ledgerId, ledgerId),
      eq(schema.ledgerMembers.userId, userId),
    ),
  });
  if (!member || member.role !== 'owner') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅账本创建者可管理成员' });
  }
  return member;
}

const memberRouter = router({
  /** 列出账本所有成员 */
  list: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
  })).query(async ({ input, ctx }) => {
    // 任何成员都可以查看成员列表
    const myMembership = await db.query.ledgerMembers.findFirst({
      where: and(
        eq(schema.ledgerMembers.ledgerId, input.ledgerId),
        eq(schema.ledgerMembers.userId, ctx.user.id),
      ),
    });
    if (!myMembership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: '无权访问此账本' });
    }

    const members = await db.query.ledgerMembers.findMany({
      where: eq(schema.ledgerMembers.ledgerId, input.ledgerId),
    });

    // 获取用户信息
    const userIds = members.map(m => m.userId);
    const users = await db.query.users.findMany({
      where: (u, { inArray }) => inArray(u.id, userIds),
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    return members.map(m => {
      const user = userMap.get(m.userId);
      return {
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        username: user?.username || '',
        displayName: user?.displayName || '',
        avatarUrl: user?.avatarUrl || null,
      };
    });
  }),

  /** 通过用户名邀请成员 */
  invite: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    username: z.string().min(1),
  })).mutation(async ({ input, ctx }) => {
    await assertOwner(input.ledgerId, ctx.user.id);

    // 查找被邀请用户
    const targetUser = await db.query.users.findFirst({
      where: eq(schema.users.username, input.username),
    });
    if (!targetUser) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `用户 "${input.username}" 不存在` });
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

    const [member] = await db.insert(schema.ledgerMembers).values({
      ledgerId: input.ledgerId,
      userId: targetUser.id,
      role: 'member',
    }).returning();

    return {
      ...member,
      username: targetUser.username,
      displayName: targetUser.displayName,
      avatarUrl: targetUser.avatarUrl,
    };
  }),

  /** 移除成员 */
  remove: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    userId: z.string().uuid(),
  })).mutation(async ({ input, ctx }) => {
    await assertOwner(input.ledgerId, ctx.user.id);

    if (input.userId === ctx.user.id) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '不能移除自己' });
    }

    const member = await db.query.ledgerMembers.findFirst({
      where: and(
        eq(schema.ledgerMembers.ledgerId, input.ledgerId),
        eq(schema.ledgerMembers.userId, input.userId),
      ),
    });
    if (!member) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '成员不存在' });
    }

    await db.delete(schema.ledgerMembers).where(eq(schema.ledgerMembers.id, member.id));
    return { success: true };
  }),

  /** 转让 owner 角色 */
  transferOwnership: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    newOwnerId: z.string().uuid(),
  })).mutation(async ({ input, ctx }) => {
    await assertOwner(input.ledgerId, ctx.user.id);

    // 检查新 owner 是否是成员
    const newOwnerMember = await db.query.ledgerMembers.findFirst({
      where: and(
        eq(schema.ledgerMembers.ledgerId, input.ledgerId),
        eq(schema.ledgerMembers.userId, input.newOwnerId),
      ),
    });
    if (!newOwnerMember) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '目标用户不是账本成员' });
    }

    // 将当前 owner 设为 member
    await db.update(schema.ledgerMembers)
      .set({ role: 'member' })
      .where(and(
        eq(schema.ledgerMembers.ledgerId, input.ledgerId),
        eq(schema.ledgerMembers.userId, ctx.user.id),
      ));

    // 将新 owner 设为 owner
    await db.update(schema.ledgerMembers)
      .set({ role: 'owner' })
      .where(eq(schema.ledgerMembers.id, newOwnerMember.id));

    // 更新 ledger 的 ownerId
    await db.update(schema.ledgers)
      .set({ ownerId: input.newOwnerId })
      .where(eq(schema.ledgers.id, input.ledgerId));

    return { success: true };
  }),
});

export { memberRouter };
