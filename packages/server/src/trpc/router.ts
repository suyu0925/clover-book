import { router } from './index';
import { authRouter } from './routers/auth';
import { ledgerRouter } from './routers/ledger';
import { transactionRouter } from './routers/transaction';
import { accountRouter } from './routers/account';
import { categoryRouter } from './routers/category';

export const appRouter = router({
  auth: authRouter,
  ledger: ledgerRouter,
  transaction: transactionRouter,
  account: accountRouter,
  category: categoryRouter,
});

export type AppRouter = typeof appRouter;

