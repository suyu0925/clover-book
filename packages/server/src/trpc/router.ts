import { router } from './index';
import { authRouter } from './routers/auth';
import { ledgerRouter } from './routers/ledger';
import { transactionRouter } from './routers/transaction';

export const appRouter = router({
  auth: authRouter,
  ledger: ledgerRouter,
  transaction: transactionRouter,
});

export type AppRouter = typeof appRouter;
