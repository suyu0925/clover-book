import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, getTrpcClient } from './lib/trpc';
import { AuthProvider, useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { LedgerListPage } from './pages/LedgerListPage';
import { TransactionPage } from './pages/TransactionPage';
import './styles/globals.css';

function AppContent() {
  const { user } = useAuth();
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);

  if (!user) return <LoginPage />;
  if (selectedLedgerId) {
    return <TransactionPage ledgerId={selectedLedgerId} onBack={() => setSelectedLedgerId(null)} />;
  }
  return <LedgerListPage onSelectLedger={setSelectedLedgerId} />;
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
