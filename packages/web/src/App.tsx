import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, getTrpcClient } from './lib/trpc';
import './styles/globals.css';

function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => getTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-md mx-auto p-6 pt-20 text-center">
            <h1 className="text-3xl font-bold text-green-700 mb-2">🍀 Clover Book</h1>
            <p className="text-gray-600">家庭记账本</p>
            <p className="text-sm text-gray-400 mt-4">应用正在开发中...</p>
          </div>
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export default App;
