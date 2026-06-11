import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { trpc } from '../lib/trpc';
import { Plus, BookOpen, LogOut } from 'lucide-react';

export function LedgerListPage({ onSelectLedger }: { onSelectLedger: (id: string) => void }) {
  const { user, logout } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: ledgers, refetch } = trpc.ledger.list.useQuery();
  const createMutation = trpc.ledger.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowCreate(false);
      setName('');
      setDescription('');
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ name, description });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-green-700">🍀 Clover Book</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{user?.displayName}</span>
            <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-500">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">我的账本</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
          >
            <Plus size={16} />
            新建
          </button>
        </div>

        {/* 创建账本表单 */}
        {showCreate && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 mb-4 space-y-3">
            <input
              type="text"
              placeholder="账本名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
            <input
              type="text"
              placeholder="描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                创建
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {/* 账本列表 */}
        <div className="space-y-3">
          {ledgers?.length === 0 && (
            <p className="text-center text-gray-400 py-8">暂无账本，点击「新建」创建一个吧</p>
          )}
          {ledgers?.map((ledger) => (
            <button
              key={ledger.id}
              onClick={() => onSelectLedger(ledger.id)}
              className="w-full bg-white rounded-lg shadow p-4 text-left hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <BookOpen size={20} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{ledger.name}</p>
                  {ledger.description && (
                    <p className="text-sm text-gray-500 truncate">{ledger.description}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
