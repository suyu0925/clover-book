import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { ArrowLeft, Plus, XCircle, CheckCircle, Pencil } from 'lucide-react';

interface Props {
  ledgerId: string;
  onBack: () => void;
}

const ACCOUNT_TYPES = [
  { value: 'assets', label: '资产', prefix: 'Assets' },
  { value: 'liabilities', label: '负债', prefix: 'Liabilities' },
  { value: 'income', label: '收入', prefix: 'Income' },
  { value: 'expenses', label: '支出', prefix: 'Expenses' },
  { value: 'equity', label: '权益', prefix: 'Equity' },
] as const;

type AccountType = (typeof ACCOUNT_TYPES)[number]['value'];

export function AccountPage({ ledgerId, onBack }: Props) {
  const { data: accounts, refetch } = trpc.account.list.useQuery({ ledgerId });
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<AccountType>('assets');
  const [addName, setAddName] = useState('');
  const [addDisplayName, setAddDisplayName] = useState('');

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');

  const createMutation = trpc.account.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setAddName(''); setAddDisplayName(''); },
  });
  const updateMutation = trpc.account.update.useMutation({
    onSuccess: () => { refetch(); setEditingId(null); },
  });
  const closeMutation = trpc.account.close.useMutation({
    onSuccess: () => refetch(),
  });
  const reopenMutation = trpc.account.reopen.useMutation({
    onSuccess: () => refetch(),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addDisplayName.trim()) return;
    const prefix = ACCOUNT_TYPES.find((t) => t.value === addType)?.prefix || 'Assets';
    const fullName = `${prefix}:${addName.trim()}`;
    createMutation.mutate({
      ledgerId,
      name: fullName,
      type: addType,
      displayName: addDisplayName.trim(),
    });
  };

  const handleUpdate = (id: string) => {
    if (!editDisplayName.trim()) return;
    updateMutation.mutate({ id, ledgerId, displayName: editDisplayName.trim() });
  };

  // 按类型分组
  const grouped = ACCOUNT_TYPES.map((typeInfo) => ({
    ...typeInfo,
    accounts: (accounts || []).filter((a) => a.type === typeInfo.value),
  })).filter((g) => g.accounts.length > 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">账户管理</h1>
          <button
            onClick={() => setShowAdd(true)}
            className="p-1.5 text-green-600 hover:text-green-700"
          >
            <Plus size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        {/* 添加账户表单 */}
        {showAdd && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 mb-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-500">新建账户</h3>
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as AccountType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label} ({t.prefix})</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="账户名称（如 Bank:CMB）"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
            <input
              type="text"
              placeholder="显示名称（如 招商银行）"
              value={addDisplayName}
              onChange={(e) => setAddDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
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
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {/* 账户列表，按类型分组 */}
        <div className="space-y-4">
          {grouped.length === 0 && (
            <p className="text-center text-gray-400 py-8">暂无账户</p>
          )}
          {grouped.map((group) => (
            <div key={group.value}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                {group.label}
              </h2>
              <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
                {group.accounts.map((account) => (
                  <div key={account.id} className="px-4 py-3">
                    {editingId === account.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdate(account.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button
                          onClick={() => handleUpdate(account.id)}
                          disabled={updateMutation.isPending}
                          className="text-green-600 hover:text-green-700"
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <XCircle size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm ${account.isClosed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {account.displayName}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{account.name}</p>
                        </div>
                        {account.isClosed ? (
                          <button
                            onClick={() => reopenMutation.mutate({ id: account.id, ledgerId })}
                            disabled={reopenMutation.isPending}
                            className="ml-2 text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                          >
                            重新开启
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditingId(account.id); setEditDisplayName(account.displayName); }}
                              className="p-1 text-gray-400 hover:text-gray-600 mr-1"
                              title="编辑"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`确定关闭账户「${account.displayName}」？关闭后不可用于新交易。`))
                                  closeMutation.mutate({ id: account.id, ledgerId });
                              }}
                              className="p-1 text-gray-400 hover:text-red-500"
                              title="关闭"
                            >
                              <XCircle size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
