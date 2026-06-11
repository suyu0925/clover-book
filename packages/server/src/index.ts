import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { trpcServer } from '@hono/trpc-server';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { jwtVerify } from 'jose';
import { eq, and } from 'drizzle-orm';
import { db, schema } from './db';
import { UPLOAD_DIR } from './trpc/routers/attachment';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'clover-book-dev-secret-key');

const app = new Hono();

// CORS
app.use('/*', cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// tRPC
app.use('/trpc/*', trpcServer({
  router: appRouter,
  createContext: (_opts, c) => createContext(c.req.raw),
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// === 文件上传 ===
app.post('/api/attachments/upload', async (c) => {
  // 验证 token
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '未授权' }, 401);
  }
  let userId: string;
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET);
    userId = payload.sub as string;
  } catch {
    return c.json({ error: 'Token 无效' }, 401);
  }

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const transactionId = formData.get('transactionId') as string;
  const ledgerId = formData.get('ledgerId') as string;

  if (!file || !transactionId || !ledgerId) {
    return c.json({ error: '缺少必要参数' }, 400);
  }

  // 检查权限
  const member = await db.query.ledgerMembers.findFirst({
    where: and(
      eq(schema.ledgerMembers.ledgerId, ledgerId),
      eq(schema.ledgerMembers.userId, userId),
    ),
  });
  if (!member) return c.json({ error: '无权访问' }, 403);

  // 保存文件
  const ext = file.name.split('.').pop() || 'bin';
  const fileName = `${randomUUID()}.${ext}`;
  const relPath = `${ledgerId}/${fileName}`;
  const absDir = join(UPLOAD_DIR, ledgerId);
  await mkdir(absDir, { recursive: true });

  const buffer = await file.arrayBuffer();
  await writeFile(join(absDir, fileName), Buffer.from(buffer));

  // 写入数据库
  const [attachment] = await db.insert(schema.attachments).values({
    transactionId,
    ledgerId,
    fileName: file.name,
    filePath: relPath,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
  }).returning();

  return c.json(attachment);
});

// === 文件下载 ===
app.get('/api/attachments/:id', async (c) => {
  const id = c.req.param('id');
  const attachment = await db.query.attachments.findFirst({
    where: eq(schema.attachments.id, id),
  });
  if (!attachment) return c.json({ error: '附件不存在' }, 404);

  const filePath = join(UPLOAD_DIR, attachment.filePath);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return c.json({ error: '文件不存在' }, 404);

  return new Response(file.stream(), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
    },
  });
});

const port = parseInt(process.env.PORT || '3000', 10);

// === Production: Serve frontend static files ===
if (process.env.NODE_ENV === 'production') {
  const webDir = join(process.cwd(), 'web');

  app.get('/*', async (c) => {
    const reqPath = new URL(c.req.url).pathname;

    // Try to serve the exact file
    const filePath = join(webDir, reqPath === '/' ? 'index.html' : reqPath);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file.stream(), {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
    }

    // SPA fallback: serve index.html for client-side routing
    const indexFile = Bun.file(join(webDir, 'index.html'));
    if (await indexFile.exists()) {
      return new Response(indexFile.stream(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return c.text('Not Found', 404);
  });
}

console.log(`\u{1F340} Clover Book server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
