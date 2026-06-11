import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../lib/auth';
import { ArrowLeft, UserPlus, UserMinus, Crown, Users } from 'lucide-react';

interface Props {
  ledgerId: string;
  onBack: () => void;
}

export function MemberPage({ ledgerId, onBack }: Props) {
  const { user } = useAuth();
  const { data: members, refetch } = trpc.member.list.useQuery({ ledgerId });
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');

  const inviteMutation = trpc.member.invite.useMutation({
    onSuccess: () => { refetch(); setShowInvite(false); setInviteUsername(''); },
  });
  const removeMutation = trpc.member.remove.useMutation({ onSuccess: () => refetch() });
  const transferMutation = trpc.member.transferOwnership.useMutation({ onSuccess: () => refetch() });

  const isOwner = members?.some(m => m.userId === user?.id && m.role === 'owner');

  const handleInvite = () => {
    if (!inviteUsername.trim()) return;
    inviteMutation.mutate({ ledgerId, username: inviteUsername.trim() });
  };

  const handleRemove = (userId: string, displayName: string) => {
    if (confirm(`确定移除成员 "${displayName}"？`)) {
      removeMutation.mutate({ ledgerId, userId });
    }
  };

  const handleTransfer = (userId: string, displayName: string) => {
    if (confirm(`确定将账本所有权转让给 "${displayName}"？此操作不可撤销。`)) {
      transferMutation.mutate({ ledgerId, newOwnerId: userId });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">成员管理</h1>
          {isOwner && (
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="p-1.5 text-green-600 hover:text-green-700"
              title="邀请成员"
            >
              <UserPlus size={20} />
            </button>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* 邀请表单 */}
        {showInvite && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">邀请新成员</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="输入用户名"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              />
              <button
                onClick={handleInvite}
                disabled={inviteMutation.isPending || !inviteUsername.trim()}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {inviteMutation.isPending ? '邀请中...' : '邀请'}
              </button>
            </div>
            {inviteMutation.error && (
              <p className="text-xs text-red-500 mt-2">{inviteMutation.error.message}</p>
            )}
          </div>
        )}

        {/* 成员列表 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Users size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              成员列表 ({members?.length || 0})
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {members?.map((m) => (
              <div key={m.id} className="px-4 py-3 flex items-center gap-3">
                {/* 头像 */}
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-medium text-sm">
                  {m.displayName.slice(0, 2)}
                </div>
                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{m.displayName}</span>
                    {m.role === 'owner' && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 text-xs rounded">
                        <Crown size={10} /> 创建者
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">@{m.username}</p>
                </div>
                {/* 操作 */}
                {isOwner && m.userId !== user?.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleTransfer(m.userId, m.displayName)}
                      className="p-1.5 text-gray-300 hover:text-amber-500"
                      title="转让所有权"
                    >
                      <Crown size={16} />
                    </button>
                    <button
                      onClick={() => handleRemove(m.userId, m.displayName)}
                      className="p-1.5 text-gray-300 hover:text-red-500"
                      title="移除成员"
                    >
                      <UserMinus size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {!isOwner && (
          <p className="text-xs text-gray-400 text-center">仅账本创建者可邀请或移除成员</p>
        )}
      </main>
    </div>
  );
}
