// "Tijdreis" (time travel): the last 24 hours of the house as a timeline, in a popup (More → Time travel). One lane per
// room — light on (yellow), a door or window open (blue, below), media playing (violet, above), motion (ticks) — and
// one lane per person (green while at home). Tapping or dragging the timeline moves a cursor; under it the house at
// that moment (lights on, open, who was home) and what happened up to then, newest first. Tapping an event moves the
// cursor there. Built from Home Assistant's history, loaded when the popup opens and again after two minutes.
import { html, nothing } from "lit";
import { t, locale, timeOpts } from "./i18n.js";
import { name } from "./model.js";

const SPAN = 24 * 3600000;
const hm = ms => new Date(ms).toLocaleTimeString(locale(), timeOpts());

/** periods with isOn(state) within [t0, t1] from history rows: [{a, b}] in ms */
function periods(rows, t0, t1, isOn) {
  const out = []; let cur = null;
  for (const r of rows) { const at = Math.max(t0, r.t), on = isOn(r.s);
    if (on && cur == null) cur = at; else if (!on && cur != null) { out.push({ a: cur, b: at }); cur = null; } }
  if (cur != null) out.push({ a: cur, b: t1 });
  return out.filter(q => q.b > q.a);
}
const inside = (list, at) => list.some(q => q.a <= at && at < q.b);

async function load(p) {
  const to = Date.now(), from = to - SPAN, tl = p._tl;
  const rooms = p.rooms.map(r => ({ r, lights: r.ents.lights, open: [...r.ents.doors, ...r.ents.windows], media: r.ents.media, motion: r.ents.motion }));
  const people = p.home?.persons || [];
  const ids = [...new Set([...rooms.flatMap(x => [...x.lights, ...x.open, ...x.media, ...x.motion].map(e => e.id)), ...people.map(s => s.entity_id)])];
  let hist = {};
  try { hist = await p.hass.callWS({ type: "history/history_during_period", start_time: new Date(from).toISOString(), end_time: new Date(to).toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false }) || {}; }
  catch (e) { console.warn("[hacasa-nova] time travel: no history", e); }
  const rows = id => (hist[id] || []).map(x => ({ t: (x.lu ?? x.lc) * 1000, s: x.s })).sort((a, b) => a.t - b.t);
  const events = [], lanes = [];
  // kinds that exist here but have no history at all: the recorder leaves them out (recorder include / exclude)
  const none = list => list.length > 0 && !list.some(id => hist[id]?.length);
  const missing = { light: none(rooms.flatMap(x => x.lights.map(e => e.id))), person: none(people.map(s => s.entity_id)), media: none(rooms.flatMap(x => x.media.map(e => e.id))) };
  // changes of one entity as events (the first row is the state at the start, not a change)
  const changes = (id, fn) => { const r = rows(id); for (let i = 1; i < r.length; i++) if (r[i].s !== r[i - 1].s) { const ev = fn(r[i].s, r[i - 1].s); if (ev) events.push({ t: r[i].t, ...ev }); } };
  for (const { r, lights, open, media, motion } of rooms) {
    const lane = { label: r.name, light: [], open: [], media: [], motion: [], each: { light: [], open: [] } };
    for (const e of lights) { const q = periods(rows(e.id), from, to, s => s === "on"); lane.each.light.push(q); lane.light.push(...q);
      const n = name(p.hass, e);   // the whole name: lights of several rooms share a row
      changes(e.id, s => s === "on" ? { icon: "mdi:lightbulb-on-outline", k: "light", g: "on", n, fmt: x => t("{n} aan", { n: x }) } : s === "off" ? { icon: "mdi:lightbulb-outline", k: "off", g: "off", n, fmt: x => t("{n} uit", { n: x }) } : null); }
    for (const e of open) { const q = periods(rows(e.id), from, to, s => s === "on"); lane.each.open.push(q); lane.open.push(...q);
      const n = name(p.hass, e);
      changes(e.id, s => s === "on" ? { icon: "mdi:door-open", k: "open", g: "open", n, fmt: x => t("{n} geopend", { n: x }) } : s === "off" ? { icon: "mdi:door-closed", k: "off", g: "shut", n, fmt: x => t("{n} gesloten", { n: x }) } : null); }
    for (const e of media) { lane.media.push(...periods(rows(e.id), from, to, s => s === "playing"));
      changes(e.id, s => s === "playing" ? { icon: "mdi:music", k: "media", g: "media", n: name(p.hass, e), fmt: x => t("{n} speelt", { n: x }) } : null); }
    // motion: ticks on the lane; in the list once per room and ten minutes, or the list is nothing but motion
    let last = 0;
    const ticks = motion.flatMap(e => periods(rows(e.id), from, to, s => s === "on").map(q => q.a)).sort((a, b) => a - b);
    for (const at of ticks) { lane.motion.push(at); if (at - last > 600000 && at > from) events.push({ t: at, icon: "mdi:motion-sensor", k: "motion", g: "motion", n: r.name, fmt: x => `${t("Beweging")}: ${x}` }); last = at; }
    if (lane.light.length || lane.open.length || lane.media.length || lane.motion.length) lanes.push(lane);
  }
  for (const s of missing.person ? [] : people) {
    const n = s.attributes.friendly_name || s.entity_id, home = periods(rows(s.entity_id), from, to, x => x === "home");
    lanes.push({ label: n, person: true, home, light: [], open: [], media: [], motion: [] });
    changes(s.entity_id, (x, prev) => x === "home" ? { icon: "mdi:home-import-outline", k: "person", g: "in", n, fmt: v => t("{n} komt thuis", { n: v }) } : prev === "home" ? { icon: "mdi:home-export-outline", k: "person", g: "out", n, fmt: v => t("{n} vertrekt", { n: v }) } : null);
  }
  // one row for what happened together: the same kind of change within two minutes ("Back door, Window opened")
  events.sort((a, b) => b.t - a.t);
  const rowsOut = [];
  for (const e of events) { const g = rowsOut.find(x => x.g === e.g && x.t0 - e.t <= 120000 && x.t - e.t <= 600000);
    if (g) { g.t0 = e.t; if (!g.names.includes(e.n)) g.names.push(e.n); } else rowsOut.push({ ...e, t0: e.t, names: [e.n] }); }
  for (const x of rowsOut) { x.text = x.fmt(x.names.reverse().join(", ")); }
  rowsOut.sort((a, b) => b.t - a.t);
  p._tl = { from, to, lanes, events: rowsOut, missing, at: tl?.at && tl.at > from ? Math.min(tl.at, to) : to, loaded: Date.now() };
  p.requestUpdate();
}

/** the popup */
export function timelinePopup(p, pop, ui) {
  const tl = p._tl;
  if (!tl?.loaded || Date.now() - tl.loaded > 120000) { if (!p._tlLoading) { p._tlLoading = true; load(p).finally(() => { p._tlLoading = false; }); } }
  if (!tl?.lanes) return ui.wrap(t("Tijdreis"), t("Laatste 24 uur"), t("Laden…"), nothing, "wide");
  const { from, to, lanes, events, at, missing = {} } = tl, pc = v => `${((v - from) / (to - from)) * 100}%`, w = q => `${((q.b - q.a) / (to - from)) * 100}%`;
  // drag or tap anywhere on the lanes to move the cursor
  const move = ev => { const tr = ev.currentTarget.querySelector(".tlt"); if (!tr) return; const b = tr.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (ev.clientX - b.left) / b.width)); p._tl = { ...p._tl, at: from + f * (to - from) };
    if (!p._tlRaf) p._tlRaf = requestAnimationFrame(() => { p._tlRaf = 0; p.requestUpdate(); }); };
  const down = ev => { ev.currentTarget.setPointerCapture?.(ev.pointerId); move(ev); };
  const drag = ev => { if (ev.buttons || ev.pointerType === "touch") move(ev); };
  // hour marks every six hours, and "now" at the end
  const marks = []; { const d = new Date(from); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
    for (; d.getTime() < to - 3600000; d.setHours(d.getHours() + 1)) if (d.getHours() % 6 === 0) marks.push(d.getTime()); }
  // the house at the cursor
  const count = k => lanes.reduce((n, l) => n + (l.each?.[k] || []).filter(q => inside(q, at)).length, 0), lit = count("light"), open = count("open");
  const home = lanes.filter(l => l.person && inside(l.home, at)).map(l => l.label);
  const past = events.filter(e => e.t <= at).slice(0, 40), isNow = to - at < 60000;
  const when = new Date(at).toDateString() === new Date().toDateString() ? t("Om {t}", { t: hm(at) }) : `${t("Gisteren")}, ${hm(at)}`;
  const gone = [missing.light && t("Lampen"), missing.person && t("Personen"), missing.media && t("Media")].filter(Boolean);
  const chip = (icon, text, on) => html`<span class=${on ? "tlc on" : "tlc"}><ha-icon icon=${icon}></ha-icon>${text}</span>`;
  return ui.wrap(t("Tijdreis"), t("Laatste 24 uur"), t("tik of sleep in de tijdlijn"), html`
    <div class="tlg" @pointerdown=${down} @pointermove=${drag}>
      <div class="tla"><span></span><div class="tlt">${marks.map(m => html`<i style="left:${pc(m)}">${hm(m)}</i>`)}${isNow ? nothing : html`<i class="now">${t("Nu")}</i>`}<b class="tlk" style="left:min(${pc(at)}, calc(100% - 22px))">${isNow ? t("Nu") : hm(at)}</b></div></div>
      ${lanes.map(l => html`<div class=${l.person ? "tll person" : "tll"}><span class="tln">${l.label}</span><div class="tlt">
        ${marks.map(m => html`<s style="left:${pc(m)}"></s>`)}
        ${(l.home || []).map(q => html`<em class="h" style="left:${pc(q.a)};width:${w(q)}"></em>`)}
        ${l.light.map(q => html`<em class="l" style="left:${pc(q.a)};width:${w(q)}"></em>`)}
        ${l.media.map(q => html`<em class="m" style="left:${pc(q.a)};width:${w(q)}"></em>`)}
        ${l.open.map(q => html`<em class="o" style="left:${pc(q.a)};width:${w(q)}"></em>`)}
        ${l.motion.map(v => html`<u style="left:${pc(v)}"></u>`)}
        <b class="tlx" style="left:${pc(at)}"></b></div></div>`)}
      ${gone.length ? html`<div class="tlmiss"><ha-icon icon="mdi:information-outline"></ha-icon>${t("{n} neemt Home Assistant niet op (recorder), daarom ontbreken ze hier", { n: gone.join(", ") })}</div>` : nothing}
      <div class="tlleg">${missing.light ? nothing : html`<span class="l">${t("Lampen")}</span>`}<span class="o">${t("Open")}</span>${missing.media ? nothing : html`<span class="m">${t("Media")}</span>`}<span class="mo">${t("Beweging")}</span>${missing.person ? nothing : html`<span class="h">${t("Thuis")}</span>`}</div>
    </div>
    <div class="tlnow"><b>${isNow ? t("Nu") : when}</b>
      ${missing.light ? nothing : chip("mdi:lightbulb-on-outline", `${lit} ${t("Lampen")}`, lit)}${chip("mdi:door-open", `${open} ${t("open")}`, open)}${missing.person ? nothing : chip("mdi:home-account", home.length ? home.join(", ") : t("Niemand thuis"), home.length)}
      ${isNow ? nothing : html`<button class="tlb" @click=${() => { p._tl = { ...p._tl, at: to }; p.requestUpdate(); }}>${t("Nu")}</button>`}</div>
    <ul class="tlev">${past.length ? past.map(e => html`<li class=${e.k} @click=${() => { p._tl = { ...p._tl, at: e.t }; p.requestUpdate(); }}><time>${hm(e.t)}</time><span class="di"><ha-icon icon=${e.icon}></ha-icon></span><span>${e.text}</span></li>`) : html`<li class="none">${t("Nog niets gebeurd")}</li>`}</ul>`, "wide");
}

export const travelStyles = `
  .popup .tlg{margin-top:18px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:ew-resize}
  .popup .tla,.popup .tll{display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:center}
  .popup .tla .tlt{position:relative;height:30px}
  .popup .tla i{position:absolute;bottom:4px;transform:translateX(-50%);font-style:normal;font-size:11px;color:var(--fg-3);letter-spacing:.5px}
  .popup .tla i.now{left:auto;right:0;transform:none}
  .popup .tla .tlk{position:absolute;top:0;transform:translateX(-50%);padding:3px 8px;border-radius:999px;background:#fff;color:#1d1d1f;font-size:11px;font-weight:700;white-space:nowrap;z-index:2}
  .popup .tll{margin-top:6px}
  .popup .tln{font-size:13px;color:var(--fg-2, rgba(255,255,255,.8));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .popup .tll .tlt{position:relative;height:26px;border-radius:8px;background:rgba(255,255,255,.06);overflow:hidden}
  .popup .tll.person .tlt{height:14px;border-radius:7px}
  .popup .tlt s{position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.08)}
  .popup .tlt em{position:absolute;top:0;bottom:0;min-width:2px}
  .popup .tlt em.l{background:#f5c451;opacity:.85}
  .popup .tlt em.h{background:#5fd38d;opacity:.75}
  .popup .tlt em.o{top:auto;height:6px;background:#6ab8ff}
  .popup .tlt em.m{bottom:auto;height:6px;background:#b48cff}
  .popup .tlt u{position:absolute;top:30%;bottom:30%;width:2px;margin-left:-1px;background:rgba(255,255,255,.6);border-radius:1px}
  .popup .tlt .tlx{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 6px rgba(0,0,0,.5);z-index:2}
  .popup .tlleg{display:flex;flex-wrap:wrap;gap:6px 16px;margin:12px 0 0 132px;font-size:12px;color:var(--fg-3)}
  .popup .tlleg span::before{content:"";display:inline-block;width:12px;height:8px;border-radius:3px;margin-right:6px;vertical-align:1px}
  .popup .tlleg .l::before{background:#f5c451}.popup .tlleg .o::before{background:#6ab8ff}.popup .tlleg .m::before{background:#b48cff}.popup .tlleg .h::before{background:#5fd38d}
  .popup .tlleg .mo::before{width:2px;height:10px;background:rgba(255,255,255,.7)}
  .popup .tlmiss{display:flex;gap:8px;align-items:center;margin:12px 0 0 132px;font-size:12px;color:var(--fg-3);--mdc-icon-size:16px}
  .popup .tlmiss ha-icon{width:16px;height:16px;--mdc-icon-size:16px;flex:none}
  .popup .tlnow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,.1)}
  .popup .tlnow>b{font-size:17px;margin-right:6px}
  .popup .tlc{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.08);font-size:13px;color:var(--fg-3);--mdc-icon-size:16px}
  .popup .tlc ha-icon,.popup ul.tlev .di ha-icon{width:16px;height:16px;--mdc-icon-size:16px;display:grid;place-items:center}
  .popup .tlc.on{background:rgba(255,255,255,.16);color:#fff}
  .popup .tlb{margin-left:auto;height:34px;padding:0 16px;border:0;border-radius:999px;background:rgba(255,255,255,.9);color:#1d1d1f;font:inherit;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;cursor:pointer}
  .popup ul.tlev{list-style:none;margin:10px 0 0;padding:0}
  .popup ul.tlev li{display:grid;grid-template-columns:52px 30px 1fr;gap:10px;align-items:center;margin:0;padding:7px 6px;background:none;border:0;border-top:1px solid rgba(255,255,255,.06);font-size:14px;line-height:1.35;cursor:pointer;border-radius:0}
  .popup ul.tlev li:first-child{border-top:0}
  .popup ul.tlev li:hover{background:rgba(255,255,255,.05);border-radius:8px}
  .popup ul.tlev time{font-size:13px;color:var(--fg-3);font-variant-numeric:tabular-nums}
  .popup ul.tlev .di{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.08);--mdc-icon-size:16px}
  .popup ul.tlev li.light .di{color:#f5c451}.popup ul.tlev li.open .di{color:#6ab8ff}.popup ul.tlev li.media .di{color:#b48cff}.popup ul.tlev li.person .di{color:#5fd38d}
  .popup ul.tlev li.none{display:block;color:var(--fg-3);cursor:default}
  @media (max-width:900px){
    .popup .tla,.popup .tll{grid-template-columns:78px 1fr;gap:8px}
    .popup .tln{font-size:12px}
    .popup .tlleg,.popup .tlmiss{margin-left:0}
  }
`;
