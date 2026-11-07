import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { KEY, DIAL } from '../src/controller.mjs';

// Real bundled Node plugin + real native read-only bridge against a mock Stream Deck host.
const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await new Promise(resolve => server.on('listening', resolve));
const directory = fileURLToPath(new URL('../dist/local.tux.appmixer.sdPlugin/', import.meta.url));
const child = spawn(process.execPath, [directory + 'bin/plugin.mjs', '-port', String(server.address().port), '-pluginUUID', 'smoke', '-registerEvent', 'registerPlugin', '-info', '{}'], { cwd: directory, windowsHide: true });
let stderr = '';
child.stderr.on('data', data => { stderr += data; });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Smoke timeout. ${stderr}`)), 20000);
    let registered = false, image = false, dial = false;
    server.on('connection', socket => {
      socket.on('message', raw => {
        try {
          const message = JSON.parse(String(raw));
          if (message.event === 'registerPlugin') { assert.equal(message.uuid, 'smoke'); registered = true; }
          if (message.event === 'getGlobalSettings') {
            socket.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: {} } }));
            for (const [action, context, controller] of [[KEY, 'key', 'Keypad'], [DIAL, 'dial', 'Encoder']]) {
              socket.send(JSON.stringify({ event: 'willAppear', action, context, device: 'test', payload: { controller, coordinates: { column: 0, row: 0 }, settings: {} } }));
            }
          }
          if (message.event === 'setImage') {
            const source = Buffer.from(message.payload.image.split(',')[1], 'base64').toString();
            // Wait for an actual application snapshot, not the initial empty state.
            image ||= source.includes('stroke-dasharray');
          }
          if (message.event === 'setFeedback') dial = !!message.payload.canvas;
          if (registered && image && dial) { clearTimeout(timeout); resolve(); }
        } catch (error) { clearTimeout(timeout); reject(error); }
      });
    });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { clearTimeout(timeout); reject(new Error(`Plugin exited early: ${code}. ${stderr}`)); });
  });
  console.log('PASS: registration, real Windows audio scan, SVG key icon and touch-strip feedback. No volumes modified.');
} finally {
  for (const client of server.clients) client.close();
  server.close();
  // Plugin exits on socket close and closes native stdin. Wait for normal cleanup.
  await new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => { child.kill(); resolve(); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}
