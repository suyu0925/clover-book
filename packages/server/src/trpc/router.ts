import { router } from './index';
import { authRouter } from './routers/auth';
import { ledgerRouter } from './routers/ledger';
import { transactionRouter } from './routers/transaction';
import { accountRouter } from './routers/account';
import { categoryRouter } from './routers/category';
import { statsRouter } from './routers/stats';
import { budgetRouter } from './routers/budget';
import { recurringRouter } from './routers/recurring';

export const appRouter = router({
  auth: authRouter,
  ledger: ledgerRouter,
  transaction: transactionRouter,
  account: accountRouter,
  category: categoryRouter,
  stats: statsRouter,
  budget: budgetRouter,
  recurring: recurringRouter,
});

export type AppRouter = typeof appRouter;

