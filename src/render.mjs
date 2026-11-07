import { COLORS, clamp } from './model.mjs';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const text = (x, y, size, value, color = '#fff', anchor = 'middle') => `<text x="${x}" y="${y}" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="600" fill="${color}" text-anchor="${anchor}">${escape(value)}</text>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const icon = (app, x, y, size) => app?.icon?.startsWith('data:image/png;base64,')
  ? `<image x="${x}" y="${y}" width="${size}" height="${size}" xlink:href="${app.icon}"/>`
  : text(x + size / 2, y + size * .75, size * .7, app?.name?.slice(0, 1) ?? '♪', '#b7c6dc');
export const dataUri = source => `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;

export function keySvg(app, { pinned = false, dials = [], error = false } = {}) {
  let b = '<rect width="144" height="144" rx="15" fill="#101723"/>';
  if (!app) return svg(144, 144, b + text(72, 69, 26, error ? '!' : '＋', '#62758d') + text(72, 100, 14, error ? 'Нет связи' : 'Нет звука', '#899ab1'));
  const color = app.muted ? '#ff5e73' : dials.length ? COLORS[dials[0]] : '#57c6e9';
  const circumference = 2 * Math.PI * 60, volume = clamp(app.volume ?? 0, 0, 100);
  b += `<g opacity="${app.online === false ? .35 : 1}"><circle cx="72" cy="72" r="60" fill="none" stroke="#283449" stroke-width="7"/>`;
  if (volume > 0) b += `<circle cx="72" cy="72" r="60" fill="none" stroke="${color}" stroke-width="7" stroke-dasharray="${circumference * volume / 100} ${circumference}" transform="rotate(-90 72 72)"/>`;
  b += icon(app, 44, 29, 56);
  b += '<rect x="35" y="82" width="74" height="34" rx="10" fill="#080e19" fill-opacity=".94"/>';
  b += text(72, 108, 29, app.online === false ? '—' : app.muted ? 'M' : volume, color);
  if (app.muted) b += '<path d="M44 34 L100 79" stroke="#ff5e73" stroke-width="5"/>';
  b += '</g>';
  if (pinned) b += text(20, 26, 17, 'P', '#ffdc79');
  for (let i = 0; i < dials.length; i++) b += text(120, 25 + i * 19, 17, dials[i] + 1, COLORS[dials[i]]);
  if (app.mixed) b += text(23, 123, 16, '≈', '#ffdc79');
  return svg(144, 144, b);
}

export function dialSvg(app, { slot = 0, selected = false, locked = false, page = 0, count = 1, error = false } = {}) {
  const color = app?.muted ? '#ff5e73' : COLORS[slot];
  let b = `<rect width="200" height="100" fill="${selected ? '#1d2c41' : '#101723'}"/>`;
  b += `<rect x="2" y="2" width="196" height="96" rx="7" fill="none" stroke="${selected ? color : '#253044'}" stroke-width="${selected ? 2 : 1}"/>`;
  b += text(10, 18, 11, `${slot + 1}${locked ? ' LOCK' : ''}`, color, 'start');
  b += text(190, 18, 11, `${page + 1}/${count}`, '#94a5bd', 'end');
  b += icon(app, 10, 28, 34);
  const name = app?.name ?? (error ? 'Нет связи с Windows' : 'Выберите приложение');
  b += text(50, 41, 12, name.length > 20 ? name.slice(0, 19) + '…' : name, '#e3ecf9', 'start');
  const value = !app ? '—' : app.online === false ? 'OFF' : app.muted ? 'MUTE' : `${app.volume}%${app.mixed ? ' ≈' : ''}`;
  b += text(50, 68, 24, value, app?.online === false ? '#8493aa' : color, 'start');
  b += '<rect x="12" y="80" width="176" height="7" rx="3" fill="#2a384e"/>';
  if (app?.online !== false && app?.volume > 0) b += `<rect x="12" y="80" width="${176 * app.volume / 100}" height="7" rx="3" fill="${color}"/>`;
  return svg(200, 100, b);
}

export function outputSvg(app, { system = false, selected = false, slot = 0, output = null, pending = false, supported = true } = {}) {
  const color = COLORS[slot];
  const short = (name, length) => name.length > length ? name.slice(0, length - 1) + '…' : name;
  let b = `<rect width="200" height="100" fill="${selected ? '#1d2c41' : '#101723'}"/>`;
  b += `<rect x="2" y="2" width="196" height="96" rx="7" fill="none" stroke="${selected ? color : '#253044'}" stroke-width="2"/>`;
  b += text(10, 18, 12, system ? 'СИСТЕМНЫЙ ВЫХОД' : 'ВЫХОД ПРИЛОЖЕНИЯ', color, 'start');
  b += text(10, 38, 13, system ? 'Windows' : short(app?.name ?? 'Выберите приложение', 24), '#e3ecf9', 'start');
  b += text(10, 62, 13, short(output?.name ?? 'Нет устройства', 25), '#fff', 'start');
  b += text(10, 85, 11, !supported ? 'API недоступен' : pending ? 'Нажмите: применить' : 'Крутить: выбрать выход', pending ? '#ffdc79' : '#94a5bd', 'start');
  return svg(200, 100, b);
}
