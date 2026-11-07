export const SYSTEM_OUTPUT = 'local.tux.appmixer.system-output';
export const APP_OUTPUT = 'local.tux.appmixer.app-output';
export const isRouting = action => action === SYSTEM_OUTPUT || action === APP_OUTPUT;

export function outputOptions(action, routing) {
  const outputs = routing.outputs ?? [];
  if (action === SYSTEM_OUTPUT) return outputs;
  const current = outputs.find(d => d.id === routing.systemOutputId);
  return [{ id: null, name: `Системный${current ? `: ${current.name}` : ' по умолчанию'}` }, ...outputs];
}
