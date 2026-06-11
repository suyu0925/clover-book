// === Beancount AST Types ===

export interface BeancountFile {
  header: BeancountHeader;
  accounts: AccountDirective[];
  transactions: TransactionDirective[];
}

export interface BeancountHeader {
  title: string;
  currency: string;
  version: number;
  lastModified: string;
}

export interface AccountDirective {
  date: string;
  action: 'open' | 'close';
  account: string;
  currencies: string[];
  comment?: string;
}

export interface TransactionDirective {
  date: string;
  flag: '*' | '!';
  payee?: string;
  narration: string;
  tags: string[];
  meta: Record<string, string>;
  postings: Posting[];
}

export interface Posting {
  account: string;
  amount: number;
  currency: string;
}
