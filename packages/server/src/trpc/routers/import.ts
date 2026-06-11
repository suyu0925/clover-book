import { router, protectedProcedure } from '../index';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../../db';
import { z } from 'zod';
import { appendTransaction } from '../../beancount/file-manager';

/** 检查用户是否有权访问账本 */
async function assertLedgerAccess(ledgerId: string, userId: string) {
  const member = await db.query.ledgerMembers.findFirst({
    where: and(
      eq(schema.ledgerMembers.ledgerId, ledgerId),
      eq(schema.ledgerMembers.userId, userId),
    ),
  });
  if (!member) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '无权访问此账本' });
  }
  return member;
}

/** 随手记 CSV 列映射 */
interface SuishoujiRow {
  '交易类型': string;
  '日期': string;
  '分类': string;
  '子分类': string;
  '账户1': string;
  '账户2': string;
  '金额': string;
  '成员': string;
  '商家': string;
  '备注': string;
  '标签': string;
}

/** 通用 CSV 行 */
const csvRowSchema = z.object({
  date: z.string(),
  type: z.enum(['expense', 'income', 'transfer']),
  amount: z.number().positive(),
  narration: z.string(),
  payee: z.string().optional(),
  categoryName: z.string().optional(),
  fromAccount: z.string().optional(),
  toAccount: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

type CsvRow = z.infer<typeof csvRowSchema>;

/** 解析 CSV 文本为行数组 */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

/** 解析 CSV 行（支持引号内逗号） */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/** 随手记 CSV 适配器 */
function adaptSuishouji(rows: Record<string, string>[]): CsvRow[] {
  return rows.map((row) => {
    const rawType = row['交易类型'] || row['类型'] || '';
    let type: 'expense' | 'income' | 'transfer' = 'expense';
    if (rawType.includes('收入')) type = 'income';
    else if (rawType.includes('转账')) type = 'transfer';

    const rawDate = row['日期'] || '';
    // 处理 "2024-01-15 12:00:00" 或 "2024/01/15" 格式
    const date = rawDate.slice(0, 10).replace(/\//g, '-');

    const amount = Math.abs(parseFloat(row['金额'] || '0'));
    const category = row['分类'] || '';
    const subCategory = row['子分类'] || '';
    const categoryName = subCategory ? `${category}/${subCategory}` : category;

    return {
      date,
      type,
      amount,
      narration: row['备注'] || row['摘要'] || categoryName || '导入交易',
      payee: row['商家'] || undefined,
      categoryName: categoryName || undefined,
      fromAccount: row['账户1'] || row['账户'] || undefined,
      toAccount: row['账户2'] || undefined,
      tags: row['标签'] ? row['标签'].split(/[,，]/).filter(Boolean) : undefined,
    };
  }).filter((r) => r.amount > 0 && r.date);
}

/** 通用 CSV 适配器（使用列映射） */
function adaptGeneric(rows: Record<string, string>[], mapping: Record<string, string>): CsvRow[] {
  return rows.map((row) => {
    const rawType = row[mapping.type] || 'expense';
    let type: 'expense' | 'income' | 'transfer' = 'expense';
    if (rawType.includes('收入') || rawType.toLowerCase().includes('income')) type = 'income';
    else if (rawType.includes('转账') || rawType.toLowerCase().includes('transfer')) type = 'transfer';

    const rawDate = row[mapping.date] || '';
    const date = rawDate.slice(0, 10).replace(/\//g, '-');
    const amount = Math.abs(parseFloat(row[mapping.amount] || '0'));

    return {
      date,
      type,
      amount,
      narration: row[mapping.narration] || row[mapping.category] || '导入交易',
      payee: mapping.payee ? row[mapping.payee] : undefined,
      categoryName: mapping.category ? row[mapping.category] : undefined,
      fromAccount: mapping.fromAccount ? row[mapping.fromAccount] : undefined,
      toAccount: mapping.toAccount ? row[mapping.toAccount] : undefined,
    };
  }).filter((r) => r.amount > 0 && r.date);
}

const importRouter = router({
  /** 预览：解析 CSV 并返回预处理结果 */
  preview: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    csvText: z.string(),
    adapter: z.enum(['suishouji', 'generic']).default('generic'),
    mapping: z.record(z.string()).optional(),
  })).mutation(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const rawRows = parseCSV(input.csvText);
    if (rawRows.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'CSV 文件为空或格式错误' });
    }

    // 返回列名用于前端映射
    const headers = Object.keys(rawRows[0]);

    let rows: CsvRow[];
    if (input.adapter === 'suishouji') {
      rows = adaptSuishouji(rawRows);
    } else {
      if (!input.mapping || !input.mapping.date || !input.mapping.amount) {
        // 只返回 headers 让前端做映射
        return { headers, rows: [], total: rawRows.length, needMapping: true };
      }
      rows = adaptGeneric(rawRows, input.mapping);
    }

    return { headers, rows: rows.slice(0, 50), total: rows.length, needMapping: false };
  }),

  /** 执行导入：批量创建交易 */
  execute: protectedProcedure.input(z.object({
    ledgerId: z.string().uuid(),
    csvText: z.string(),
    adapter: z.enum(['suishouji', 'generic']).default('generic'),
    mapping: z.record(z.string()).optional(),
    defaultFromAccountId: z.string().uuid(),
    defaultToAccountId: z.string().uuid(),
  })).mutation(async ({ input, ctx }) => {
    await assertLedgerAccess(input.ledgerId, ctx.user.id);

    const rawRows = parseCSV(input.csvText);
    let rows: CsvRow[];
    if (input.adapter === 'suishouji') {
      rows = adaptSuishouji(rawRows);
    } else {
      if (!input.mapping) throw new TRPCError({ code: 'BAD_REQUEST', message: '缺少列映射' });
      rows = adaptGeneric(rawRows, input.mapping);
    }

    // 查询账本信息和账户
    const ledger = await db.query.ledgers.findFirst({
      where: eq(schema.ledgers.id, input.ledgerId),
    });
    const accounts = await db.query.accounts.findMany({
      where: eq(schema.accounts.ledgerId, input.ledgerId),
    });
    const accountMap = new Map(accounts.map((a) => [a.displayName, a.id]));
    accountMap.set(accounts.find(a => a.id === input.defaultFromAccountId)?.displayName || '', input.defaultFromAccountId);

    const fromAcc = accounts.find(a => a.id === input.defaultFromAccountId);
    const toAcc = accounts.find(a => a.id === input.defaultToAccountId);

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        // 尝试匹配账户
        const fromAccountId = (row.fromAccount && accountMap.get(row.fromAccount)) || input.defaultFromAccountId;
        const toAccountId = (row.toAccount && accountMap.get(row.toAccount)) || input.defaultToAccountId;

        const [txn] = await db.insert(schema.transactions).values({
          ledgerId: input.ledgerId,
          date: row.date,
          type: row.type,
          amount: row.amount.toString(),
          payee: row.payee || null,
          narration: row.narration,
          createdBy: ctx.user.id,
        }).returning();

        await db.insert(schema.postings).values([
          { transactionId: txn.id, accountId: fromAccountId, amount: (-row.amount).toString(), currency: 'CNY' },
          { transactionId: txn.id, accountId: toAccountId, amount: row.amount.toString(), currency: 'CNY' },
        ]);

        if (row.tags && row.tags.length > 0) {
          await db.insert(schema.transactionTags).values(
            row.tags.map((tag) => ({ transactionId: txn.id, tag })),
          );
        }

        // 同步到 Beancount
        if (ledger) {
          await appendTransaction(ledger.filePath, {
            date: row.date,
            flag: '*',
            payee: row.payee,
            narration: row.narration,
            tags: row.tags || [],
            meta: { id: txn.id, created_by: ctx.user.id, source: 'import' },
            postings: [
              { account: fromAcc?.name || 'Unknown', amount: -row.amount, currency: 'CNY' },
              { account: toAcc?.name || 'Unknown', amount: row.amount, currency: 'CNY' },
            ],
          });
        }

        imported++;
      } catch {
        skipped++;
      }
    }

    return { imported, skipped, total: rows.length };
  }),
});

export { importRouter };
