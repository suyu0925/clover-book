import { router, publicProcedure, protectedProcedure } from '../index';
import { loginSchema, registerSchema } from '@clover-book/core';
import { TRPCError } from '@trpc/server';
import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { JWT_SECRET } from '../context';
import { z } from 'zod';

const authRouter = router({
  register: publicProcedure.input(registerSchema).mutation(async ({ input }) => {
    // 检查用户名是否已存在
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.username, input.username),
    });
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: '用户名已存在' });
    }

    // 哈希密码
    const passwordHash = await Bun.password.hash(input.password, { algorithm: 'argon2id' });

    // 创建用户
    const [user] = await db.insert(schema.users).values({
      username: input.username,
      passwordHash,
      displayName: input.displayName,
    }).returning({ id: schema.users.id, username: schema.users.username });

    return { id: user.id, username: user.username };
  }),

  login: publicProcedure.input(loginSchema).mutation(async ({ input }) => {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.username, input.username),
    });
    if (!user) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: '用户名或密码错误' });
    }

    const valid = await Bun.password.verify(input.password, user.passwordHash);
    if (!valid) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: '用户名或密码错误' });
    }

    // 签发 access token
    const accessToken = await new SignJWT({ sub: user.id, username: user.username })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(JWT_SECRET);

    // 签发 refresh token
    const refreshToken = await new SignJWT({ sub: user.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, displayName: user.displayName },
    };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, ctx.user.id),
      columns: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    return user;
  }),

  /** 修改密码 */
  changePassword: protectedProcedure.input(z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  })).mutation(async ({ input, ctx }) => {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, ctx.user.id),
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: '用户不存在' });

    const valid = await Bun.password.verify(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: '当前密码错误' });
    }

    const newHash = await Bun.password.hash(input.newPassword, { algorithm: 'argon2id' });
    await db.update(schema.users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(schema.users.id, ctx.user.id));

    return { success: true };
  }),

  /** 修改个人资料 */
  updateProfile: protectedProcedure.input(z.object({
    displayName: z.string().min(1).max(100).optional(),
    avatarUrl: z.string().max(500).optional().nullable(),
  })).mutation(async ({ input, ctx }) => {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl;

    const [updated] = await db.update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, ctx.user.id))
      .returning({
        id: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl,
      });

    return updated;
  }),
});

export { authRouter };
