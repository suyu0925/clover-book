import { useState, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { ArrowLeft, Upload, FileText, Check } from 'lucide-react';

interface Props {
  ledgerId: string;
  onBack: () => void;
}

export function ImportPage({ ledgerId, onBack }: Props) {
  const { data: accounts } = trpc.account.list.useQuery({ ledgerId });
  const fileRef = useRef<HTMLInputElement>(null);

  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [adapter, setAdapter] = useState<'suishouji' | 'generic'>('generic');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultFromAccountId, setDefaultFromAccountId] = useState('');
  const [defaultToAccountId, setDefaultToAccountId] = useState('');
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'done'>('upload');

  const previewMutation = trpc.import.preview.useMutation();
  const executeMutation = trpc.import.execute.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      // 自动检测随手记格式
      if (text.includes('交易类型') && text.includes('子分类')) {
        setAdapter('suishouji');
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handlePreview = () => {
    if (!csvText) return;
    previewMutation.mutate(
      { ledgerId, csvText, adapter, mapping: adapter === 'generic' ? mapping : undefined },
      {
        onSuccess: (data) => {
          if (data.needMapping) {
            setStep('mapping');
          } else {
            setStep('preview');
          }
        },
      }
    );
  };

  const handleExecute = () => {
    if (!defaultFromAccountId || !defaultToAccountId) return;
    executeMutation.mutate(
      { ledgerId, csvText, adapter, mapping: adapter === 'generic' ? mapping : undefined, defaultFromAccountId, defaultToAccountId },
      { onSuccess: () => setStep('done') }
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">数据导入</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {step === 'upload' && (
          <div className="space-y-4">
            {/* 文件选择 */}
            <div
              className="bg-white rounded-lg shadow p-6 border-2 border-dashed border-gray-200 text-center cursor-pointer hover:border-green-400 transition"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">
                {fileName ? <span className="text-green-600 font-medium">{fileName}</span> : '点击选择 CSV 文件'}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* 适配器选择 */}
            {csvText && (
              <>
                <div className="bg-white rounded-lg shadow p-4 space-y-3">
                  <h3 className="text-sm font-medium text-gray-500">数据格式</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAdapter('suishouji')}
                      className={`flex-1 py-2 rounded text-sm font-medium transition ${
                        adapter === 'suishouji' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-50 text-gray-500'
                      }`}
                    >
                      随手记
                    </button>
                    <button
                      onClick={() => setAdapter('generic')}
                      className={`flex-1 py-2 rounded text-sm font-medium transition ${
                        adapter === 'generic' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-50 text-gray-500'
                      }`}
                    >
                      通用 CSV
                    </button>
                  </div>
                </div>

                {/* 默认账户 */}
                <div className="bg-white rounded-lg shadow p-4 space-y-3">
                  <h3 className="text-sm font-medium text-gray-500">默认账户</h3>
                  <select
                    value={defaultFromAccountId}
                    onChange={(e) => setDefaultFromAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">默认付款账户</option>
                    {accounts?.filter(a => !a.isClosed).map((a) => (
                      <option key={a.id} value={a.id}>{a.displayName}</option>
                    ))}
                  </select>
                  <select
                    value={defaultToAccountId}
                    onChange={(e) => setDefaultToAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">默认收款账户</option>
                    {accounts?.filter(a => !a.isClosed).map((a) => (
                      <option key={a.id} value={a.id}>{a.displayName}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handlePreview}
                  disabled={previewMutation.isPending || !defaultFromAccountId || !defaultToAccountId}
                  className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {previewMutation.isPending ? '解析中...' : '预览数据'}
                </button>
              </>
            )}
          </div>
        )}

        {step === 'mapping' && previewMutation.data && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-500">列映射 (检测到 {previewMutation.data.total} 行)</h3>
              <p className="text-xs text-gray-400">请将 CSV 列映射到对应字段</p>

              {(['date', 'amount', 'narration', 'type', 'payee', 'category'] as const).map((field) => (
                <div key={field} className="flex items-center gap-2">
                  <label className="w-20 text-xs text-gray-500 text-right">
                    {{date: '日期*', amount: '金额*', narration: '描述*', type: '类型', payee: '收款人', category: '分类'}[field]}
                  </label>
                  <select
                    value={mapping[field] || ''}
                    onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">-- 选择列 --</option>
                    {previewMutation.data.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              onClick={handlePreview}
              disabled={!mapping.date || !mapping.amount || !mapping.narration}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              确认映射并预览
            </button>
          </div>
        )}

        {step === 'preview' && previewMutation.data && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-green-600" />
                <span className="text-sm font-medium">预览 (共 {previewMutation.data.total} 条)</span>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {previewMutation.data.rows.map((row, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{row.narration}</p>
                      <p className="text-xs text-gray-400">{row.date} · {row.type === 'income' ? '收入' : row.type === 'transfer' ? '转账' : '支出'}</p>
                    </div>
                    <span className={`text-sm font-medium ${row.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                      ¥{row.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleExecute}
              disabled={executeMutation.isPending}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {executeMutation.isPending ? '导入中...' : `确认导入 ${previewMutation.data.total} 条记录`}
            </button>
            <button
              onClick={() => setStep('upload')}
              className="w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              返回修改
            </button>
          </div>
        )}

        {step === 'done' && executeMutation.data && (
          <div className="bg-white rounded-lg shadow p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check size={24} className="text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">导入完成</h3>
            <p className="text-sm text-gray-500">
              成功导入 <span className="font-medium text-green-600">{executeMutation.data.imported}</span> 条
              {executeMutation.data.skipped > 0 && (
                <>，跳过 <span className="text-amber-500">{executeMutation.data.skipped}</span> 条</>
              )}
            </p>
            <button
              onClick={onBack}
              className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              返回
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
