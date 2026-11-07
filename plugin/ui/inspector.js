/* Stream Deck property inspector runs in its embedded browser. */
let socket, context, action, settings = {}, poll;
let isKey = false;
let routingAction = false;
const $ = id => document.getElementById(id);
function send(command, extra = {}) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event: 'sendToPlugin', action, context, payload: { command, ...extra } }));
}
function connectElgatoStreamDeckSocket(port, uuid, registerEvent, _info, actionInfo) {
  context = uuid;
  const info = JSON.parse(actionInfo);
  action = info.action;
  isKey = action === 'local.tux.appmixer.app';
  routingAction = action === 'local.tux.appmixer.system-output' || action === 'local.tux.appmixer.app-output';
  const systemOutput = action === 'local.tux.appmixer.system-output';
  settings = info.payload.settings ?? {};
  $('pin').hidden = isKey || systemOutput;
  $('targetStatus').hidden = systemOutput;
  $('dialSettings').hidden = isKey || routingAction;
  $('routingSettings').hidden = !routingAction;
  for (const id of ['app', 'assign', 'dial', 'unlock']) $(id).hidden = systemOutput;
  $('assign').textContent = isKey ? 'Назначить этой кнопке' : 'Назначить валкодеру';
  $('bindingHint').textContent = isKey
    ? 'Выберите приложение — на ЭТОЙ кнопке появятся его иконка и громкость. Кнопка на устройстве выбирает приложение для валкодера, а если оно закрыто — запускает его. «Автоматически» возвращает слот общего списка.'
    : systemOutput ? 'Этот канал переключает общий системный выход Windows. Выход для связи не меняется.'
    : routingAction ? 'Коснитесь табло этого канала, затем нажмите кнопку приложения сверху. Вращайте валкодер для выбора выхода и нажмите для применения.'
    : 'Здесь приложение назначается валкодеру. Приложения на верхних кнопках настраиваются отдельно: выберите нужную кнопку в редакторе.';
  $('step').value = settings.step ?? 10;
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.onopen = () => {
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
    send('status');
    poll = setInterval(() => send('status'), 1500);
  };
  socket.onclose = () => clearInterval(poll);
  socket.onmessage = ev => {
    const message = JSON.parse(ev.data);
    if (message.event !== 'sendToPropertyInspector' || message.payload.type !== 'status') return;
    const status = message.payload, select = $('app'), previous = select.value;
    settings = status.actionSettings ?? settings;
    const apps = [...status.apps, ...status.pins.filter(p => p && !status.apps.some(a => a.key === p.key))];
    if (status.boundApplication && !apps.some(a => a.key === status.boundApplication.key)) apps.push(status.boundApplication);
    const options = apps.map(app => {
      const option = document.createElement('option'); option.value = app.key; option.textContent = app.name; return option;
    });
    if (isKey) {
      const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Автоматически (общий список)'; options.unshift(auto);
    }
    select.replaceChildren(...options);
    if (isKey) select.value = status.boundApplication?.key ?? '';
    else if (apps.some(a => a.key === previous)) select.value = previous;
    else if (status.currentApplication) select.value = status.currentApplication;
    if (isKey) $('dial').value = status.selected;
    for (const channel of status.channels ?? []) {
      const option = $('dial').options[channel.slot];
      option.textContent = `Валкодер ${channel.slot + 1}: ${channel.name}${channel.locked ? ' — LOCK' : ''}${channel.available ? '' : ' (нет на странице)'}`;
    }
    const target = status.channels?.[Number($('dial').value)];
    $('targetStatus').textContent = target
      ? `Целевой валкодер ${target.slot + 1}: ${target.locked ? 'ЗАБЛОКИРОВАН — снимите LOCK кнопкой ниже' : 'готов к выбору приложения'}.`
      : '';
    $('error').textContent = status.notice ?? status.error ?? status.warnings ?? '';
    if (status.routing) {
      $('output').replaceChildren(...status.routing.options.map(output => {
        const option = document.createElement('option'); option.value = output.id ?? ''; option.textContent = output.name; return option;
      }));
      $('output').value = status.routing.chosen?.id ?? '';
      $('applyOutput').disabled = !status.routing.supported || !status.routing.chosen;
    }
    const excluded = status.excludedApps ?? [], previousExcludedChoice = $('excludeApp').value;
    const candidates = status.apps.filter(app => !excluded.some(e => e.key === app.key));
    $('excludeApp').replaceChildren(...candidates.map(app => {
      const option = document.createElement('option'); option.value = app.key; option.textContent = app.name; return option;
    }));
    if (candidates.some(a => a.key === previousExcludedChoice)) $('excludeApp').value = previousExcludedChoice;
    $('exclude').disabled = !candidates.length;
    $('excluded').replaceChildren(...excluded.map(app => {
      const row = document.createElement('div'); row.className = 'pin';
      const label = document.createElement('span'); label.textContent = app.name;
      const button = document.createElement('button'); button.textContent = 'Вернуть в автосписок';
      button.onclick = () => send('include', { key: app.key }); row.append(label, button); return row;
    }));
    $('page').textContent = `${status.page}/${status.pages}`;
    $('pins').replaceChildren(...status.pins.filter(Boolean).map(app => {
      const row = document.createElement('div'); row.className = 'pin';
      const label = document.createElement('span'); label.textContent = app.name; row.append(label);
      for (const [title, command, extra] of [['←', 'movePin', { delta: -1 }], ['→', 'movePin', { delta: 1 }], ['×', 'pin', {}]]) {
        const button = document.createElement('button'); button.textContent = title;
        button.onclick = () => send(command, { key: app.key, ...extra }); row.append(button);
      }
      return row;
    }));
  };
}
$('assign').onclick = () => send(isKey ? 'bindKey' : 'assign', { key: $('app').value, slot: Number($('dial').value) });
$('app').onchange = () => { if (isKey) send('bindKey', { key: $('app').value }); };
$('dial').onchange = () => { if (isKey) send('selectDial', { slot: Number($('dial').value) }); };
$('pin').onclick = () => send('pin', { key: $('app').value });
$('unlock').onclick = () => send('unlock', { slot: Number($('dial').value) });
$('exclude').onclick = () => send('exclude', { key: $('excludeApp').value });
$('output').onchange = () => send('previewOutput', { deviceId: $('output').value || null });
$('applyOutput').onclick = () => send('applyOutput');
$('cancelOutput').onclick = () => send('cancelOutput');
$('previous').onclick = () => send('page', { delta: -1 });
$('next').onclick = () => send('page', { delta: 1 });
$('step').onchange = () => {
  settings.step = Math.max(1, Math.min(10, Number($('step').value) || 10));
  socket.send(JSON.stringify({ event: 'setSettings', context, payload: settings }));
};
