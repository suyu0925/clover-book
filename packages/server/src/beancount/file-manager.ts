import { mkdir, readFile, writeFile, exists } from 'fs/promises';
import { join, dirname } from 'path';
import lockfile from 'proper-lockfile';
import { parse, serialize, serializeTransaction, serializeAccount } from '@clover-book/core';
import type { BeancountFile, TransactionDirective, AccountDirective } from '@clover-book/core';

/** 数据目录，存放所有 beancount 文件 */
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), '..', '..', 'data');

/** 获取文件的绝对路径 */
export function resolveFilePath(relativePath: string): string {
  return join(DATA_DIR, relativePath);
}

/** 确保目录存在 */
async function ensureDir(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
}

/**
 * 文件级写锁包装
 * 使用 proper-lockfile 确保同一时刻只有一个写操作
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>
): Promise<T> {
  await ensureDir(filePath);
  // 确保文件存在（lockfile 需要文件存在）
  if (!(await exists(filePath))) {
    await writeFile(filePath, '', 'utf-8');
  }
  const release = await lockfile.lock(filePath, {
    retries: { retries: 5, factor: 2, minTimeout: 100, maxTimeout: 2000 },
    stale: 30000,
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}

/**
 * 初始化账本的 Beancount 文件
 */
export async function initLedgerFile(
  relativePath: string,
  name: string,
  currency: string = 'CNY'
): Promise<void> {
  const absPath = resolveFilePath(relativePath);
  await ensureDir(absPath);

  const file: BeancountFile = {
    header: {
      title: name,
      currency,
      version: 1,
      lastModified: new Date().toISOString(),
    },
    accounts: [],
    transactions: [],
  };

  await writeFile(absPath, serialize(file), 'utf-8');
}

/**
 * 读取并解析 Beancount 文件
 */
export async function readLedgerFile(relativePath: string): Promise<BeancountFile> {
  const absPath = resolveFilePath(relativePath);
  const content = await readFile(absPath, 'utf-8');
  return parse(content);
}

/**
 * 追加交易到 Beancount 文件末尾
 */
export async function appendTransaction(
  relativePath: string,
  txn: TransactionDirective
): Promise<void> {
  const absPath = resolveFilePath(relativePath);

  await withFileLock(absPath, async () => {
    const content = await readFile(absPath, 'utf-8');
    const file = parse(content);

    // 更新版本号和修改时间
    file.header.version += 1;
    file.header.lastModified = new Date().toISOString();
    file.transactions.push(txn);

    await writeFile(absPath, serialize(file), 'utf-8');
  });
}

/**
 * 删除指定 ID 的交易（通过 meta.id 匹配）
 */
export async function removeTransaction(
  relativePath: string,
  transactionId: string
): Promise<void> {
  const absPath = resolveFilePath(relativePath);

  await withFileLock(absPath, async () => {
    const content = await readFile(absPath, 'utf-8');
    const file = parse(content);

    file.transactions = file.transactions.filter(
      (t) => t.meta['id'] !== transactionId
    );
    file.header.version += 1;
    file.header.lastModified = new Date().toISOString();

    await writeFile(absPath, serialize(file), 'utf-8');
  });
}

/**
 * 追加账户指令到 Beancount 文件
 */
export async function appendAccount(
  relativePath: string,
  account: AccountDirective
): Promise<void> {
  const absPath = resolveFilePath(relativePath);

  await withFileLock(absPath, async () => {
    const content = await readFile(absPath, 'utf-8');
    const file = parse(content);

    file.accounts.push(account);
    file.header.version += 1;
    file.header.lastModified = new Date().toISOString();

    await writeFile(absPath, serialize(file), 'utf-8');
  });
}

/**
 * 批量追加账户指令（创建账本时的默认账户）
 */
export async function appendAccounts(
  relativePath: string,
  accounts: AccountDirective[]
): Promise<void> {
  const absPath = resolveFilePath(relativePath);

  await withFileLock(absPath, async () => {
    const content = await readFile(absPath, 'utf-8');
    const file = parse(content);

    file.accounts.push(...accounts);
    file.header.version += 1;
    file.header.lastModified = new Date().toISOString();

    await writeFile(absPath, serialize(file), 'utf-8');
  });
}

/**
 * 关闭账户（追加 close 指令）
 */
export async function closeAccount(
  relativePath: string,
  accountName: string
): Promise<void> {
  const absPath = resolveFilePath(relativePath);

  await withFileLock(absPath, async () => {
    const content = await readFile(absPath, 'utf-8');
    const file = parse(content);

    const today = new Date().toISOString().slice(0, 10);
    file.accounts.push({
      date: today,
      action: 'close',
      account: accountName,
      currencies: [],
    });
    file.header.version += 1;
    file.header.lastModified = new Date().toISOString();

    await writeFile(absPath, serialize(file), 'utf-8');
  });
}
