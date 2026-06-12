/// <reference types="@types/bun" />
/**
 * 随手记数据导入集成测试
 *
 * 测试目标：
 *   1. 模拟随手记 CSV 数据的两批次增量导入
 *   2. 验证每次导入是追加行为，不覆盖已有数据
 *   3. 覆盖支出、收入、标签等典型字段解析
 *
 * 运行方式：
 *   # 确保服务已启动（本地开发或 Docker）
 *   bun test packages/server/tests/suishouji-import.test.ts
 *
 *   # 指定自定义服务地址
 *   TEST_BASE_URL=http://localhost:3000 bun test packages/server/tests/suishouji-import.test.ts
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { join } from 'path';

// ─── 配置 ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

// 使用时间戳使每次运行的用户名唯一，避免重复注册冲突
const TIMESTAMP = Date.now();
const TEST_USER = {
  username: `test_import_${TIMESTAMP}`,
  password: 'Test@123456',
  displayName: '导入测试用户',
};

// ─── tRPC HTTP 客户端 ─────────────────────────────────────────────────────────

/**
 * 发起 tRPC 请求（兼容 batch 格式）
 * @param path   tRPC 路径，如 "auth.login"
 * @param input  请求参数
 * @param token  可选 Bearer token
 * @param method GET（query）或 POST（mutation，默认）
 */
async function rpc<T = unknown>(
  path: string,
  input: unknown,
  token?: string,
  method: 'GET' | 'POST' = 'POST',
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let url = `${BASE_URL}/trpc/${path}?batch=1`;
  let body: string | undefined;

  if (method === 'GET') {
    url += `&input=${encodeURIComponent(JSON.stringify({ '0': { json: input } }))}`;
  } else {
    body = JSON.stringify({ '0': { json: input } });
  }

  const res = await fetch(url, { method, headers, body });
  const data = (await res.json()) as Array<{
    result?: { data?: { json: T } };
    error?: { message: string; data?: { code: string } };
  }>;

  if (!res.ok || data[0]?.error) {
    const err = data[0]?.error;
    throw new Error(`[${err?.data?.code ?? res.status}] ${err?.message ?? 'Unknown error'} (${path})`);
  }

  return data[0]!.result!.data!.json;
}

// ─── 测试状态 ─────────────────────────────────────────────────────────────────

let token = '';
let ledgerId = '';
let fromAccountId = '';
let toAccountId = '';

// ─── 准备阶段 ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. 注册测试用户
  await rpc('auth.register', TEST_USER);

  // 2. 登录获取 token
  const loginRes = await rpc<{ accessToken: string }>('auth.login', {
    username: TEST_USER.username,
    password: TEST_USER.password,
  });
  token = loginRes.accessToken;

  // 3. 创建测试账本
  const ledger = await rpc<{ id: string }>('ledger.create', {
    name: '随手记导入测试账本',
    description: '用于随手记增量导入测试',
  }, token);
  ledgerId = ledger.id;

  // 4. 创建账户：付款账户（资产）
  const fromAccount = await rpc<{ id: string }>('account.create', {
    ledgerId,
    name: 'Assets:Bank:CMB',
    displayName: '招商银行储蓄卡',
    type: 'assets',
    currency: 'CNY',
    openingDate: '2024-01-01',
  }, token);
  fromAccountId = fromAccount.id;

  // 5. 创建账户：收款账户（支出汇总）
  const toAccount = await rpc<{ id: string }>('account.create', {
    ledgerId,
    name: 'Expenses:General',
    displayName: '日常支出',
    type: 'expenses',
    currency: 'CNY',
    openingDate: '2024-01-01',
  }, token);
  toAccountId = toAccount.id;
});

// ─── 辅助：读取 fixture CSV ───────────────────────────────────────────────────

function readFixture(filename: string): string {
  const path = join(import.meta.dir, 'fixtures', filename);
  return Bun.file(path).text() as unknown as string;
}

// ─── 测试套件 ─────────────────────────────────────────────────────────────────

describe('随手记数据导入', () => {

  // ── 1. CSV 解析预览 ──────────────────────────────────────────────────────────

  describe('CSV 解析', () => {
    test('能正确解析随手记 batch1 CSV（6 条有效记录）', async () => {
      const csvText = await readFixture('suishouji-batch1.csv');
      const result = await rpc<{
        total: number;
        rows: Array<{ type: string; amount: number; narration: string; date: string }>;
        needMapping: boolean;
      }>('import.preview', {
        ledgerId,
        csvText,
        adapter: 'suishouji',
        defaultFromAccountId: fromAccountId,
        defaultToAccountId: toAccountId,
      }, token);

      expect(result.needMapping).toBe(false);
      expect(result.total).toBe(6);

      // 验证第一条：早饭支出
      const first = result.rows[0];
      expect(first.type).toBe('expense');
      expect(first.date).toBe('2024-01-05');
      expect(first.narration).toBe('早饭');
      expect(Number(first.amount)).toBeCloseTo(12.00);

      // 验证收入解析
      const income = result.rows.find(r => r.type === 'income');
      expect(income).toBeDefined();
      expect(income!.narration).toBe('一月工资');
      expect(Number(income!.amount)).toBeCloseTo(12000);
    });

    test('能正确解析随手记 batch2 CSV（4 条有效记录）', async () => {
      const csvText = await readFixture('suishouji-batch2.csv');
      const result = await rpc<{ total: number }>('import.preview', {
        ledgerId,
        csvText,
        adapter: 'suishouji',
        defaultFromAccountId: fromAccountId,
        defaultToAccountId: toAccountId,
      }, token);

      expect(result.total).toBe(4);
    });
  });

  // ── 2. 第一批次导入 ──────────────────────────────────────────────────────────

  describe('第一批次导入（2024年1月，6条）', () => {
    test('成功导入 batch1，返回 imported=6, skipped=0', async () => {
      const csvText = await readFixture('suishouji-batch1.csv');
      const result = await rpc<{ imported: number; skipped: number; total: number }>(
        'import.execute',
        {
          ledgerId,
          csvText,
          adapter: 'suishouji',
          defaultFromAccountId: fromAccountId,
          defaultToAccountId: toAccountId,
        },
        token,
      );

      expect(result.total).toBe(6);
      expect(result.imported).toBe(6);
      expect(result.skipped).toBe(0);
    });

    test('导入后账本中有 6 条交易', async () => {
      const result = await rpc<{ items: unknown[] }>(
        'transaction.list',
        { ledgerId, limit: 50, offset: 0 },
        token,
        'GET',
      );
      expect(result.items.length).toBe(6);
    });
  });

  // ── 3. 第二批次增量导入 ──────────────────────────────────────────────────────

  describe('第二批次增量导入（2024年2月，4条）', () => {
    test('成功导入 batch2，返回 imported=4, skipped=0', async () => {
      const csvText = await readFixture('suishouji-batch2.csv');
      const result = await rpc<{ imported: number; skipped: number; total: number }>(
        'import.execute',
        {
          ledgerId,
          csvText,
          adapter: 'suishouji',
          defaultFromAccountId: fromAccountId,
          defaultToAccountId: toAccountId,
        },
        token,
      );

      expect(result.total).toBe(4);
      expect(result.imported).toBe(4);
      expect(result.skipped).toBe(0);
    });

    test('【增量验证】两次导入后共有 10 条交易，原有数据未被覆盖', async () => {
      const result = await rpc<{ items: Array<{ date: string; narration: string }> }>(
        'transaction.list',
        { ledgerId, limit: 50, offset: 0 },
        token,
        'GET',
      );

      // 总数 = batch1(6) + batch2(4) = 10
      expect(result.items.length).toBe(10);

      // 验证 batch1 中的交易依然存在（增量，不覆盖）
      const narrations = result.items.map(t => t.narration);
      expect(narrations).toContain('早饭');        // batch1 特有
      expect(narrations).toContain('工作餐');      // batch1 特有
      expect(narrations).toContain('一月工资');    // batch1 特有

      // 验证 batch2 中的交易也存在
      expect(narrations).toContain('午饭');        // batch2 特有
      expect(narrations).toContain('买药');        // batch2 特有
      expect(narrations).toContain('二月工资');    // batch2 特有
    });

    test('两批次日期范围不重叠：1月有 6 条，2月有 4 条', async () => {
      const result = await rpc<{ items: Array<{ date: string }> }>(
        'transaction.list',
        { ledgerId, limit: 50, offset: 0 },
        token,
        'GET',
      );

      const janItems = result.items.filter(t => t.date.startsWith('2024-01'));
      const febItems = result.items.filter(t => t.date.startsWith('2024-02'));

      expect(janItems).toHaveLength(6);
      expect(febItems).toHaveLength(4);
    });
  });

  // ── 4. 重复导入幂等性 ────────────────────────────────────────────────────────

  describe('重复导入行为（不去重，数据会叠加）', () => {
    test('再次导入 batch1，总数变为 16（当前实现不去重，属预期行为）', async () => {
      const csvText = await readFixture('suishouji-batch1.csv');
      const result = await rpc<{ imported: number }>(
        'import.execute',
        {
          ledgerId,
          csvText,
          adapter: 'suishouji',
          defaultFromAccountId: fromAccountId,
          defaultToAccountId: toAccountId,
        },
        token,
      );

      expect(result.imported).toBe(6);

      const listResult = await rpc<{ items: unknown[] }>(
        'transaction.list',
        { ledgerId, limit: 50, offset: 0 },
        token,
        'GET',
      );

      // 10 + 6 = 16，说明导入是追加而非覆盖/去重
      expect(listResult.items.length).toBe(16);

      console.info(
        '\n⚠️  注意：当前导入不做去重，重复导入同一 CSV 会追加数据。' +
        '\n     如需幂等性，可在导入时加上 (ledgerId + date + amount + narration) 唯一约束。'
      );
    });
  });

  // ── 5. 字段映射验证 ──────────────────────────────────────────────────────────

  describe('字段解析细节', () => {
    test('标签字段被正确解析（含逗号分隔）', async () => {
      // 预览时验证 tags 是否被正确拆分
      const csvText = await readFixture('suishouji-batch1.csv');
      const result = await rpc<{
        rows: Array<{ tags?: string[]; narration: string }>;
      }>('import.preview', {
        ledgerId,
        csvText,
        adapter: 'suishouji',
        defaultFromAccountId: fromAccountId,
        defaultToAccountId: toAccountId,
      }, token);

      // "工作" 标签在工作餐那条
      const mealRow = result.rows.find(r => r.narration === '工作餐');
      expect(mealRow?.tags).toEqual(['工作']);

      // 无标签的行 tags 应为 undefined 或空数组
      const subwayRow = result.rows.find(r => r.narration === '地铁通勤');
      expect(subwayRow?.tags ?? []).toHaveLength(0);
    });

    test('商家字段被映射为 payee', async () => {
      const csvText = await readFixture('suishouji-batch1.csv');
      const result = await rpc<{
        rows: Array<{ payee?: string; narration: string }>;
      }>('import.preview', {
        ledgerId,
        csvText,
        adapter: 'suishouji',
        defaultFromAccountId: fromAccountId,
        defaultToAccountId: toAccountId,
      }, token);

      const movieRow = result.rows.find(r => r.narration === '周末观影');
      expect(movieRow?.payee).toBe('万达影城');
    });
  });
});
