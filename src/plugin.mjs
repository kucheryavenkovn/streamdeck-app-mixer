import WebSocket from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudioBridge } from './bridge.mjs';
import { Controller } from './controller.mjs';

const args = Object.fromEntries(Array.from({ length: Math.floor((process.argv.length - 2) / 2) }, (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
if (!args['-port'] || !args['-pluginUUID']) throw new Error('Launch this plugin from Stream Deck.');
const ws = new WebSocket(`ws://127.0.0.1:${Number(args['-port'])}`, { maxPayload: 8 * 1024 * 1024 });
const send = message => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
const log = message => send({ event: 'logMessage', payload: { message: String(message) } });
const audio = new AudioBridge(path.join(path.dirname(fileURLToPath(import.meta.url)), 'native', 'AudioBridge.exe'), log);
const controller = new Controller({ send, audio, log });
controller.uuid = args['-pluginUUID'];
let stopped = false;
let timer;
async function poll() {
  if (stopped) return;
  await controller.refresh();
  if (!stopped) timer = setTimeout(poll, 200);
}
ws.on('open', () => {
  send({ event: args['-registerEvent'], uuid: controller.uuid });
  send({ event: 'getGlobalSettings', context: controller.uuid });
  poll();
});
ws.on('message', data => {
  try {
    const event = JSON.parse(String(data));
    controller.handle(event).catch(error => log(error.stack));
  }
  catch (error) { log(error.message); }
});
function close() { stopped = true; clearTimeout(timer); audio.close(); ws.close(); }
ws.on('close', close);
ws.on('error', error => { console.error(error.message); close(); });
process.on('SIGTERM', close);
process.on('SIGINT', close);
