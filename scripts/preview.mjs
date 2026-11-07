import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const routes = {
  '/': [new URL('./preview.html', import.meta.url), 'text/html; charset=utf-8'],
  '/src/model.mjs': [new URL('../src/model.mjs', import.meta.url), 'text/javascript'],
  '/src/render.mjs': [new URL('../src/render.mjs', import.meta.url), 'text/javascript']
};
createServer(async (request, response) => {
  const route = routes[request.url];
  if (!route) { response.writeHead(404).end(); return; }
  try { response.writeHead(200, { 'Content-Type': route[1] }); response.end(await readFile(route[0])); }
  catch { response.writeHead(500).end(); }
}).listen(18081, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:18081 (mock data; Windows volume is not changed)'));
