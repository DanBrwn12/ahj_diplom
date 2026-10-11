import Koa from 'koa';
import Router from 'koa-router';
import { koaBody } from 'koa-body';
import cors from '@koa/cors';
import http from 'node:http';
import serve from 'koa-static';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';

const app = new Koa();
const router = new Router();

app.use(cors());

app.use(
  koaBody({
    multipart: true,
    formidable: {
      uploadDir: path.resolve('files'),
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024,
    },
  }),
);

app.use(serve(path.resolve('files')));

const messages = [];
let pinnedId = null;

router.get('/api/messages/search', (ctx) => {
  const query = (ctx.query.q || '').trim().toLowerCase();

  if (!query) {
    ctx.body = { status: 'ok', messages: [], pinnedId };
    return;
  }

  const found = messages.filter((message) => {
    if (message.type === 'text') {
      return message.content.toLowerCase().includes(query);
    }
    if (message.type === 'file') {
      return message.content.name.toLowerCase().includes(query);
    }
    return false;
  });

  ctx.body = { status: 'ok', messages: found, pinnedId };
});

router.get('/api/messages', (ctx) => {
  const offset = Number(ctx.query.offset) || 0;
  const limit = Number(ctx.query.limit) || 10;

  const start = Math.max(messages.length - offset - limit, 0);
  const end = messages.length - offset;

  ctx.body = {
    status: 'ok',
    messages: messages.slice(start, end),
    total: messages.length,
    pinnedId,
  };
});

router.post('/api/messages', (ctx) => {
  const { type, content } = ctx.request.body;

  if (!content) {
    ctx.status = 400;
    ctx.body = { status: 'error', message: 'Content is required' };
    return;
  }

  const message = {
    id: randomUUID(),
    type: type || 'text',
    content,
    created: Date.now(),
  };

  messages.push(message);
  broadcast({ type: 'message', message });

  ctx.body = { status: 'ok', message };
});

router.post('/api/messages/:id/pin', (ctx) => {
  const { id } = ctx.params;
  const message = messages.find((m) => m.id === id);

  if (!message) {
    ctx.status = 404;
    ctx.body = { status: 'error', message: 'Message not found' };
    return;
  }

  pinnedId = id;
  broadcast({ type: 'pin-changed', pinnedId });

  ctx.body = { status: 'ok', pinnedId };
});

router.post('/api/messages/:id/unpin', (ctx) => {
  pinnedId = null;
  broadcast({ type: 'pin-changed', pinnedId });

  ctx.body = { status: 'ok', pinnedId };
});

router.post('/api/files', async (ctx) => {
  const file = ctx.request.files?.file;

  if (!file) {
    ctx.status = 400;
    ctx.body = { status: 'error', message: 'File is required' };
    return;
  }

  const savedFile = Array.isArray(file) ? file[0] : file;
  const filename = path.basename(savedFile.filepath);

  const message = {
    id: randomUUID(),
    type: 'file',
    content: {
      name: savedFile.originalFilename,
      url: `/${filename}`,
      mime: savedFile.mimetype,
      size: savedFile.size,
    },
    created: Date.now(),
  };

  messages.push(message);
  broadcast({ type: 'message', message });

  ctx.body = { status: 'ok', message };
});

router.get('/api/files/:id', async (ctx) => {
  const message = messages.find(
    (m) => m.id === ctx.params.id && m.type === 'file',
  );

  if (!message) {
    ctx.status = 404;
    ctx.body = { status: 'error', message: 'File not found' };
    return;
  }

  const filename = path.basename(message.content.url);
  const filePath = path.resolve('files', filename);

  try {
    const fileBuffer = await readFile(filePath);
    ctx.set('Content-Disposition', `attachment; filename="${message.content.name}"`);
    ctx.set('Content-Type', message.content.mime);
    ctx.body = fileBuffer;
  } catch {
    ctx.status = 404;
    ctx.body = { status: 'error', message: 'File not found on disk' };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

const server = http.createServer(app.callback());
const wss = new WebSocketServer({ server });

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.on('close', () => console.log('Client disconnected'));
});

const port = process.env.PORT || 7070;
server.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});