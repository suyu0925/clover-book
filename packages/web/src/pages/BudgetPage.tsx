import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { ArrowLeft, Plus, Trash2, AlertTriangle } from 'lucide-react';

interface Props {
  ledgerId: string;
  onBack: () => void;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function BudgetPage({ ledgerId, onBack }: Props) {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth);
  const [showAdd, setShowAdd] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState('');

  const { data: budgets, refetch } = trpc.budget.list.useQuery({ ledgerId, yearMonth });
  const { data: categories } = trpc.category.list.useQuery({ ledgerId });
  const { data: overBudgets } = trpc.budget.overBudget.useQuery({ ledgerId });

  const upsertMutation = trpc.budget.upsert.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setAddAmount(''); },
  });
  const deleteMutation = trpc.budget.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) return;
    upsertMutation.mutate({ ledgerId, yearMonth, categoryId: addCategoryId, amount });
  };

  // 月份导航
  const changeMonth = (delta: number) => {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">预算管理</h1>
          <button
            onClick={() => setShowAdd(true)}
            className="p-1.5 text-green-600 hover:text-green-700"
          >
            <Plus size={20} />
          </button>
        </div>
        {/* 月份选择器 */}
        <div className="max-w-md mx-auto px-4 pb-3 flex items-center justify-center gap-4">
          <button onClick={() => changeMonth(-1)} className="text-gray-400 hover:text-gray-600 text-lg px-2">&lt;</button>
          <span className="font-medium text-gray-700">{yearMonth}</span>
          <button onClick={() => changeMonth(1)} className="text-gray-400 hover:text-gray-600 text-lg px-2">&gt;</button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* 超支提醒 */}
        {overBudgets && overBudgets.length > 0 && yearMonth === getCurrentYearMonth() && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertTriangle size={16} />
              <span className="text-sm font-medium">超支提醒</span>
            </div>
            {overBudgets.map((b) => (
              <p key={b.id} className="text-sm text-red-500 ml-6">
                {b.categoryName}：超支 ¥{b.overAmount.toFixed(2)}
              </p>
            ))}
          </div>
        )}

        {/* 添加预算表单 */}
        {showAdd && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-500">设置预算</h3>
            <select
              value={addCategoryId || ''}
              onChange={(e) => setAddCategoryId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">总预算（所有支出）</option>
              {categories?.map((cat) => (
                <optgroup key={cat.id} label={cat.name}>
                  {cat.children?.map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                  <option value={cat.id}>{cat.name}（整体）</option>
                </optgroup>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="预算金额"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={upsertMutation.isPending}
                className="flex-1 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                保存
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

        {/* 预算列表 */}
        {budgets && budgets.length > 0 ? (
          <div className="space-y-3">
            {budgets.map((b) => {
              const percent = b.amount > 0 ? Math.min((b.spent / b.amount) * 100, 100) : 0;
              return (
                <div key={b.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm text-gray-800">{b.categoryName}</span>
                    <button
                      onClick={() => { if (confirm('确定删除此预算？')) deleteMutation.mutate({ id: b.id }); }}
                      className="p-1 text-gray-300 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {/* 进度条 */}
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all ${b.isOverBudget ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>已花 ¥{b.spent.toFixed(2)}</span>
                    <span className={b.isOverBudget ? 'text-red-500 font-medium' : ''}>
                      {b.isOverBudget ? `超支 ¥${(-b.remaining).toFixed(2)}` : `剩余 ¥${b.remaining.toFixed(2)}`}
                    </span>
                    <span>预算 ¥{b.amount.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8">暂无预算，点击 + 设置预算</p>
        )}
      </main>
    </div>
  );
}
