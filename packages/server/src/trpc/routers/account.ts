import { router, protectedProcedure } from '../index';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../../db';
import { z } from 'zod';
import { appendAccount } from '../../beancount/file-manager';

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

const accountRouter = router({
  list: protectedProcedure.input(z.object({ ledgerId: z.string().uuid() })).query(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);
    const accounts = await db.query.accounts.findMany({
      where: eq(schema.accounts.ledgerId, input.ledgerId),
    });
    return accounts;
  }),

  create: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    name: z.string().max(200),
    type: z.enum(['assets', 'liabilities', 'income', 'expenses', 'equity']),
    displayName: z.string().max(100),
  })).mutation(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);
    const today = new Date().toISOString().slice(0, 10);
    const [account] = await db.insert(schema.accounts).values({
      ledgerId: input.ledgerId,
      name: input.name,
      type: input.type,
      displayName: input.displayName,
      openingDate: today,
    }).returning();

    // 同步到 Beancount 文件
    const ledger = await db.query.ledgers.findFirst({
      where: eq(schema.ledgers.id, input.ledgerId),
    });
    if (ledger) {
      await appendAccount(ledger.filePath, {
        date: today,
        action: 'open',
        account: input.name,
        currencies: ['CNY'],
        comment: input.displayName,
      });
    }

    return account;
  }),
});

export { accountRouter };
