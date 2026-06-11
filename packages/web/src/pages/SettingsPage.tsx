import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../lib/auth';
import { ArrowLeft, User, Lock, LogOut, Check } from 'lucide-react';

interface Props {
  onBack: () => void;
}

export function SettingsPage({ onBack }: Props) {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<'profile' | 'password'>('profile');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">设置</h1>
          <button
            onClick={() => { logout(); onBack(); }}
            className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600"
          >
            <LogOut size={16} /> 退出
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* Tab 切换 */}
        <div className="flex bg-white rounded-lg shadow overflow-hidden">
          <button
            onClick={() => setTab('profile')}
            className={`flex-1 py-2.5 text-sm font-medium text-center ${
              tab === 'profile' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'
            }`}
          >
            <User size={16} className="inline mr-1" /> 个人资料
          </button>
          <button
            onClick={() => setTab('password')}
            className={`flex-1 py-2.5 text-sm font-medium text-center ${
              tab === 'password' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'
            }`}
          >
            <Lock size={16} className="inline mr-1" /> 修改密码
          </button>
        </div>

        {tab === 'profile' ? (
          <ProfileSection username={user?.username || ''} currentDisplayName={user?.displayName || ''} />
        ) : (
          <PasswordSection />
        )}
      </main>
    </div>
  );
}

/* ========== 个人资料 ========== */
function ProfileSection({ username, currentDisplayName }: { username: string; currentDisplayName: string }) {
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [saved, setSaved] = useState(false);

  const updateMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: (data) => {
      // 更新 localStorage
      const stored = localStorage.getItem('user');
      if (stored && data) {
        const user = JSON.parse(stored);
        user.displayName = data.displayName;
        localStorage.setItem('user', JSON.stringify(user));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleSave = () => {
    if (!displayName.trim()) return;
    updateMutation.mutate({ displayName: displayName.trim() });
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      {/* 用户名（只读） */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">用户名</label>
        <div className="px-3 py-2 bg-gray-50 rounded text-sm text-gray-600">@{username}</div>
      </div>

      {/* 显示名称 */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">显示名称</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="输入显示名称"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={updateMutation.isPending || !displayName.trim() || displayName === currentDisplayName}
        className="w-full py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1"
      >
        {saved ? (<><Check size={16} /> 已保存</>) : updateMutation.isPending ? '保存中...' : '保存修改'}
      </button>

      {updateMutation.error && (
        <p className="text-xs text-red-500">{updateMutation.error.message}</p>
      )}
    </div>
  );
}

/* ========== 修改密码 ========== */
function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);

  const changeMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const handleSubmit = () => {
    if (newPassword !== confirmPassword) {
      alert('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      alert('新密码至少 6 个字符');
      return;
    }
    changeMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div>
        <label className="text-xs text-gray-400 block mb-1">当前密码</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="输入当前密码"
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">新密码</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="至少 6 个字符"
        />
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">确认新密码</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="再次输入新密码"
        />
      </div>

      {success && (
        <div className="flex items-center gap-1 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
          <Check size={16} /> 密码修改成功
        </div>
      )}

      {changeMutation.error && (
        <p className="text-xs text-red-500">{changeMutation.error.message}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={changeMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
        className="w-full py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
      >
        {changeMutation.isPending ? '修改中...' : '修改密码'}
      </button>
    </div>
  );
}
