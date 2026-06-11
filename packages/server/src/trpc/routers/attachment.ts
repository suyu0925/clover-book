import { router, protectedProcedure } from '../index';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../../db';
import { z } from 'zod';
import { unlink } from 'fs/promises';
import { join } from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), '..', '..', 'data', 'uploads');

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

const attachmentRouter = router({
  /** 列出交易的附件 */
  list: protectedProcedure.input(z.object({
    transactionId: z.string().uuid(),
  })).query(async ({ input, ctx }) => {
    const txn = await db.query.transactions.findFirst({
      where: eq(schema.transactions.id, input.transactionId),
    });
    if (!txn) throw new TRPCError({ code: 'NOT_FOUND', message: '交易不存在' });
    await assertLedgerAccess(txn.ledgerId, ctx.user.id);

    const attachments = await db.query.attachments.findMany({
      where: eq(schema.attachments.transactionId, input.transactionId),
    });
    return attachments;
  }),

  /** 删除附件 */
  delete: protectedProcedure.input(z.object({
    id: z.string().uuid(),
  })).mutation(async ({ input, ctx }) => {
    const attachment = await db.query.attachments.findFirst({
      where: eq(schema.attachments.id, input.id),
    });
    if (!attachment) throw new TRPCError({ code: 'NOT_FOUND', message: '附件不存在' });
    await assertLedgerAccess(attachment.ledgerId, ctx.user.id);

    // 删除文件
    try {
      await unlink(join(UPLOAD_DIR, attachment.filePath));
    } catch { /* 文件可能已删除 */ }

    await db.delete(schema.attachments).where(eq(schema.attachments.id, input.id));
    return { success: true };
  }),
});

export { attachmentRouter, UPLOAD_DIR };
