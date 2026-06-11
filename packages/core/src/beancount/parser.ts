import type {
  BeancountFile,
  BeancountHeader,
  AccountDirective,
  TransactionDirective,
  Posting,
} from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_RE = /^(Assets|Liabilities|Income|Expenses|Equity)(:[A-Za-z0-9\u4e00-\u9fff_-]+)+$/;
const AMOUNT_RE = /^-?\d+(\.\d+)?$/;

/**
 * 解析 Beancount 文件内容为结构化数据
 */
export function parse(content: string): BeancountFile {
  const lines = content.split('\n');
  const header = parseHeader(lines);
  const accounts: AccountDirective[] = [];
  const transactions: TransactionDirective[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 跳过空行和纯注释
    if (!trimmed || (trimmed.startsWith(';') && !isHeaderComment(trimmed))) {
      i++;
      continue;
    }

    // option 行
    if (trimmed.startsWith('option ')) {
      i++;
      continue;
    }

    // 账户指令: 2024-01-01 open/close ...
    const accountMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(open|close)\s+(\S+)(.*)$/);
    if (accountMatch) {
      const [, date, action, account, rest] = accountMatch;
      const currencies: string[] = [];
      let comment: string | undefined;

      const parts = rest.trim().split(';');
      if (parts[0]) {
        currencies.push(...parts[0].trim().split(/\s+/).filter(Boolean));
      }
      if (parts[1]) {
        comment = parts[1].trim();
      }

      accounts.push({
        date,
        action: action as 'open' | 'close',
        account,
        currencies,
        comment,
      });
      i++;
      continue;
    }

    // 交易指令: 2024-01-01 * "payee" "narration" #tag
    const txnMatch = trimmed.match(
      /^(\d{4}-\d{2}-\d{2})\s+([*!])\s+(.*)$/
    );
    if (txnMatch) {
      const [, date, flag, rest] = txnMatch;
      const txn = parseTransaction(date, flag as '*' | '!', rest, lines, i);
      transactions.push(txn.directive);
      i = txn.nextLine;
      continue;
    }

    i++;
  }

  return { header, accounts, transactions };
}

function parseHeader(lines: string[]): BeancountHeader {
  let title = '';
  let currency = 'CNY';
  let version = 1;
  let lastModified = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('option "title"')) {
      const match = trimmed.match(/option\s+"title"\s+"(.+)"/);
      if (match) title = match[1];
    } else if (trimmed.startsWith('option "operating_currency"')) {
      const match = trimmed.match(/option\s+"operating_currency"\s+"(.+)"/);
      if (match) currency = match[1];
    } else if (trimmed.includes('Version:')) {
      const match = trimmed.match(/Version:\s*(\d+)/);
      if (match) version = parseInt(match[1], 10);
    } else if (trimmed.includes('Last Modified:')) {
      const match = trimmed.match(/Last Modified:\s*(.+)/);
      if (match) lastModified = match[1].trim();
    }
  }

  return { title, currency, version, lastModified };
}

function isHeaderComment(line: string): boolean {
  return line.includes('Version:') || line.includes('Last Modified:');
}

function parseTransaction(
  date: string,
  flag: '*' | '!',
  rest: string,
  lines: string[],
  startLine: number
): { directive: TransactionDirective; nextLine: number } {
  // 解析 payee, narration, tags
  let payee: string | undefined;
  let narration = '';
  const tags: string[] = [];

  // 提取 tags (#xxx)
  const tagMatches = rest.matchAll(/#([\w\u4e00-\u9fff]+)/g);
  for (const m of tagMatches) {
    tags.push(m[1]);
  }
  const withoutTags = rest.replace(/#[\w\u4e00-\u9fff]+/g, '').trim();

  // 解析 "payee" "narration" 或 "narration"
  const quoteMatches = [...withoutTags.matchAll(/"([^"]*)"/g)];
  if (quoteMatches.length >= 2) {
    payee = quoteMatches[0][1];
    narration = quoteMatches[1][1];
  } else if (quoteMatches.length === 1) {
    narration = quoteMatches[0][1];
  }

  // 解析 meta 和 postings
  const meta: Record<string, string> = {};
  const postings: Posting[] = [];
  let i = startLine + 1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行或下一个指令开头表示交易结束
    if (!trimmed || (DATE_RE.test(trimmed.substring(0, 10)) && !trimmed.startsWith(' '))) {
      break;
    }

    // meta 注释: ; key: value
    const metaMatch = trimmed.match(/^;\s*(\w+):\s*(.+)$/);
    if (metaMatch) {
      meta[metaMatch[1]] = metaMatch[2].trim();
      i++;
      continue;
    }

    // posting: Account  amount currency
    const postingMatch = trimmed.match(/^(\S+)\s+(-?\d+(?:\.\d+)?)\s+(\w+)$/);
    if (postingMatch) {
      postings.push({
        account: postingMatch[1],
        amount: parseFloat(postingMatch[2]),
        currency: postingMatch[3],
      });
      i++;
      continue;
    }

    // 无法识别的行，跳过
    i++;
  }

  return {
    directive: { date, flag, payee, narration, tags, meta, postings },
    nextLine: i,
  };
}
