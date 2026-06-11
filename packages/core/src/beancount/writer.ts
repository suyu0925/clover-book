import type {
  BeancountFile,
  AccountDirective,
  TransactionDirective,
} from './types';

/**
 * 将结构化数据序列化为 Beancount 格式文本
 */
export function serialize(file: BeancountFile): string {
  const lines: string[] = [];

  // 文件头
  lines.push(`; Clover Book Ledger: ${file.header.title}`);
  lines.push(`; Version: ${file.header.version}`);
  lines.push(`; Last Modified: ${file.header.lastModified}`);
  lines.push('');
  lines.push(`option "title" "${file.header.title}"`);
  lines.push(`option "operating_currency" "${file.header.currency}"`);
  lines.push('');

  // 账户定义
  if (file.accounts.length > 0) {
    lines.push('; === 账户定义 ===');
    for (const acc of file.accounts) {
      lines.push(serializeAccount(acc));
    }
    lines.push('');
  }

  // 交易记录
  if (file.transactions.length > 0) {
    lines.push('; === 交易记录 ===');
    for (const txn of file.transactions) {
      lines.push(serializeTransaction(txn));
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 序列化单个交易为 Beancount 文本块
 */
export function serializeTransaction(txn: TransactionDirective): string {
  const lines: string[] = [];

  // 交易头: date flag "payee" "narration" #tags
  let header = `${txn.date} ${txn.flag}`;
  if (txn.payee) {
    header += ` "${txn.payee}" "${txn.narration}"`;
  } else {
    header += ` "${txn.narration}"`;
  }
  for (const tag of txn.tags) {
    header += ` #${tag}`;
  }
  lines.push(header);

  // 元数据
  for (const [key, value] of Object.entries(txn.meta)) {
    lines.push(`  ; ${key}: ${value}`);
  }

  // 分录
  for (const posting of txn.postings) {
    const amountStr = posting.amount.toFixed(2);
    lines.push(`  ${posting.account.padEnd(40)} ${amountStr.padStart(10)} ${posting.currency}`);
  }

  return lines.join('\n');
}

/**
 * 序列化账户指令
 */
export function serializeAccount(acc: AccountDirective): string {
  let line = `${acc.date} ${acc.action} ${acc.account}`;
  if (acc.currencies.length > 0) {
    line += ` ${acc.currencies.join(' ')}`;
  }
  if (acc.comment) {
    line += ` ; ${acc.comment}`;
  }
  return line;
}
