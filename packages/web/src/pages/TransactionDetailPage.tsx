import { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import { ArrowLeft, Pencil, Trash2, Save, X } from 'lucide-react';

interface Props {
  transactionId: string;
  ledgerId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function TransactionDetailPage({ transactionId, ledgerId, onBack, onDeleted }: Props) {
  const { data: txn, refetch } = trpc.transaction.get.useQuery({ id: transactionId });
  const { data: accounts } = trpc.account.list.useQuery({ ledgerId });
  const { data: categories } = trpc.category.list.useQuery({ ledgerId });

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    date: '',
    narration: '',
    payee: '',
    amount: '',
    type: 'expense' as string,
    categoryId: '' as string,
    fromAccountId: '',
    toAccountId: '',
  });

  const updateMutation = trpc.transaction.update.useMutation({
    onSuccess: () => { refetch(); setEditing(false); },
  });
  const deleteMutation = trpc.transaction.delete.useMutation({
    onSuccess: () => onDeleted(),
  });

  useEffect(() => {
    if (txn) {
      const fromPosting = txn.postings?.find((p) => parseFloat(p.amount) < 0);
      const toPosting = txn.postings?.find((p) => parseFloat(p.amount) > 0);
      setEditData({
        date: txn.date,
        narration: txn.narration,
        payee: txn.payee || '',
        amount: txn.amount,
        type: txn.type,
        categoryId: txn.categoryId || '',
        fromAccountId: fromPosting?.accountId || '',
        toAccountId: toPosting?.accountId || '',
      });
    }
  }, [txn]);

  if (!txn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  const handleSave = () => {
    const payload: Record<string, unknown> = { id: transactionId };
    if (editData.date !== txn.date) payload.date = editData.date;
    if (editData.narration !== txn.narration) payload.narration = editData.narration;
    if (editData.payee !== (txn.payee || '')) payload.payee = editData.payee || null;
    if (editData.amount !== txn.amount) payload.amount = parseFloat(editData.amount);
    if (editData.type !== txn.type) payload.type = editData.type;
    if (editData.categoryId !== (txn.categoryId || '')) payload.categoryId = editData.categoryId || null;

    const fromPosting = txn.postings?.find((p) => parseFloat(p.amount) < 0);
    const toPosting = txn.postings?.find((p) => parseFloat(p.amount) > 0);
    if (editData.fromAccountId !== (fromPosting?.accountId || '')) payload.fromAccountId = editData.fromAccountId;
    if (editData.toAccountId !== (toPosting?.accountId || '')) payload.toAccountId = editData.toAccountId;

    updateMutation.mutate(payload as any);
  };

  const handleDelete = () => {
    if (confirm('确定要删除这笔交易吗？此操作不可恢复。')) {
      deleteMutation.mutate({ id: transactionId });
    }
  };

  const getAccountName = (accountId: string) => {
    const acc = accounts?.find((a) => a.id === accountId);
    return acc?.displayName || accountId;
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId || !categories) return '未分类';
    for (const cat of categories) {
      if (cat.id === categoryId) return cat.name;
      const child = cat.children?.find((c) => c.id === categoryId);
      if (child) return `${cat.name}/${child.name}`;
    }
    return '未分类';
  };

  const typeLabels: Record<string, string> = {
    expense: '支出', income: '收入', transfer: '转账',
    reimbursement: '报销', borrow_in: '借入', borrow_out: '借出',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">交易详情</h1>
          {!editing ? (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 text-gray-400 hover:text-blue-600">
                <Pencil size={18} />
              </button>
              <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-500">
                <Trash2 size={18} />
              </button>
            </>
          ) : (
            <>
              <button onClick={handleSave} disabled={updateMutation.isPending} className="p-1.5 text-green-600 hover:text-green-700">
                <Save size={18} />
              </button>
              <button onClick={() => setEditing(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
          {/* 金额 */}
          <div className="px-4 py-3">
            <label className="text-xs text-gray-400">金额</label>
            {editing ? (
              <input
                type="number"
                step="0.01"
                value={editData.amount}
                onChange={(e) => setEditData({ ...editData, amount: e.target.value })}
                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-lg font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <p className={`text-2xl font-bold ${txn.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                {txn.type === 'income' ? '+' : '-'}¥{parseFloat(txn.amount).toFixed(2)}
              </p>
            )}
          </div>

          {/* 类型 */}
          <div className="px-4 py-3">
            <label className="text-xs text-gray-400">类型</label>
            {editing ? (
              <select
                value={editData.type}
                onChange={(e) => setEditData({ ...editData, type: e.target.value })}
                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {Object.entries(typeLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-800">{typeLabels[txn.type] || txn.type}</p>
            )}
          </div>

          {/* 日期 */}
          <div className="px-4 py-3">
            <label className="text-xs text-gray-400">日期</label>
            {editing ? (
              <input
                type="date"
                value={editData.date}
                onChange={(e) => setEditData({ ...editData, date: e.target.value })}
                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <p className="text-sm text-gray-800">{txn.date}</p>
            )}
          </div>

          {/* 描述 */}
          <div className="px-4 py-3">
            <label className="text-xs text-gray-400">描述</label>
            {editing ? (
              <input
                type="text"
                value={editData.narration}
                onChange={(e) => setEditData({ ...editData, narration: e.target.value })}
                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <p className="text-sm text-gray-800">{txn.narration}</p>
            )}
          </div>

          {/* 收款人 */}
          <div className="px-4 py-3">
            <label className="text-xs text-gray-400">收款人</label>
            {editing ? (
              <input
                type="text"
                value={editData.payee}
                onChange={(e) => setEditData({ ...editData, payee: e.target.value })}
                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="可选"
              />
            ) : (
              <p className="text-sm text-gray-800">{txn.payee || '-'}</p>
            )}
          </div>

          {/* 分类 */}
          <div className="px-4 py-3">
            <label className="text-xs text-gray-400">分类</label>
            {editing ? (
              <select
                value={editData.categoryId}
                onChange={(e) => setEditData({ ...editData, categoryId: e.target.value })}
                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">未分类</option>
                {categories?.map((cat) => (
                  <optgroup key={cat.id} label={cat.name}>
                    {cat.children?.map((child) => (
                      <option key={child.id} value={child.id}>{child.name}</option>
                    ))}
                    <option value={cat.id}>{cat.name}（整体）</option>
                  </optgroup>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-800">{getCategoryName(txn.categoryId)}</p>
            )}
          </div>

          {/* 账户 */}
          <div className="px-4 py-3">
            <label className="text-xs text-gray-400">付款账户</label>
            {editing ? (
              <select
                value={editData.fromAccountId}
                onChange={(e) => setEditData({ ...editData, fromAccountId: e.target.value })}
                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {accounts?.filter(a => !a.isClosed).map((a) => (
                  <option key={a.id} value={a.id}>{a.displayName}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-800">
                {getAccountName(txn.postings?.find(p => parseFloat(p.amount) < 0)?.accountId || '')}
              </p>
            )}
          </div>

          <div className="px-4 py-3">
            <label className="text-xs text-gray-400">收款账户</label>
            {editing ? (
              <select
                value={editData.toAccountId}
                onChange={(e) => setEditData({ ...editData, toAccountId: e.target.value })}
                className="w-full mt-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {accounts?.filter(a => !a.isClosed).map((a) => (
                  <option key={a.id} value={a.id}>{a.displayName}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-800">
                {getAccountName(txn.postings?.find(p => parseFloat(p.amount) > 0)?.accountId || '')}
              </p>
            )}
          </div>

          {/* 标签 */}
          {txn.tags && txn.tags.length > 0 && (
            <div className="px-4 py-3">
              <label className="text-xs text-gray-400">标签</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {txn.tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 元信息 */}
          <div className="px-4 py-3">
            <label className="text-xs text-gray-400">创建时间</label>
            <p className="text-xs text-gray-500">{new Date(txn.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

