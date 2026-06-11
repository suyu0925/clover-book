import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { ArrowLeft, Plus, Play, Pause, Trash2, Clock } from 'lucide-react';

interface Props {
  ledgerId: string;
  onBack: () => void;
}

const FREQ_LABELS: Record<string, string> = {
  daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年',
};

const TYPE_LABELS: Record<string, string> = {
  expense: '支出', income: '收入', transfer: '转账',
  reimbursement: '报销', borrow_in: '借入', borrow_out: '借出',
};

export function RecurringPage({ ledgerId, onBack }: Props) {
  const { data: items, refetch } = trpc.recurring.list.useQuery({ ledgerId });
  const { data: accounts } = trpc.account.list.useQuery({ ledgerId });
  const { data: categories } = trpc.category.list.useQuery({ ledgerId });
  const { data: pending } = trpc.recurring.pending.useQuery({ ledgerId });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'expense' as string,
    amount: '',
    fromAccountId: '',
    toAccountId: '',
    categoryId: '',
    narration: '',
    frequency: 'monthly' as string,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    autoExecute: false,
  });

  const createMutation = trpc.recurring.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); resetForm(); },
  });
  const deleteMutation = trpc.recurring.delete.useMutation({
    onSuccess: () => refetch(),
  });
  const updateMutation = trpc.recurring.update.useMutation({
    onSuccess: () => refetch(),
  });
  const executeMutation = trpc.recurring.execute.useMutation({
    onSuccess: () => refetch(),
  });

  const resetForm = () => setForm({
    name: '', type: 'expense', amount: '', fromAccountId: '', toAccountId: '',
    categoryId: '', narration: '', frequency: 'monthly',
    startDate: new Date().toISOString().slice(0, 10), endDate: '', autoExecute: false,
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.name.trim() || !amount) return;
    createMutation.mutate({
      ledgerId,
      name: form.name.trim(),
      type: form.type as any,
      amount,
      fromAccountId: form.fromAccountId || null,
      toAccountId: form.toAccountId || null,
      categoryId: form.categoryId || null,
      narration: form.narration || null,
      frequency: form.frequency as any,
      startDate: form.startDate,
      endDate: form.endDate || null,
      totalCount: null,
      autoExecute: form.autoExecute,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">周期性交易</h1>
          <button onClick={() => setShowAdd(true)} className="p-1.5 text-green-600 hover:text-green-700">
            <Plus size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* 待执行提醒 */}
        {pending && pending.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-amber-700 mb-2">
              <Clock size={16} />
              <span className="text-sm font-medium">{pending.length} 笔待执行</span>
            </div>
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between ml-6 py-1">
                <span className="text-sm text-amber-600">{p.name} (¥{parseFloat(p.amount).toFixed(2)})</span>
                <button
                  onClick={() => executeMutation.mutate({ id: p.id })}
                  disabled={executeMutation.isPending}
                  className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                >
                  执行
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 新建表单 */}
        {showAdd && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-500">新建周期性交易</h3>
            <input
              type="text"
              placeholder="名称（如：每月房租）"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {Object.entries(FREQ_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <input
              type="number"
              step="0.01"
              placeholder="金额"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.fromAccountId}
                onChange={(e) => setForm({ ...form, fromAccountId: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">付款账户</option>
                {accounts?.filter(a => !a.isClosed).map((a) => (
                  <option key={a.id} value={a.id}>{a.displayName}</option>
                ))}
              </select>
              <select
                value={form.toAccountId}
                onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">收款账户</option>
                {accounts?.filter(a => !a.isClosed).map((a) => (
                  <option key={a.id} value={a.id}>{a.displayName}</option>
                ))}
              </select>
            </div>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">选择分类</option>
              {categories?.map((cat) => (
                <optgroup key={cat.id} label={cat.name}>
                  {cat.children?.map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              type="text"
              placeholder="备注（可选）"
              value={form.narration}
              onChange={(e) => setForm({ ...form, narration: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400">开始日期</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">结束日期（可选）</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
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
                onClick={() => { setShowAdd(false); resetForm(); }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {/* 列表 */}
        {items && items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className={`bg-white rounded-lg shadow p-4 ${!item.isActive ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {FREQ_LABELS[item.frequency]} · ¥{parseFloat(item.amount).toFixed(2)} · {TYPE_LABELS[item.type]}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {item.isActive ? (
                      <button
                        onClick={() => updateMutation.mutate({ id: item.id, isActive: false })}
                        className="p-1 text-gray-400 hover:text-amber-500"
                        title="暂停"
                      >
                        <Pause size={15} />
                      </button>
                    ) : (
                      <button
                        onClick={() => updateMutation.mutate({ id: item.id, isActive: true })}
                        className="p-1 text-gray-400 hover:text-green-600"
                        title="启用"
                      >
                        <Play size={15} />
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm(`确定删除「${item.name}」？`)) deleteMutation.mutate({ id: item.id }); }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>下次执行: {item.nextExecution}</span>
                  <span>已执行 {item.executedCount} 次{item.totalCount ? `/${item.totalCount}` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !showAdd && <p className="text-center text-gray-400 py-8">暂无周期性交易</p>
        )}
      </main>
    </div>
  );
}
