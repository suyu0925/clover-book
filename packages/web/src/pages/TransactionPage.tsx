import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { ArrowLeft, Plus, ArrowDownLeft, ArrowUpRight, Settings, Wallet, BarChart3, PiggyBank } from 'lucide-react';

interface Props {
  ledgerId: string;
  onBack: () => void;
  onManageCategories: () => void;
  onManageAccounts: () => void;
  onViewStats: () => void;
  onViewBudget: () => void;
}

export function TransactionPage({ ledgerId, onBack, onManageCategories, onManageAccounts, onViewStats, onViewBudget }: Props) {
  const [showAdd, setShowAdd] = useState(false);

  const { data: ledger } = trpc.ledger.get.useQuery({ ledgerId });
  const { data: txResult, refetch } = trpc.transaction.list.useQuery({
    ledgerId,
    limit: 50,
  });
  const { data: accounts } = trpc.account.list.useQuery({ ledgerId });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1 truncate">{ledger?.name}</h1>
          <button
            onClick={onViewStats}
            className="p-1.5 text-gray-400 hover:text-gray-600"
            title="报表统计"
          >
            <BarChart3 size={20} />
          </button>
          <button
            onClick={onViewBudget}
            className="p-1.5 text-gray-400 hover:text-gray-600"
            title="预算管理"
          >
            <PiggyBank size={20} />
          </button>
          <button
            onClick={onManageAccounts}
            className="p-1.5 text-gray-400 hover:text-gray-600"
            title="账户管理"
          >
            <Wallet size={20} />
          </button>
          <button
            onClick={onManageCategories}
            className="p-1.5 text-gray-400 hover:text-gray-600"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="p-1.5 text-green-600 hover:text-green-700"
          >
            <Plus size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        {/* 添加交易表单 */}
        {showAdd && accounts && (
          <AddTransactionForm
            ledgerId={ledgerId}
            accounts={accounts}
            onDone={() => { setShowAdd(false); refetch(); }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {/* 交易列表 */}
        <div className="space-y-2">
          {txResult?.items.length === 0 && !showAdd && (
            <p className="text-center text-gray-400 py-8">暂无交易记录</p>
          )}
          {txResult?.items.map((tx) => (
            <div key={tx.id} className="bg-white rounded-lg shadow p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    tx.type === 'expense' ? 'bg-red-100' : 'bg-blue-100'
                  }`}>
                    {tx.type === 'expense'
                      ? <ArrowUpRight size={16} className="text-red-500" />
                      : <ArrowDownLeft size={16} className="text-blue-500" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-medium">{tx.narration || '无描述'}</p>
                    <p className="text-xs text-gray-400">{tx.date}</p>
                  </div>
                </div>
                <span className={`font-medium ${
                  tx.type === 'expense' ? 'text-red-500' : 'text-blue-500'
                }`}>
                  {tx.type === 'expense' ? '-' : '+'}¥{tx.amount}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

interface Account {
  id: string;
  name: string;
  type: string;
  displayName: string;
}

function AddTransactionForm({
  ledgerId,
  accounts,
  onDone,
  onCancel,
}: {
  ledgerId: string;
  accounts: Account[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState('');

  const { data: categories } = trpc.category.list.useQuery({ ledgerId });

  // 根据类型获取默认的 from/to 账户
  const assetAccounts = accounts.filter((a) => a.type === 'assets');
  const expenseAccounts = accounts.filter((a) => a.type === 'expenses');
  const incomeAccounts = accounts.filter((a) => a.type === 'income');

  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');

  // 自动设置默认账户
  const getDefaultFrom = () => type === 'expense' ? assetAccounts[0]?.id : incomeAccounts[0]?.id;
  const getDefaultTo = () => type === 'expense' ? expenseAccounts[0]?.id : assetAccounts[0]?.id;

  const createMutation = trpc.transaction.create.useMutation({ onSuccess: onDone });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const from = fromAccountId || getDefaultFrom();
    const to = toAccountId || getDefaultTo();
    if (!from || !to) return;

    await createMutation.mutateAsync({
      ledgerId,
      type,
      date,
      amount: parseFloat(amount),
      narration: narration || (type === 'expense' ? '支出' : '收入'),
      fromAccountId: from,
      toAccountId: to,
      ...(categoryId ? { categoryId } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mb-4 space-y-3">
      <h3 className="font-semibold text-center">记一笔</h3>

      {/* 收支切换 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType('expense')}
          className={`flex-1 py-2 rounded-md text-sm font-medium ${
            type === 'expense' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
          }`}
        >
          支出
        </button>
        <button
          type="button"
          onClick={() => setType('income')}
          className={`flex-1 py-2 rounded-md text-sm font-medium ${
            type === 'income' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
          }`}
        >
          收入
        </button>
      </div>

      <input
        type="number"
        placeholder="金额"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
        step="0.01"
        min="0"
        required
      />

      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
        required
      />

      <input
        type="text"
        placeholder="描述"
        value={narration}
        onChange={(e) => setNarration(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      {/* 分类选择 */}
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <option value="">选择分类（可选）</option>
        {categories?.map((cat) => (
          <optgroup key={cat.id} label={cat.name}>
            {cat.children?.map((child) => (
              <option key={child.id} value={child.id}>{child.name}</option>
            ))}
            {(!cat.children || cat.children.length === 0) && (
              <option value={cat.id}>{cat.name}</option>
            )}
          </optgroup>
        ))}
      </select>

      {/* 来源账户 */}
      <select
        value={fromAccountId || getDefaultFrom() || ''}
        onChange={(e) => setFromAccountId(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <option value="" disabled>来源账户</option>
        {(type === 'expense' ? assetAccounts : incomeAccounts).map((a) => (
          <option key={a.id} value={a.id}>{a.displayName}</option>
        ))}
      </select>

      {/* 目标账户 */}
      <select
        value={toAccountId || getDefaultTo() || ''}
        onChange={(e) => setToAccountId(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <option value="" disabled>目标账户</option>
        {(type === 'expense' ? expenseAccounts : assetAccounts).map((a) => (
          <option key={a.id} value={a.id}>{a.displayName}</option>
        ))}
      </select>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex-1 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {createMutation.isPending ? '保存中...' : '保存'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          取消
        </button>
      </div>
    </form>
  );
}
