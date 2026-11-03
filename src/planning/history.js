import {planMetrics} from './engine.js';
// Versioned lossless checkpoints. Domain events are never pruned.
const copy = value => structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const need = (value, message) => { if (!value) throw new Error(message); };
export const CHECKPOINT_INTERVAL = 25;
const summaryMetrics=metrics=>Object.fromEntries(Object.entries(metrics).filter(([,value])=>value===null||typeof value==='number'));
function restoredVersion(version,content){
  const {metricsSummary,...meta}=version;
  if(!metricsSummary)return {...meta,content};
  const derived=planMetrics(content);
  const summary=summaryMetrics(derived);
  need(Object.keys(summary).length===Object.keys(version.metrics).length&&Object.entries(summary).every(([key,value])=>version.metrics[key]===value),'Métrica histórica alterada.');
  return {...meta,content,metrics:derived};
}
export const HISTORY_V2_BYTES = 8 * 1024 * 1024;

export function contentDelta(before, after) {
  const delta = {};
  for (const key of Object.keys(after)) {
    if (equal(before[key], after[key])) continue;
    if (!Array.isArray(after[key])) { delta[key] = { value: copy(after[key]) }; continue; }
    const previous = new Map(before[key].map(row => [row.id, row]));
    delta[key] = { ...(equal(before[key].map(row=>row.id),after[key].map(row=>row.id))?{}:{order:after[key].map(row=>row.id)}), rows: after[key].filter(row => !equal(previous.get(row.id), row)).map(copy) };
  }
  return delta;
}
export function applyContentDelta(before, delta) {
  const next = copy(before);
  for (const [key, change] of Object.entries(delta)) {
    need(Object.hasOwn(before, key), 'Checkpoint con sección desconocida.');
    if (Object.hasOwn(change, 'value')) { next[key] = copy(change.value); continue; }
    need(Array.isArray(before[key]) && Array.isArray(change.rows) && (change.order===undefined||Array.isArray(change.order)), 'Delta inválido.');
    const rows = new Map(before[key].map(row => [row.id, row]));
    for (const row of change.rows) rows.set(row.id, row);
    const order=change.order||before[key].map(row=>row.id);
    need(new Set(change.rows.map(row=>row.id)).size===change.rows.length && change.rows.every(row=>order.includes(row.id)), 'Delta con filas duplicadas o fuera del orden.');
    need(new Set(order).size === order.length && order.every(id => rows.has(id)), 'Delta con referencias ausentes.');
    next[key] = order.map(id => copy(rows.get(id)));
  }
  return next;
}
export function* versionContents(plan) {
  let content = null;
  for (let index = 0; index < plan.versions.length; index++) {
    const version = plan.versions[index];
    need(version.version === index + 1, 'Secuencia de versiones incompleta.');
    if (version.content) content = copy(version.content);
    else {
      need(content && version.baseVersion === index && version.delta, 'Falta el checkpoint o su versión base.');
      content = applyContentDelta(content, version.delta);
    }
    yield restoredVersion(version,content);
  }
}
export function planVersion(plan, number) {
  need(Number.isInteger(number) && number > 0 && number <= plan.versions.length, 'Versión ausente.');
  let index = number - 1;
  while (index > 0 && !plan.versions[index].content) index--;
  let content = copy(plan.versions[index].content);
  need(content, 'Checkpoint ausente.');
  for (let n = index + 1; n < number; n++) {
    const v = plan.versions[n];
    need(v.content || v.baseVersion === n, 'Base de checkpoint inválida.');
    content = v.content ? copy(v.content) : applyContentDelta(content, v.delta);
  }
  return restoredVersion(plan.versions[number - 1],content);
}
export function compactVersions(plan) {
  let previous = null;
  const versions = [];
  for (const v of versionContents(plan)) {
    const { content, delta: _delta, baseVersion: _base, ...meta } = v;
    versions.push(!previous || v.version % CHECKPOINT_INTERVAL === 0 || v.version === plan.activeVersion
      ? { ...meta, content }
      : { ...meta, baseVersion: v.version - 1, delta: contentDelta(previous, content) });
    if(v.version!==plan.activeVersion){versions.at(-1).metrics=summaryMetrics(v.metrics);versions.at(-1).metricsSummary=true;}
    previous = content;
  }
  return versions;
}
export function appendVersion(plan, content, metrics, at) {
  const previous = plan.versions.at(-1);
  // Keep the current projection complete. Freeze the previous version as a delta.
  if (previous && previous.version > 1 && previous.version % CHECKPOINT_INTERVAL !== 0) {
    const base = planVersion(plan, previous.version - 1).content;
    previous.delta = contentDelta(base, previous.content);
    previous.baseVersion = previous.version - 1;
    delete previous.content;
  }
  if(previous){previous.metrics=summaryMetrics(previous.metrics);previous.metricsSummary=true;}
  plan.activeVersion++;
  plan.versions.push({ version: plan.activeVersion, at, content: copy(content), metrics });
}
