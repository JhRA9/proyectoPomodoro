import { escapeHtml } from "../utils/text.js";

export function areaColor(id, areaIds = [id]) {
  const palette = ["#b9a0ee", "#88d1c6", "#e7a5a0", "#efbc7e", "#91bce9", "#c9cd8c", "#dba5cb", "#99bca9", "#ada5e9", "#d5b094", "#94cbd8", "#b9c6e5", "#d8c38d", "#aacb95", "#c8a9b4"];
  const used = new Set();
  for (const [index, areaId] of [...new Set([...areaIds, id])].entries()) {
    let hash = 0; for (const char of String(areaId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    let slot = hash % palette.length;
    while (used.size < palette.length && used.has(slot)) slot = (slot + 1) % palette.length;
    const color = index < palette.length ? palette[slot] : `hsl(${(index * 137.508) % 360} 52% 73%)`;
    if (areaId === id) return color;
    used.add(slot);
  }
}

export function gauge({ id, title, value = null, label = "Sin evaluar", detail = "", main = false, selected = false, areaIds }) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  const angle = Math.PI * (1 - (pct || 0) / 100);
  const x = 150 + 104 * Math.cos(angle), y = 148 - 104 * Math.sin(angle);
  const color = main ? "url(#workspace-main-gradient)" : areaColor(id, areaIds);
  const ticks = Array.from({ length: 21 }, (_, index) => {
    const a = Math.PI * (1 - index / 20), r = index % 5 === 0 ? 107 : 111;
    return `<line x1="${150 + r * Math.cos(a)}" y1="${148 - r * Math.sin(a)}" x2="${150 + 118 * Math.cos(a)}" y2="${148 - 118 * Math.sin(a)}" />`;
  }).join("");
  return `<button type="button" class="ws-gauge ${main ? "ws-gauge-main" : ""}" data-action="ws-select-area" data-area-id="${escapeHtml(id)}" aria-pressed="${selected}" aria-label="${escapeHtml(title)}: ${pct === null ? escapeHtml(label) : `${pct}%`}"><strong>${escapeHtml(title)}</strong><svg viewBox="0 0 300 170" role="img" aria-label="Escala de cero a cien">${main ? '<defs><linearGradient id="workspace-main-gradient"><stop stop-color="#d77e7c"/><stop offset=".5" stop-color="#eed28c"/><stop offset="1" stop-color="#8dc7a7"/></linearGradient></defs>' : ""}<path d="M 24 148 A 126 126 0 0 1 276 148" fill="none" stroke="${color}" stroke-width="9"/><g stroke="#8d9baa" stroke-width="1">${ticks}</g>${[0,25,50,75,100].map((n) => { const a = Math.PI * (1-n/100);return `<text x="${150+88*Math.cos(a)}" y="${153-88*Math.sin(a)}" text-anchor="middle">${n}</text>`; }).join("")}${pct === null ? "" : `<line x1="150" y1="148" x2="${x}" y2="${y}" stroke="#eef2f7" stroke-width="3"/><circle cx="150" cy="148" r="5" fill="#eef2f7"/>`}</svg><span class="ws-gauge-value">${pct === null ? escapeHtml(label) : `${pct}%`}</span><small>${pct === null ? "" : escapeHtml(label)}</small><small>${escapeHtml(detail)}</small></button>`;
}
