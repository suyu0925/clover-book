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
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { RecurringPage } from './pages/RecurringPage';
import { ImportPage } from './pages/ImportPage';
import { MemberPage } from './pages/MemberPage';
import { SettingsPage } from './pages/SettingsPage';
import './styles/globals.css';

type Page =
  | { type: 'ledgers' }
  | { type: 'transactions'; ledgerId: string }
  | { type: 'categories'; ledgerId: string }
  | { type: 'accounts'; ledgerId: string }
  | { type: 'stats'; ledgerId: string }
  | { type: 'budget'; ledgerId: string }
  | { type: 'transactionDetail'; ledgerId: string; transactionId: string }
  | { type: 'recurring'; ledgerId: string }
  | { type: 'import'; ledgerId: string }
  | { type: 'members'; ledgerId: string }
  | { type: 'settings' };

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
          onViewRecurring={() => setPage({ type: 'recurring', ledgerId: page.ledgerId })}
          onImport={() => setPage({ type: 'import', ledgerId: page.ledgerId })}
          onViewMembers={() => setPage({ type: 'members', ledgerId: page.ledgerId })}
          onSelectTransaction={(txId) => setPage({ type: 'transactionDetail', ledgerId: page.ledgerId, transactionId: txId })}
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
    case 'transactionDetail':
      return (
        <TransactionDetailPage
          transactionId={page.transactionId}
          ledgerId={page.ledgerId}
          onBack={() => setPage({ type: 'transactions', ledgerId: page.ledgerId })}
          onDeleted={() => setPage({ type: 'transactions', ledgerId: page.ledgerId })}
        />
      );
    case 'recurring':
      return (
        <RecurringPage
          ledgerId={page.ledgerId}
          onBack={() => setPage({ type: 'transactions', ledgerId: page.ledgerId })}
        />
      );
    case 'import':
      return (
        <ImportPage
          ledgerId={page.ledgerId}
          onBack={() => setPage({ type: 'transactions', ledgerId: page.ledgerId })}
        />
      );
    case 'members':
      return (
        <MemberPage
          ledgerId={page.ledgerId}
          onBack={() => setPage({ type: 'transactions', ledgerId: page.ledgerId })}
        />
      );
    case 'settings':
      return (
        <SettingsPage
          onBack={() => setPage({ type: 'ledgers' })}
        />
      );
    default:
      return (
        <LedgerListPage
          onSelectLedger={(id) => setPage({ type: 'transactions', ledgerId: id })}
          onOpenSettings={() => setPage({ type: 'settings' })}
        />
      );
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
