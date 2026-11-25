// "Outside": the weather card for when the background photo already shows the weather and the block next to the greeting
// says how it feels (config.wxAnim = "outside"). It holds what is worth knowing and shown nowhere else, the most pressing
// first: an official warning (DWD), pollen while they fly, UV from 3, the air when it is poor; then today's high / low, the
// wind and sunrise / sunset. The sensors are found by their integration (dwd_weather_warnings, dwd_pollenflug, openuv, an
// "aqi" sensor); the settings can pick others.
import { html, nothing } from "lit";
import { t, locale, timeOpts } from "./i18n.js";
import { num, unavailable } from "./util.js";
import { pressDir, wxDays } from "./cards.js";
import { wxIcon, nightAt, nightCond } from "./sky.js";

const hm = d => d.toLocaleTimeString(locale(), timeOpts());
const st = (p, id) => (id && p.hass.states[id]) || null;
const ok = s => s && !unavailable(s) && s.state !== "unknown";
const reg = p => Object.values(p.hass.entities || {});
/** the first entity of an integration (optionally with a translation key) that has a state */
const byPlatform = (p, platform, tk) => reg(p).find(e => e.platform === platform && (!tk || e.translation_key === tk) && p.hass.states[e.entity_id])?.entity_id || null;

/** the sensors this card reads: the settings' choice, else what is found */
export function outsideSources(p) {
  const c = p.config || {}, hass = p.hass;
  const warn = c.outWarn || byPlatform(p, "dwd_weather_warnings", "current_warning_level")
    || Object.keys(hass.states).find(id => id.startsWith("sensor.") && hass.states[id].attributes.warning_count != null && !/vorwarn|advance|prewarn/.test(id)) || null;
  const pollen = c.outPollen?.length ? c.outPollen : reg(p).filter(e => e.platform === "dwd_pollenflug" && hass.states[e.entity_id]).map(e => e.entity_id);
  const uv = c.outUv || byPlatform(p, "openuv", "current_uv_index") || null;
  const aqi = c.outAqi || Object.keys(hass.states).filter(id => id.startsWith("sensor.") && hass.states[id].attributes.device_class === "aqi").sort((a, b) => /u_?s_/.test(b) - /u_?s_/.test(a))[0] || null;
  return { warn, pollen, uv, aqi };
}

/** the active warnings of a DWD-style sensor: [{ name, level, color, start, end, headline, text }], the worst first */
export function warnings(s) {
  if (!ok(s)) return [];
  const a = s.attributes, n = num(a.warning_count) ?? 0, out = [], when = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; };
  for (let i = 1; i <= n; i++) {
    const name = a[`warning_${i}_name`]; if (!name) continue;
    out.push({ name: name.charAt(0) + name.slice(1).toLowerCase(), level: num(a[`warning_${i}_level`]) ?? 1, color: a[`warning_${i}_color`] || "#ffeb3b",
      start: when(a[`warning_${i}_start`]), end: when(a[`warning_${i}_end`]), headline: a[`warning_${i}_headline`] || "", text: a[`warning_${i}_description`] || "" });
  }
  return out.sort((x, y) => y.level - x.level);
}
/** the pollen kinds flying today or tomorrow: [{ name, today, tomorrow }], the strongest first */
export function pollenToday(p, src) {
  return src.pollen.map(id => st(p, id)).filter(ok).map(s => ({ name: s.attributes.friendly_name || s.entity_id, today: num(s.state) ?? 0, tomorrow: num(s.attributes.state_tomorrow) ?? 0 }))
    .filter(x => x.today > 0 || x.tomorrow > 0).sort((x, y) => y.today - x.today || y.tomorrow - x.tomorrow);
}
/** UV and air quality as numbers (null when unknown); UV falls back to the weather's own index */
export function uvAqi(p, src, w) {
  const u = st(p, src.uv), q = st(p, src.aqi);
  return { uv: ok(u) ? num(u.state) : num(w?.attributes?.uv_index), aqi: ok(q) ? num(q.state) : null };
}
export const untilText = d => { const tom = new Date(); tom.setDate(tom.getDate() + 1); return d.toDateString() === new Date().toDateString() ? hm(d) : d.toDateString() === tom.toDateString() ? `${t("morgen")} ${hm(d)}` : d.toLocaleDateString(locale(), { weekday: "short" }) + " " + hm(d); };

export const POLLEN_WORD = v => v >= 2.5 ? t("hoog") : v >= 1.5 ? t("matig") : t("laag");
export const UV_WORD = v => v >= 11 ? t("extreem") : v >= 8 ? t("zeer hoog") : v >= 6 ? t("hoog") : v >= 3 ? t("matig") : t("laag");
export const AQI_WORD = v => v > 150 ? t("ongezond") : v > 100 ? t("bedenkelijk") : v > 50 ? t("matig") : t("goed");

/** the facts, most pressing first: { k, icon, label, value, hot } */
function facts(p, w, src) {
  const out = [], hass = p.hass, a = w?.attributes || {};
  // pollen: the strongest kind flying today
  const pol = src.pollen.map(id => st(p, id)).filter(ok).map(s => ({ s, v: num(s.state) ?? 0 })).sort((x, y) => y.v - x.v)[0];
  if (pol && pol.v > 0) out.push({ k: "pollen", icon: "mdi:flower-pollen-outline", label: t("Pollen"), value: `${pol.s.attributes.friendly_name || ""} · ${POLLEN_WORD(pol.v)}`, hot: pol.v >= 1.5 });
  const uvs = st(p, src.uv), uv = ok(uvs) ? num(uvs.state) : num(a.uv_index);
  if (uv != null && uv >= 3) out.push({ k: "uv", icon: "mdi:sun-wireless-outline", label: "UV", value: `${Math.round(uv)} · ${UV_WORD(uv)}`, hot: uv >= 6 });
  const aqs = st(p, src.aqi), aqi = ok(aqs) ? num(aqs.state) : null;
  if (aqi != null && aqi > 50) out.push({ k: "aqi", icon: "mdi:weather-dust", label: t("Luchtkwaliteit"), value: `${AQI_WORD(aqi)} · ${Math.round(aqi)}`, hot: aqi > 100 });
  const { today } = wxDays(p), hi = num(today?.temperature), lo = num(today?.templow);
  if (hi != null) out.push({ k: "today", icon: "mdi:thermometer", label: t("Vandaag"), value: `${Math.round(hi)}°${lo != null ? ` / ${Math.round(lo)}°` : ""}` });
  const ws = num(a.wind_speed), wg = num(a.wind_gust_speed), wu = a.wind_speed_unit || t("km/u");
  if (ws != null) out.push({ k: "wind", icon: "mdi:weather-windy", label: t("Wind"), value: `${Math.round(ws)}${wg != null && wg > ws + 4 ? ` · ${t("vlagen {n}", { n: Math.round(wg) })}` : ""} ${wu}` });
  const sun = hass.states["sun.sun"], rise = sun && new Date(sun.attributes.next_rising), set = sun && new Date(sun.attributes.next_setting);
  if (sun && !isNaN(rise) && !isNaN(set)) out.push({ k: "sun", icon: "mdi:weather-sunset", label: t("Zon ↑ ↓"), value: `${hm(rise)} · ${hm(set)}` });
  if (aqi != null && aqi <= 50) out.push({ k: "aqi", icon: "mdi:weather-dust", label: t("Luchtkwaliteit"), value: `${AQI_WORD(aqi)} · ${Math.round(aqi)}` });
  return out;
}

/** where in the weather popup each fact of the card is shown in full */
const FOCUS = { pollen: "pollen", uv: "kpi-uv", aqi: "kpi-aqi", today: "week", wind: "kpi-wind", sun: "kpi-rise" };

/** the active warnings as a line under the greeting: names and until when; a tap opens them in the weather popup */
export function warningItem(p) {
  const src = outsideSources(p), warn = warnings(st(p, src.warn)); if (!warn.length) return null;
  const until = warn.map(x => x.end).filter(Boolean).sort((x, y) => y - x)[0];
  return { k: "warnings", icon: "mdi:alert-outline", title: warn.map(x => x.name).join(` ${t("en")} `), text: until ? t("tot {t}", { t: untilText(until) }) : t("waarschuwing"), tap: () => p.openPopup({ type: "weather", focus: "warn" }) };
}

export function outsideCard(p, w) {
  const src = outsideSources(p), warn = warnings(st(p, src.warn)), list = facts(p, w, src).slice(0, 4);
  const top = warn[0], until = warn.map(x => x.end).filter(Boolean).sort((x, y) => y - x)[0];
  return html`<div class="card wxout" ${pressDir(p, { tap: () => p.openPopup({ type: "weather" }), hold: src.warn && warn.length ? () => p.moreInfo(src.warn) : null })}>
    <div class="i">${wxIcon(nightCond(w?.state || "", nightAt(p.hass)), 36)}</div>
    <div class="c">${t("Weerinfo")}</div>
    ${top ? html`<button class="owarn" style=${`--wc:${top.color}`} @click=${() => p.openPopup({ type: "weather", focus: "warn" })}><ha-icon icon="mdi:alert-outline"></ha-icon><span>${warn.map(x => x.name).join(` ${t("en")} `)}${until ? html`<em> · ${t("tot {t}", { t: untilText(until) })}</em>` : nothing}</span></button>` : nothing}
    <div class="ofacts">${list.map(f => html`<button class=${f.hot ? "hot" : ""} @click=${() => p.openPopup({ type: "weather", focus: FOCUS[f.k] })}><small>${f.label}</small><b>${f.value}</b></button>`)}</div>
  </div>`;
}

/** the warnings at the top of the weather popup: one strip each, with its time and the DWD text; a tap opens the sensor */
export function warnBlock(p, src) {
  const list = warnings(st(p, src.warn)); if (!list.length) return nothing;
  const span = x => [x.start && x.start > Date.now() ? t("vanaf {t}", { t: untilText(x.start) }) : "", x.end ? t("tot {t}", { t: untilText(x.end) }) : ""].filter(Boolean).join(" ");
  return html`<div class="pwarns" data-sec="warn">${list.map(x => html`<button class="pwarn" style=${`--wc:${x.color}`} @click=${() => p.moreInfo(src.warn)}>
    <ha-icon icon="mdi:alert-outline"></ha-icon><div><b>${x.name}</b>${span(x) ? html`<em> · ${span(x)}</em>` : nothing}${x.text ? html`<small>${x.text}</small>` : nothing}</div></button>`)}</div>`;
}

export const outsideStyles = `
  .popup .pwarns{display:flex;flex-direction:column;gap:6px;margin:4px 0 14px}
  .popup .pwarn{display:flex;gap:10px;align-items:flex-start;text-align:left;width:100%;padding:10px 12px;border-radius:var(--r-sm);font:inherit;cursor:pointer;
    color:color-mix(in srgb,var(--wc) 80%,#fff);background:color-mix(in srgb,var(--wc) 14%,transparent);border:1px solid color-mix(in srgb,var(--wc) 30%,transparent)}
  .popup .pwarn ha-icon{--mdc-icon-size:20px;flex:none;margin-top:1px}
  .popup .pwarn b{font-size:15px;font-weight:700}
  .popup .pwarn em{font-style:normal;font-size:13px;font-weight:500;opacity:.9}
  .popup .pwarn small{display:block;margin-top:3px;font-size:13px;font-weight:500;line-height:1.35;color:var(--fg-2)}
  .popup .pollen{display:grid;grid-template-columns:1fr auto auto;gap:6px 16px;font-size:14px;margin-top:8px}
  .popup .pollen span{color:var(--fg-2)}
  .popup .pollen b,.popup .pollen em{font-weight:600;font-style:normal;text-align:right}
  .popup .pollen em{color:var(--fg-3)}
  .popup .pollen .hot{color:#ffd27a}
  .card.wxout{grid-template-rows:max-content 1fr max-content max-content;grid-template-areas:"i c" ". ." "w w" "f f"}
  .card.wxout .i{display:flex;align-items:center}   /* the same drawn weather icons as next to the greeting */
  .card.wxout:has(.owarn){grid-template-rows:max-content 0 max-content max-content}
  .card.wxout:has(.owarn) .owarn{margin:8px 0 8px}
  .card.wxout:has(.owarn) .ofacts{row-gap:4px}
  .card.wxout .owarn{grid-area:w;display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:7px 10px;border-radius:10px;font-size:13px;font-weight:600;
    color:color-mix(in srgb,var(--wc) 80%,#fff);background:color-mix(in srgb,var(--wc) 16%,transparent);border:1px solid color-mix(in srgb,var(--wc) 30%,transparent);min-width:0}
  .card.wxout .owarn ha-icon{--mdc-icon-size:18px;flex:none}
  .card.wxout .owarn span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card.wxout .owarn em{font-style:normal;font-weight:500;opacity:.85}
  .card.wxout .ofacts{grid-area:f;display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;min-width:0}
  .card.wxout .ofacts>button{min-width:0;text-align:left;font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;border-radius:6px}
  .card.wxout .ofacts>button:active{background:rgba(255,255,255,.08)}
  .card.wxout button.owarn{font:inherit;font-size:13px;font-weight:600;cursor:pointer;width:100%;text-align:left}
  .popup [data-sec].secflash{animation:secFlash 1.6s ease}
  @keyframes secFlash{0%,100%{box-shadow:none}20%,60%{box-shadow:0 0 0 2px rgba(255,210,122,.7)}}
  .card.wxout .ofacts small{display:block;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--fg-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card.wxout .ofacts b{display:block;font-size:14px;font-weight:600;color:var(--fg);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .card.wxout .ofacts .hot b{color:#ffd27a}
  @media (max-width:900px){   /* the small phone card: one column, fewer facts */
    .card.wxout .owarn{font-size:12px;padding:5px 8px;gap:6px;margin-bottom:6px}
    .card.wxout .owarn em{display:none}
    .card.wxout .ofacts{grid-template-columns:1fr;gap:4px}
    .card.wxout .ofacts>*:nth-child(n+3),.card.wxout .owarn~.ofacts>*:nth-child(n+2){display:none}
    .card.wxout .ofacts small{font-size:9px;letter-spacing:1px}
    .card.wxout .ofacts b{font-size:12px}
  }
`;
