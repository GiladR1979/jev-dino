import http from 'node:http';
import { createReadStream } from 'node:fs';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { HttpError, validateObservation } from './validation.mjs';
import { publicFile } from './artifact-store.mjs';

async function readJson(req, limit = 32768) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json')
    throw new HttpError(415, 'Expected application/json');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
function json(res, value, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}
/** Dependency injection keeps integration tests offline and free of credentials. */
export function createApp({ root, port, client, store, configured = true }) {
  let active = 0;
  const host = `127.0.0.1:${port}`;
  const origin = `http://${host}`;
  return http.createServer(
    { requestTimeout: 120_000, headersTimeout: 10_000 },
    async (req, res) => {
      try {
        if (req.headers.host !== host) throw new HttpError(403, 'Invalid host');
        const url = new URL(req.url, origin);
        if (req.method === 'POST' && req.headers.origin !== origin)
          throw new HttpError(403, 'Invalid origin');
        if (req.method === 'GET' && url.pathname === '/health')
          return json(res, { ok: true, configured, active });
        if (req.method === 'POST' && url.pathname === '/decision') {
          if (active >= 12)
            throw new HttpError(429, 'Too many pending decisions');
          active++;
          const abort = new AbortController();
          const disconnect = () => {
            if (!res.writableEnded) abort.abort();
          };
          res.once('close', disconnect);
          try {
            const state = validateObservation(await readJson(req));
            const result = await client.decide(state, abort.signal);
            const receipt = {
              ...result,
              sequence: state.sequence,
              obstacleId: state.obstacle?.id ?? null,
              runId: state.runId,
            };
            await store.receipt(receipt);
            return json(res, receipt);
          } finally {
            active--;
            res.removeListener('close', disconnect);
          }
        }
        if (req.method === 'POST' && url.pathname === '/evidence') {
          await store.report(await readJson(req, 8_000_000));
          return json(res, { ok: true });
        }
        if (req.method === 'POST' && url.pathname === '/recording')
          return json(
            res,
            await store.recording(url.searchParams.get('name'), req),
          );
        if (req.method !== 'GET') throw new HttpError(404, 'Not found');
        let relative;
        try {
          relative = decodeURIComponent(url.pathname.slice(1));
        } catch {
          throw new HttpError(400, 'Invalid path');
        }
        const recording = relative.startsWith('recordings/');
        const file = await publicFile(
          join(root, recording ? 'recordings' : 'public'),
          recording ? relative.slice(11) : relative || 'index.html',
        );
        const mime = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.png': 'image/png',
          '.mp3': 'audio/mpeg',
          '.webm': 'video/webm',
        };
        res.writeHead(200, {
          'Content-Type': mime[extname(file)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; media-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        });
        await pipeline(createReadStream(file), res);
      } catch (error) {
        if (res.destroyed) return;
        const status =
          error instanceof HttpError
            ? error.status
            : error?.code === 'EEXIST'
              ? 409
              : 500;
        if (!res.headersSent)
          json(
            res,
            {
              error:
                error instanceof HttpError
                  ? error.message
                  : status === 409
                    ? 'Artifact already exists'
                    : 'Local server error',
            },
            status,
          );
        else res.end();
      }
    },
  );
}
