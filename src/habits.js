// Habits (config.habits): HaCasa learns from the last four weeks of the house's own history what you do at about this
// time and offers it as one tap in the line under the greeting: "Living room off? You usually do around 22:30".
// It never switches anything by itself. Everything is worked out in the browser from Home Assistant's recorder: no
// cloud, no AI service.
//
// How: for lights, switches, fans, input_booleans and covers the history is boiled down to the moments each one was
// turned on / off (opened / closed), cached in localStorage and refreshed every six hours. A suggestion stands when, on
// days of the same kind (workday or weekend), the same change happened within ±20 minutes of now on at least 60 % of
// those days and at least 5 times, the thing is not in that state now and nobody touched it in the last 20 minutes.
// Changes of one room that belong together are offered as one ("Living room off: 3 lights"). "Not today" hides one
// until tomorrow.
import { t, locale, timeOpts } from "./i18n.js";
import { unavailable } from "./util.js";
import { name } from "./model.js";

const DAYS = 28, WINDOW = 20, MIN_SHARE = 0.6, MIN_TIMES = 5, QUIET = 20;
const STORE = "hcn:habits", SKIP = "hcn:habits-skip";
const DOMAINS = ["light", "switch", "fan", "input_boolean", "cover"];
const target = (dom, st) => dom === "cover" ? (st === "open" ? "open" : st === "closed" ? "closed" : null) : (st === "on" ? "on" : st === "off" ? "off" : null);

/** the entities worth learning: those on the room pages (lights, plugs, fans, covers), not the hidden ones */
function candidates(p) {
  const ids = new Set();
  for (const r of p.rooms || []) for (const e of [...r.ents.lights, ...r.ents.switches, ...r.ents.fans, ...r.ents.covers]) if (DOMAINS.includes(e.id.split(".")[0])) ids.add(e.id);
  return [...ids];
}

let loading = null;
/** the learned changes: { at, ev: { id: [[minuteOfDay, dayIndex, weekend, state], …] } }, refreshed every 6 hours */
export function habitData(p) {
  let d = null; try { d = JSON.parse(localStorage.getItem(STORE) || "null"); } catch { }
  if ((!d || Date.now() - d.at > 6 * 3600000) && !loading) loading = learn(p).finally(() => { loading = null; });
  return d;
}
async function learn(p) {
  const ids = candidates(p); if (!ids.length) return;
  const start = new Date(Date.now() - DAYS * 86400000), ev = {}, seen = [];   // seen: entities the recorder keeps at all
  for (let i = 0; i < ids.length; i += 40) {   // in batches, so one call never gets too big
    let r; try { r = await p.hass.callWS({ type: "history/history_during_period", start_time: start.toISOString(), entity_ids: ids.slice(i, i + 40), minimal_response: true, no_attributes: true, significant_changes_only: false }); } catch { return; }
    for (const id of Object.keys(r || {})) seen.push(id);
    for (const [id, rows] of Object.entries(r || {})) {
      const dom = id.split(".")[0], out = []; let prev = null;
      for (const x of rows || []) {
        const st = target(dom, x.s), ts = (x.lc ?? x.lu) * 1000; if (!st || !ts) { prev = null; continue; }
        if (prev !== null && st !== prev) { const d = new Date(ts), wd = d.getDay(); out.push([d.getHours() * 60 + d.getMinutes(), Math.floor((ts - start) / 86400000), wd === 0 || wd === 6 ? 1 : 0, st]); }
        prev = st;
      }
      if (out.length >= MIN_TIMES) ev[id] = out;
    }
  }
  try { localStorage.setItem(STORE, JSON.stringify({ at: Date.now(), from: start.getTime(), ev, seen })); } catch { }
  p.requestUpdate?.();
}

/** for the settings: how many devices were learned, and how many have no history at all (left out of the recorder) */
export function habitStatus(p) {
  const d = habitData(p); if (!d) return null;
  const ids = candidates(p), learned = Object.keys(d.ev || {}).length, missing = ids.filter(id => !(d.seen || []).includes(id));
  return { learned, total: ids.length, missing, at: d.at };
}

/** days of the same kind in the learned span (workdays or weekend days) */
function dayCount(from, weekend) {
  let n = 0; for (let k = 0; k < DAYS; k++) { const wd = new Date(from + k * 86400000).getDay(); if ((wd === 0 || wd === 6) === !!weekend) n++; }
  return Math.max(1, n);
}
const minutesApart = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 1440 - d); };
const skipped = () => { try { const s = JSON.parse(localStorage.getItem(SKIP) || "{}"), today = new Date().toDateString(); return s.day === today ? new Set(s.keys) : new Set(); } catch { return new Set(); } };
export function skipToday(key) { const today = new Date().toDateString(), s = skipped(); s.add(key); try { localStorage.setItem(SKIP, JSON.stringify({ day: today, keys: [...s] })); } catch { } }

/** the suggestions for now: [{ key, room, state, ids, at, share }] */
export function habitSuggestions(p) {
  if (!p.config.habits) return [];
  const d = habitData(p); if (!d?.ev) return [];
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes(), wk = now.getDay() === 0 || now.getDay() === 6 ? 1 : 0, days = dayCount(d.from, wk), skip = skipped();
  const roomOf = id => (p.rooms || []).find(r => [...r.ents.lights, ...r.ents.switches, ...r.ents.fans, ...r.ents.covers].some(e => e.id === id));
  const found = [];
  for (const [id, evs] of Object.entries(d.ev)) {
    const s = p.hass.states[id]; if (!s || unavailable(s)) continue;
    const cur = target(id.split(".")[0], s.state); if (!cur) continue;
    if (Date.now() - new Date(s.last_changed) < QUIET * 60000) continue;   // just touched: they know what they want
    for (const want of id.startsWith("cover.") ? ["open", "closed"] : ["on", "off"]) {
      if (cur === want) continue;
      const hits = evs.filter(e => e[2] === wk && e[3] === want && minutesApart(e[0], m) <= WINDOW);
      const onDays = new Set(hits.map(e => e[1])).size;
      if (onDays < MIN_TIMES || onDays / days < MIN_SHARE) continue;
      const at = Math.round(hits.reduce((a, e) => a + e[0], 0) / hits.length);
      found.push({ id, want, at, share: onDays / days, room: roomOf(id) });
    }
  }
  // one suggestion per room and change
  const groups = new Map();
  for (const f of found) { const k = `${f.room?.id || "-"}:${f.id.split(".")[0] === "cover" ? "cover" : "power"}:${f.want}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  return [...groups.entries()].filter(([k]) => !skip.has(k)).map(([key, fs]) => ({ key, room: fs[0].room, state: fs[0].want, ids: fs.map(f => f.id), at: Math.round(fs.reduce((a, f) => a + f.at, 0) / fs.length), share: Math.max(...fs.map(f => f.share)) }))
    .sort((a, b) => b.share - a.share).slice(0, 2);
}

const hm = m => { const d = new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d.toLocaleTimeString(locale(), timeOpts()); };
/** the words for a suggestion: title ("Living room off?") and the reason ("usually around 22:30 · 3 lights") */
export function habitText(p, h) {
  const what = h.ids.length === 1 ? name(p.hass, { id: h.ids[0], state: p.hass.states[h.ids[0]] }) : h.room?.name || t("Thuis");
  const verb = { on: t("aan"), off: t("uit"), open: t("omhoog"), closed: t("omlaag") }[h.state];
  return { title: `${what} ${verb}?`, text: [t("meestal rond {t}", { t: hm(h.at) }), h.ids.length > 1 ? t("{n} apparaten", { n: h.ids.length }) : ""].filter(Boolean).join(" · ") };
}
/** carry a suggestion out */
export function habitDo(p, h) {
  const by = new Map(); for (const id of h.ids) { const dom = id.split(".")[0]; if (!by.has(dom)) by.set(dom, []); by.get(dom).push(id); }
  for (const [dom, ids] of by) {
    if (dom === "cover") p.call("cover", h.state === "open" ? "open_cover" : "close_cover", { entity_id: ids });
    else p.call(dom === "light" || dom === "switch" || dom === "fan" || dom === "input_boolean" ? dom : "homeassistant", h.state === "on" ? "turn_on" : "turn_off", { entity_id: ids });
  }
}
/** the line under the greeting: a tap asks "Do it" / "Not today" */
export function habitItems(p) {
  return habitSuggestions(p).map(h => { const tx = habitText(p, h);
    return { k: "habits", icon: "mdi:lightbulb-auto-outline", title: tx.title, text: tx.text, tap: () => p.openPopup({ type: "confirm", title: t("Gewoonte"), big: tx.title, sub: tx.text,
      okLabel: t("Doen"), ok: () => habitDo(p, h), alt: { label: t("Vandaag niet"), go: () => { skipToday(h.key); p.requestUpdate(); } } }) }; });
}
