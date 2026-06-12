# 随手记导出格式分析与导入指南

> 基于实际导出的随手记 XLS 文件（家庭记账本，2014-2026年数据）分析编写。

---

## 一、导出文件格式概述

随手记支持导出为 `.xls` 格式（Excel 97-2003），文件内包含 **5 个 Sheet**，按交易类型分类存储：

| Sheet 名称 | 行数（示例） | 说明 |
|------------|------------|------|
| **支出** | ~16,699 | 日常消费支出记录 |
| **收入** | ~582 | 工资、奖金、退款等收入 |
| **余额变更** | ~32 | 账户期初余额设置或余额校正 |
| **债权变更** | ~3 | 应收/应付款项调整 |
| **转账** | ~680 | 账户之间的资金流转 |

> 注意：导出文件不是 CSV，而是 XLS 二进制格式，需用 xlsx/SheetJS 等库解析。

---

## 二、各 Sheet 字段结构

### 2.1 支出（Expense）

```
交易类型 | 日期 | 一级分类 | 二级分类 | 支出账户 | 金额 | 成员 | 商家 | 项目 | 备注
```

| 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|
| 交易类型 | 固定值 | `支出` | 始终为"支出" |
| 日期 | 字符串 | `2026-06-10 22:39:42` | `YYYY-MM-DD HH:mm:ss` 格式，含时间 |
| 一级分类 | 枚举 | `食品酒水` | 见下方枚举表 |
| 二级分类 | 字符串 | `早午晚餐` | 一级分类下的细分，共53种 |
| 支出账户 | 字符串 | `信用卡` | 付款账户名称，与随手记账户对应 |
| 金额 | 数字字符串 | `77.72` | 正数，单位元 |
| 成员 | 枚举或空 | `老公` | 支出所属家庭成员，可为空 |
| 商家 | 字符串或空 | `京东` | 消费商家 |
| 项目 | 字符串或空 | `红包` | 关联的项目标签，通常为空 |
| 备注 | 字符串或空 | `七鲜意大利面...` | 自由描述 |

**一级分类枚举（12种）：**
```
食品酒水、休闲娱乐、行车交通、居家物业、医疗保健、
金融保险、交流通讯、学习进修、衣服饰品、育儿母婴、
人情往来、其他杂项
```

**成员枚举：**
```
老公、老婆、子女、父母、家庭公用
```

---

### 2.2 收入（Income）

```
交易类型 | 日期 | 一级分类 | 二级分类 | 收入账户 | 金额 | 成员 | 商家 | 项目 | 备注
```

与支出结构基本一致，差异点：
- **`收入账户`**（不是"支出账户"）：资金到账的账户
- 金额为正数

**一级分类（2种）：**
```
职业收入、其他收入
```

**二级分类（12种）：**
```
工资收入、奖金收入、兼职收入、福利收入、投资收入、
利息收入、礼金收入、经营所得、卖二手、退款、保险、意外来钱
```

---

### 2.3 余额变更（Balance Adjustment）

```
交易类型 | 日期 | 一级分类 | 二级分类 | 账户1 | 账户2 | 金额 | 成员 | 商家 | 项目 | 备注
```

| 字段 | 说明 |
|------|------|
| 交易类型 | 固定值 `余额变更` |
| 账户1 | 被调整余额的账户名称 |
| 账户2 | 通常为空 |
| 金额 | **可为负数**（表示余额减少）|
| 一级/二级分类 | 通常为空 |

典型用途：期初建账时设置各账户余额，或因错账/盘点后手工校正余额。

---

### 2.4 债权变更（Receivable/Payable Adjustment）

```
交易类型 | 日期 | 一级分类 | 二级分类 | 账户1 | 账户2 | 金额 | 成员 | 商家 | 项目 | 备注
```

与余额变更结构完全相同，区别仅在于 `交易类型 = 债权变更`。

典型账户：`应收款项`、`应付款项`、`公司报销`（借/贷）。金额可为负数（核销债权）。

---

### 2.5 转账（Transfer）

```
交易类型 | 日期 | 转出账户 | 转入账户 | 金额 | 成员 | 商家 | 项目 | 备注
```

| 字段 | 说明 |
|------|------|
| 交易类型 | 固定值 `转账` |
| 转出账户 | 资金来源账户（如 `工资卡`） |
| 转入账户 | 资金目标账户（如 `信用卡`） |
| 金额 | 正数 |
| 一级/二级分类 | **此 Sheet 无此两列** |

常见转账场景：还信用卡（工资卡→信用卡）、充值（工资卡→第三方账户）。

---

## 三、账户体系

实际数据中出现的账户名称（仅供参考，以实际账本为准）：

**资产类：**
```
工资卡、家庭卡、房贷卡、车贷卡、现金、支付宝、余额宝、
医保当年账户、医保历年账户、公交卡、中石油卡、京东E卡、
关爱通、泰铢、天猫超市卡、雅弗源、外包 ...
```

**信用类（负债）：**
```
信用卡、应付款项、郑远元（个人借款）...
```

**应收类（债权）：**
```
应收款项、公司报销、浆果 ...
```

---

## 四、与现有 CSV 适配器的差异

> 现有代码位于 `packages/server/src/trpc/routers/import.ts` 的 `adaptSuishouji` 函数。

| 差异点 | 现有适配器假设 | 真实 XLS 格式 |
|--------|--------------|--------------|
| 文件格式 | `.csv` 文本 | `.xls` 二进制 |
| Sheet 结构 | 单一 Sheet | 5 个 Sheet，按类型分开 |
| 分类字段名 | `分类` / `子分类` | `一级分类` / `二级分类` |
| 账户字段名 | `账户1` / `账户2` | 因 Sheet 不同而异（支出账户/收入账户/转出账户/转入账户）|
| 标签 | 有 `标签` 列 | **无标签列**，用 `项目` 代替 |
| 余额变更 | 不支持 | 需新增类型 |
| 债权变更 | 不支持 | 需新增类型 |
| 金额符号 | 取绝对值 | 余额变更/债权变更金额**可为负数** |
| 备注来源 | `备注` 或 `摘要` | 仅 `备注` 列 |

---

## 五、导入方案设计

### 5.1 推荐导入方式

由于 XLS 格式需要在前端解析，推荐改造导入流程：

```
用户选择 .xls 文件
    ↓
前端用 SheetJS (xlsx) 解析 XLS → JSON
    ↓
前端按 Sheet 分类聚合所有行
    ↓
调用 trpc.import.execute 传入统一格式 JSON
    ↓
后端逐行写入 Beancount 文件 + PostgreSQL 查询缓存
```

### 5.2 各 Sheet 映射到 Clover Book 交易类型

| 随手记 Sheet | Clover Book 交易类型 | 说明 |
|-------------|---------------------|------|
| 支出 | `expense` | 直接映射 |
| 收入 | `income` | 直接映射 |
| 转账 | `transfer` | 转出账户→转入账户 |
| 余额变更 | 暂跳过或作为 `transfer` | 期初余额建议手工处理 |
| 债权变更 | `reimbursement` 或 `borrow_in/out` | 视正负金额决定方向 |

### 5.3 账户匹配策略

随手记的账户名称（如"工资卡"）需要与 Clover Book 中的账户 `displayName` 对应：

```typescript
// 建议在导入时：
// 1. 先查询账本内的所有账户 displayName
// 2. 用随手记账户名精确匹配 displayName
// 3. 未匹配到的，使用用户选择的"默认账户"
const accountMap = new Map(accounts.map(a => [a.displayName, a.id]));
const fromAccountId = accountMap.get(row['支出账户']) ?? defaultFromAccountId;
```

### 5.4 去重策略（增量导入）

**当前实现：不去重，每次导入全部追加。**

若需支持增量导入不重复，建议添加导入来源标记：

```typescript
// 在 transactions 表添加 importFingerprint 字段（可选）
// 指纹 = hash(ledgerId + date + amount + narration)
// 导入前检查是否已存在相同指纹

const fingerprint = Bun.CryptoHasher
  .hash('md5', `${ledgerId}:${row.date}:${row.amount}:${row.narration}`);

const existing = await db.query.transactions.findFirst({
  where: eq(schema.transactions.importFingerprint, fingerprint),
});
if (existing) { skipped++; continue; }
```

---

## 六、前端 XLS 解析示例

```typescript
import * as XLSX from 'xlsx';

export function parseXlsFile(file: File): Promise<SuishoujiData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      
      const result: SuishoujiData = {
        expenses:  sheetToRows(workbook, '支出'),
        incomes:   sheetToRows(workbook, '收入'),
        transfers: sheetToRows(workbook, '转账'),
        // 余额变更和债权变更通常数量少，可选择性导入
      };
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function sheetToRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: '',
    raw: false,
  });
}
```

---

## 七、字段转换完整映射

### 支出 Sheet → CsvRow

```typescript
function adaptSuishoujiExpense(row: Record<string, string>): CsvRow {
  return {
    date: row['日期'].slice(0, 10),          // "2026-06-10 22:39:42" → "2026-06-10"
    type: 'expense',
    amount: parseFloat(row['金额']),
    narration: row['备注'] || `${row['一级分类']}/${row['二级分类']}` || '支出',
    payee: row['商家'] || undefined,
    categoryName: row['二级分类']
      ? `${row['一级分类']}/${row['二级分类']}`
      : row['一级分类'] || undefined,
    fromAccount: row['支出账户'] || undefined,
    tags: row['项目'] ? [row['项目']] : undefined,
    member: row['成员'] || undefined,
  };
}
```

### 收入 Sheet → CsvRow

```typescript
function adaptSuishoujiIncome(row: Record<string, string>): CsvRow {
  return {
    date: row['日期'].slice(0, 10),
    type: 'income',
    amount: parseFloat(row['金额']),
    narration: row['备注'] || `${row['一级分类']}/${row['二级分类']}` || '收入',
    payee: row['商家'] || undefined,
    categoryName: row['二级分类']
      ? `${row['一级分类']}/${row['二级分类']}`
      : row['一级分类'] || undefined,
    toAccount: row['收入账户'] || undefined,
    tags: row['项目'] ? [row['项目']] : undefined,
  };
}
```

### 转账 Sheet → CsvRow

```typescript
function adaptSuishoujiTransfer(row: Record<string, string>): CsvRow {
  return {
    date: row['日期'].slice(0, 10),
    type: 'transfer',
    amount: parseFloat(row['金额']),
    narration: row['备注'] || '转账',
    fromAccount: row['转出账户'] || undefined,
    toAccount: row['转入账户'] || undefined,
  };
}
```

---

## 八、导入注意事项

1. **时间跨度大**：真实数据可跨越10年以上（2014-2026），导入前建议确认时间范围。

2. **账户名称映射**：随手记的账户名（如"信用卡"、"工资卡"）需预先在 Clover Book 中创建对应账户，`displayName` 保持一致以便自动匹配。

3. **分类自动创建**：导入时建议自动创建不存在的一级/二级分类，避免手动预建。

4. **余额变更/债权变更**：这两类数据量极少（本例只有35条），可选择导入为特殊交易类型，或完全跳过，仅手工处理账户期初余额。

5. **增量导入安全性**：当前导入实现无去重逻辑。同一 XLS 文件多次导入会产生重复数据。建议用户在导入前确认是否已导入过，或为将来实现基于日期+金额+备注的指纹去重。

6. **文件隐私**：XLS 导出文件包含真实财务数据，**不应提交到代码仓库**。已在 `.gitignore` 中添加 `tests/fixtures/*.xls` 规则。

---

## 九、数据统计（本示例文件）

| 维度 | 数据 |
|------|------|
| 时间跨度 | 2014-02 ~ 2026-06（约12年） |
| 总记录数 | ~17,996 条 |
| 支出记录 | 16,699 条 |
| 收入记录 | 582 条 |
| 转账记录 | 680 条 |
| 余额变更 | 32 条 |
| 债权变更 | 3 条 |
| 支出一级分类 | 12 种 |
| 支出二级分类 | 53 种 |
| 成员 | 老公、老婆、子女、父母、家庭公用 |
| 账户数（估计） | 35+ 个 |
