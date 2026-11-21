'use strict';
// Serves a local PDF relay of the production checkout handoff PDF.
// This script is not production code and requires a Chromium executable.
import { createServer } from 'node:http';

const relay = await new Promise((resolve, reject) => {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1:3999');
      if (url.pathname !== '/handoff.pdf') {
        response.writeHead(404).end();
        return;
      }
      const fetched = await fetch(process.env.PRIVATE_HANDOFF || 'http://127.0.0.1:3000/handoff.pdf');
      if (!fetched.ok) throw new Error(`handoff fetch failed: ${fetched.status}`);
      response.writeHead(200, {
        'Content-Type': fetched.headers.get('Content-Type') || 'application/pdf',
        'Cache-Control': 'no-store',
      });
      response.end(Buffer.from(await fetched.arrayBuffer()));
    } catch (error) {
      response.writeHead(502).end(String(error));
    }
  });
  server.once('error', reject);
  server.listen(3999, '127.0.0.1', () => resolve(server));
});
console.log('Handoff relay: http://127.0.0.1:3999/handoff.pdf');
setInterval(() => {}, 60000);
