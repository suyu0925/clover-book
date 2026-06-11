import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { ArrowLeft } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';

interface Props {
  ledgerId: string;
  onBack: () => void;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function StatsPage({ ledgerId, onBack }: Props) {
  const [tab, setTab] = useState<'overview' | 'category' | 'trend'>('overview');
  const [dateRange] = useState(getMonthRange);

  // 收支汇总
  const { data: summary } = trpc.stats.summary.useQuery({
    ledgerId,
    ...dateRange,
  });

  // 分类统计
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const { data: categoryData } = trpc.stats.byCategory.useQuery({
    ledgerId,
    ...dateRange,
    type: categoryType,
  });

  // 月度趋势
  const { data: trendData } = trpc.stats.monthlyTrend.useQuery({
    ledgerId,
    months: 6,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold flex-1">报表统计</h1>
        </div>
        {/* Tabs */}
        <div className="max-w-md mx-auto px-4 flex border-b border-gray-200">
          {([
            ['overview', '概览'],
            ['category', '分类'],
            ['trend', '趋势'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition ${
                tab === key ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        {tab === 'overview' && summary && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm text-gray-500 mb-3">本月收支概览</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-400">收入</p>
                  <p className="text-lg font-bold text-green-600">
                    {summary.totalIncome.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">支出</p>
                  <p className="text-lg font-bold text-red-500">
                    {summary.totalExpense.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">结余</p>
                  <p className={`text-lg font-bold ${summary.netIncome >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {summary.netIncome.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* 迷你趋势图 */}
            {trendData && trendData.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="text-sm text-gray-500 mb-3">近6个月趋势</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="income" stroke="#10b981" name="收入" strokeWidth={2} />
                    <Line type="monotone" dataKey="expense" stroke="#ef4444" name="支出" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {tab === 'category' && (
          <div className="space-y-4">
            {/* 收入/支出切换 */}
            <div className="flex bg-white rounded-lg shadow p-1">
              <button
                onClick={() => setCategoryType('expense')}
                className={`flex-1 py-2 rounded text-sm font-medium transition ${
                  categoryType === 'expense' ? 'bg-red-50 text-red-600' : 'text-gray-500'
                }`}
              >
                支出
              </button>
              <button
                onClick={() => setCategoryType('income')}
                className={`flex-1 py-2 rounded text-sm font-medium transition ${
                  categoryType === 'income' ? 'bg-green-50 text-green-600' : 'text-gray-500'
                }`}
              >
                收入
              </button>
            </div>

            {/* 饼图 */}
            {categoryData && categoryData.length > 0 ? (
              <div className="bg-white rounded-lg shadow p-4">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(props: PieLabelRenderProps) => `${props.name || ''} ${((Number(props.percent) || 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {categoryData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: unknown) => `¥${Number(value).toFixed(2)}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>

                {/* 明细列表 */}
                <div className="mt-4 space-y-2">
                  {categoryData.map((item, idx) => (
                    <div key={item.categoryId || 'none'} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="flex-1 text-sm text-gray-700">{item.name}</span>
                      <span className="text-sm font-medium">¥{item.total.toFixed(2)}</span>
                      <span className="text-xs text-gray-400">{item.count}笔</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8">暂无数据</p>
            )}
          </div>
        )}

        {tab === 'trend' && (
          <div className="space-y-4">
            {trendData && trendData.length > 0 ? (
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="text-sm text-gray-500 mb-3">月度收支趋势</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: unknown) => `¥${Number(value).toFixed(2)}`} />
                    <Legend />
                    <Line type="monotone" dataKey="income" stroke="#10b981" name="收入" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="expense" stroke="#ef4444" name="支出" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>

                {/* 月度数据表 */}
                <div className="mt-4 divide-y divide-gray-100">
                  {[...trendData].reverse().map((m) => (
                    <div key={m.month} className="flex items-center py-2 text-sm">
                      <span className="w-20 text-gray-500">{m.month}</span>
                      <span className="flex-1 text-green-600">+{m.income.toFixed(0)}</span>
                      <span className="flex-1 text-red-500">-{m.expense.toFixed(0)}</span>
                      <span className={`font-medium ${m.income - m.expense >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {(m.income - m.expense).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8">暂无数据</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
