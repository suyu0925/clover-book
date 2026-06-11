import { router, publicProcedure, protectedProcedure } from '../index';
import { loginSchema, registerSchema } from '@clover-book/core';
import { TRPCError } from '@trpc/server';
import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { JWT_SECRET } from '../context';

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
});

export { authRouter };
