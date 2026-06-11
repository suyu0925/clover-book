import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { ArrowLeft, Plus, ChevronRight, Trash2 } from 'lucide-react';

interface Props {
  ledgerId: string;
  onBack: () => void;
}

export function CategoryPage({ ledgerId, onBack }: Props) {
  const { data: categories, refetch } = trpc.category.list.useQuery({ ledgerId });
  const [showAdd, setShowAdd] = useState(false);
  const [addParentId, setAddParentId] = useState<string | undefined>();
  const [newName, setNewName] = useState('');

  const createMutation = trpc.category.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setNewName(''); },
  });
  const deleteMutation = trpc.category.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ ledgerId, name: newName.trim(), parentId: addParentId });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">分类管理</h1>
          <button
            onClick={() => { setAddParentId(undefined); setShowAdd(true); }}
            className="p-1.5 text-green-600 hover:text-green-700"
          >
            <Plus size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        {/* 添加分类表单 */}
        {showAdd && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg shadow p-4 mb-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-500">
              {addParentId ? '添加子分类' : '添加一级分类'}
            </h3>
            <input
              type="text"
              placeholder="分类名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                添加
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

        {/* 分类树 */}
        <div className="space-y-2">
          {categories?.length === 0 && (
            <p className="text-center text-gray-400 py-8">暂无分类</p>
          )}
          {categories?.map((cat) => (
            <div key={cat.id} className="bg-white rounded-lg shadow overflow-hidden">
              {/* 一级分类 */}
              <div className="flex items-center px-4 py-3">
                <span className="flex-1 font-medium">{cat.name}</span>
                <button
                  onClick={() => { setAddParentId(cat.id); setShowAdd(true); }}
                  className="p-1 text-gray-400 hover:text-green-600 mr-1"
                  title="添加子分类"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={() => { if (confirm(`确定删除「${cat.name}」及其子分类？`)) deleteMutation.mutate({ id: cat.id }); }}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* 二级分类 */}
              {cat.children && cat.children.length > 0 && (
                <div className="border-t border-gray-100">
                  {cat.children.map((child) => (
                    <div key={child.id} className="flex items-center px-4 py-2 pl-8 hover:bg-gray-50">
                      <ChevronRight size={14} className="text-gray-300 mr-2" />
                      <span className="flex-1 text-sm text-gray-700">{child.name}</span>
                      <button
                        onClick={() => { if (confirm(`确定删除「${child.name}」？`)) deleteMutation.mutate({ id: child.id }); }}
                        className="p-1 text-gray-300 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
