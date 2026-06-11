import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, getTrpcClient } from './lib/trpc';
import { AuthProvider, useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { LedgerListPage } from './pages/LedgerListPage';
import { TransactionPage } from './pages/TransactionPage';
import { CategoryPage } from './pages/CategoryPage';
import { AccountPage } from './pages/AccountPage';
import { StatsPage } from './pages/StatsPage';
import { BudgetPage } from './pages/BudgetPage';
import './styles/globals.css';

type Page =
  | { type: 'ledgers' }
  | { type: 'transactions'; ledgerId: string }
  | { type: 'categories'; ledgerId: string }
  | { type: 'accounts'; ledgerId: string }
  | { type: 'stats'; ledgerId: string }
  | { type: 'budget'; ledgerId: string };

function AppContent() {
  const { user } = useAuth();
  const [page, setPage] = useState<Page>({ type: 'ledgers' });

  if (!user) return <LoginPage />;

  switch (page.type) {
    case 'transactions':
      return (
        <TransactionPage
          ledgerId={page.ledgerId}
          onBack={() => setPage({ type: 'ledgers' })}
          onManageCategories={() => setPage({ type: 'categories', ledgerId: page.ledgerId })}
          onManageAccounts={() => setPage({ type: 'accounts', ledgerId: page.ledgerId })}
          onViewStats={() => setPage({ type: 'stats', ledgerId: page.ledgerId })}
          onViewBudget={() => setPage({ type: 'budget', ledgerId: page.ledgerId })}
        />
      );
    case 'categories':
      return (
        <CategoryPage
          ledgerId={page.ledgerId}
          onBack={() => setPage({ type: 'transactions', ledgerId: page.ledgerId })}
        />
      );
    case 'accounts':
      return (
        <AccountPage
          ledgerId={page.ledgerId}
          onBack={() => setPage({ type: 'transactions', ledgerId: page.ledgerId })}
        />
      );
    case 'stats':
      return (
        <StatsPage
          ledgerId={page.ledgerId}
          onBack={() => setPage({ type: 'transactions', ledgerId: page.ledgerId })}
        />
      );
    case 'budget':
      return (
        <BudgetPage
          ledgerId={page.ledgerId}
          onBack={() => setPage({ type: 'transactions', ledgerId: page.ledgerId })}
        />
      );
    default:
      return <LedgerListPage onSelectLedger={(id) => setPage({ type: 'transactions', ledgerId: id })} />;
  }
}

function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => getTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export default App;
