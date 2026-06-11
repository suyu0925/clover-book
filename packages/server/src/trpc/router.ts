import { router } from './index';
import { authRouter } from './routers/auth';
import { ledgerRouter } from './routers/ledger';
import { transactionRouter } from './routers/transaction';
import { accountRouter } from './routers/account';
import { categoryRouter } from './routers/category';
import { statsRouter } from './routers/stats';
import { budgetRouter } from './routers/budget';
import { recurringRouter } from './routers/recurring';
import { importRouter } from './routers/import';
import { attachmentRouter } from './routers/attachment';
import { memberRouter } from './routers/member';

export const appRouter = router({
  auth: authRouter,
  ledger: ledgerRouter,
  transaction: transactionRouter,
  account: accountRouter,
  category: categoryRouter,
  stats: statsRouter,
  budget: budgetRouter,
  recurring: recurringRouter,
  import: importRouter,
  attachment: attachmentRouter,
  member: memberRouter,
});

export type AppRouter = typeof appRouter;

