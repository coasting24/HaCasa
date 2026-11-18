// "Dagboek" (house diary): a short story of a day, told from Home Assistant's history — who came and went, the first and
// the last light, how often the doors opened, which room was the busiest, what the appliances did and how much power it
// took. The tone follows Persoonlijkheid (quips.js): funny, funny without swearing, or plain when that is off. A card on
// the home page (Add card → Diary) shows the opening line; its popup tells the whole day and flips back up to 7 days.
// German and English sentences (like the quips); other panel languages get English. Loaded on demand, cached per day,
// today again after ten minutes.
import { html, nothing } from "lit";
import { t, tn, getLang, locale, timeOpts } from "./i18n.js";
import { num } from "./util.js";
import { name, deviceName } from "./model.js";
import { pressDir, ico, cardCfg, applianceIcon } from "./cards.js";

const ON = new Set(["on", "open", "home", "playing"]);
const dayStart = off => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - off); return d; };
const hm = ms => new Date(ms).toLocaleTimeString(locale(), timeOpts());
const durText = (min, lang) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return lang === "de" ? (h ? `${h} Std.${m ? ` ${m} Min.` : ""}` : `${m} Min.`) : (h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`); };

/** periods an entity was "on" (or above a power threshold) within [t0, t1]: [{a, b}] in ms */
function periods(rows, t0, t1, isOn) {
  const out = []; let cur = null;
  for (const r of rows) { const tt = Math.max(t0, (r.lu ?? r.lc) * 1000), on = isOn(r.s);
    if (on && cur == null) cur = tt; else if (!on && cur != null) { out.push({ a: cur, b: tt }); cur = null; } }
  if (cur != null) out.push({ a: cur, b: t1 });
  return out;
}

/** the facts of one day from the history (null while loading) */
export async function loadDiary(p, off) {
  const c = p._diary || (p._diary = {}), hit = c[off];
  if (hit && (off > 0 || Date.now() - hit.at < 600000)) return hit;
  const h = p.home, t0 = dayStart(off).getTime(), t1 = off ? t0 + 86400000 : Date.now();
  const people = h.persons || [], lights = h.lights || [], doors = h.doors || [], windows = h.windows || [];
  const motions = p.rooms.flatMap(r => r.ents.motion.map(e => ({ e, r })));
  const apps = p.rooms.flatMap(r => r.ents.appliances).filter(a => a.power && !a.plain).map(a => ({ a, name: cardCfg(p, a.id).name || deviceName(p.hass, a.device), thr: cardCfg(p, a.id).threshold ?? 5 }));
  const ids = [...new Set([...people.map(s => s.entity_id), ...lights.map(e => e.id), ...doors.map(e => e.id), ...windows.map(e => e.id), ...motions.map(x => x.e.id), ...apps.map(x => x.a.power.id)])];
  let hist = {};
  try { hist = await p.hass.callWS({ type: "history/history_during_period", start_time: new Date(t0).toISOString(), end_time: new Date(t1).toISOString(), entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false }) || {}; }
  catch (e) { console.warn("[hacasa-nova] diary: no history", e); }
  const rows = id => hist[id] || [];
  const facts = { off, t0, t1 };
  // people: arrivals and departures
  facts.people = people.map(s => { const r = rows(s.entity_id), ch = []; let prev = r[0]?.s;
    for (const x of r.slice(1)) { if (x.s === prev) continue; if (x.s === "home") ch.push({ k: "in", t: (x.lu ?? x.lc) * 1000 }); else if (prev === "home") ch.push({ k: "out", t: (x.lu ?? x.lc) * 1000 }); prev = x.s; }
    return { name: s.attributes.friendly_name || s.entity_id, ch, wasHome: r.some(x => x.s === "home") }; });
  // lights: first on after 5 o'clock, last off, total light time, the light that was on longest
  const lp = lights.map(e => ({ e, p: periods(rows(e.id), t0, t1, s => ON.has(s)) }));
  const morning = t0 + 5 * 3600000, ons = lp.flatMap(x => x.p.map(q => q.a)).filter(v => v >= morning).sort((a, b) => a - b);
  const offs = lp.flatMap(x => x.p.map(q => q.b)).filter(v => v < t1 - 60000).sort((a, b) => b - a);
  const longest = lp.map(x => ({ e: x.e, min: x.p.reduce((n, q) => n + (q.b - q.a) / 60000, 0) })).sort((a, b) => b.min - a.min)[0];
  facts.lights = { first: ons[0], last: offs[0], hours: lp.reduce((n, x) => n + x.p.reduce((m, q) => m + (q.b - q.a), 0), 0) / 3600000, top: longest?.min > 5 ? { name: name(p.hass, longest.e), min: longest.min } : null };
  // doors and windows: how often they opened
  const opens = list => list.map(e => ({ name: name(p.hass, e), n: periods(rows(e.id), t0, t1, s => ON.has(s)).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  facts.doors = opens(doors); facts.windows = opens(windows);
  // motion: the busiest room
  const mot = {}; for (const { e, r } of motions) mot[r.name] = (mot[r.name] || 0) + periods(rows(e.id), t0, t1, s => s === "on").length;
  const busy = Object.entries(mot).sort((a, b) => b[1] - a[1])[0]; facts.busiest = busy?.[1] ? { room: busy[0], n: busy[1] } : null;
  // appliances: runs above their threshold for more than five minutes
  // appliances: only household appliances (an operation state, WashData, or a washer / dryer / dishwasher / coffee
  // maker / oven / microwave by name), each run above its threshold for more than five minutes. A plug that is on all
  // day or cycles all the time (a fridge, a computer) is no news; a plug whose kind already has a smart twin (the
  // washer's plug next to its WashData device) is left out, so nothing is told twice.
  const KIND = n => applianceIcon(n).replace("mdi:", ""), REAL = new Set(["washing-machine", "tumble-dryer", "dishwasher", "coffee-maker", "stove", "microwave"]);
  const all = apps.map(x => { const runs = periods(rows(x.a.power.id), t0, t1, s => (num(s) ?? 0) > x.thr).filter(q => q.b - q.a > 300000);
    return { name: x.name, kind: KIND(x.name), smart: !!(x.a.op || x.a.wd), n: runs.length, min: runs.reduce((n, q) => n + (q.b - q.a) / 60000, 0), end: runs.at(-1)?.b }; });
  const smartKinds = new Set(all.filter(x => x.smart).map(x => x.kind));
  facts.apps = all.filter(x => x.n && (x.smart || REAL.has(x.kind)) && (x.smart || !smartKinds.has(x.kind)) && x.min < 12 * 60 && x.n <= 10);
  // energy: today's sensor, or the day's change from the statistics
  const en = h.energy?.today;
  if (en && !off) facts.kwh = num(en.state);
  else if (en) try { const r = await p.hass.callWS({ type: "recorder/statistics_during_period", start_time: new Date(t0).toISOString(), end_time: new Date(t1).toISOString(), statistic_ids: [en.entity_id], period: "day", types: ["change"] });
    facts.kwh = r?.[en.entity_id]?.[0]?.change ?? null; } catch { facts.kwh = null; }
  facts.at = Date.now(); c[off] = facts; return facts;
}

// sentences: { key: { plain, funny, mild } }, each a function of the fact; null = nothing to say
const S = {
  de: {
    firstLight: f => ({ plain: `Das erste Licht ging um ${hm(f)} an.`, funny: `Um ${hm(f)} ging das erste Licht an. Jemand war früh wach.`, mild: `Um ${hm(f)} ging das erste Licht an. Jemand war früh wach.` }),
    left: (n, at) => ({ plain: `${n} ging um ${hm(at)} aus dem Haus.`, funny: `${n} hat um ${hm(at)} die Flucht ergriffen.`, mild: `${n} hat sich um ${hm(at)} auf den Weg gemacht.` }),
    came: (n, at) => ({ plain: `${n} kam um ${hm(at)} nach Hause.`, funny: `Um ${hm(at)} war ${n} wieder da. Das Sofa hat gewartet.`, mild: `Um ${hm(at)} war ${n} wieder da. Das Sofa hat gewartet.` }),
    stayed: n => ({ plain: `${n} war den ganzen Tag zuhause.`, funny: `${n} hat das Haus den ganzen Tag nicht verlassen. Respekt oder Sorge?`, mild: `${n} hat das Haus den ganzen Tag nicht verlassen. Gemütlich.` }),
    leftMany: (ns, a, b) => ({ plain: `Zwischen ${hm(a)} und ${hm(b)} gingen ${ns} aus dem Haus.`, funny: `Zwischen ${hm(a)} und ${hm(b)} haben sich ${ns} nacheinander davongemacht.`, mild: `Zwischen ${hm(a)} und ${hm(b)} haben sich ${ns} auf den Weg gemacht.` }),
    cameMany: (ns, a, b) => ({ plain: `Zwischen ${hm(a)} und ${hm(b)} kamen ${ns} nach Hause.`, funny: `Zwischen ${hm(a)} und ${hm(b)} trudelten ${ns} wieder ein. Das Sofa ist ausgebucht.`, mild: `Zwischen ${hm(a)} und ${hm(b)} kamen ${ns} wieder heim.` }),
    door: (n, c) => ({ plain: `${n} ging ${c}-mal auf.`, funny: `${n} ging ${c}-mal auf. Durchgangsverkehr wie am Bahnhof.`, mild: `${n} ging ${c}-mal auf. Ganz schön was los.` }),
    windows: c => ({ plain: `Fenster wurden ${c}-mal geöffnet.`, funny: `${c}-mal Fenster auf. Frische Luft, frische Heizkosten.`, mild: `${c}-mal Fenster auf. Frische Luft für alle.` }),
    busiest: (r, c) => c > 99 ? { plain: `Am meisten los: ${r}.`, funny: `Hotspot des Tages: ${r}. Da war ständig was los.`, mild: `Hotspot des Tages: ${r}. Da war ständig was los.` } : { plain: `Am meisten los: ${r}, ${c} Bewegungen.`, funny: `Hotspot des Tages: ${r} mit ${c} Bewegungen.`, mild: `Hotspot des Tages: ${r} mit ${c} Bewegungen.` },
    app: (n, c, d, kind) => { const x = `${c === 1 ? "einmal" : `${c}-mal`}, ${d}`;
      const k = { "washing-machine": ["Die Wäsche ist durch", "Frische Wäsche"], dishwasher: ["Das Geschirr ist sauber", "Spülen erledigt"], "tumble-dryer": ["Alles trocken", "Der Trockner hat's warm gemacht"], "coffee-maker": ["Kaffee gab es", "Koffein-Nachschub"] }[kind] || ["Erledigt", "Gelaufen"];
      return { plain: `${n} lief ${x}.`, funny: `${k[0]}: ${n} lief ${x}. Bitte ausräumen nicht vergessen.`, mild: `${k[1]}: ${n} lief ${x}.` }; },
    apps: list => ({ plain: `Geräte: ${list}.`, funny: `Die Maschinen haben geliefert: ${list}.`, mild: `Fleißige Helfer heute: ${list}.` }),
    lightTop: (n, d) => ({ plain: `Am längsten brannte ${n}: ${d}.`, funny: `${n} hat ${d} durchgeleuchtet. Rekord.`, mild: `${n} hat ${d} durchgeleuchtet. Rekord.` }),
    kwh: k => ({ plain: `Verbraucht wurden ${k} kWh.`, funny: k > 15 ? `${k} kWh verbraucht. Der Stromzähler hat Muskelkater.` : `${k} kWh verbraucht. Sparsam, sehr sparsam.`, mild: k > 15 ? `${k} kWh verbraucht. Der Stromzähler hatte viel zu tun.` : `${k} kWh verbraucht. Schön sparsam.` }),
    lastLight: f => ({ plain: `Das letzte Licht ging um ${hm(f)} aus.`, funny: `Um ${hm(f)} ging das letzte Licht aus. Feierabend.`, mild: `Um ${hm(f)} ging das letzte Licht aus. Feierabend.` }),
    quiet: () => ({ plain: "Ein ruhiger Tag, es ist nichts Besonderes passiert.", funny: "Nichts passiert. Gar nichts. Das Haus hat sich zu Tode gelangweilt.", mild: "Nichts passiert. Das Haus hatte einen ruhigen Tag." }),
  },
  en: {
    firstLight: f => ({ plain: `The first light came on at ${hm(f)}.`, funny: `At ${hm(f)} the first light came on. Someone was up early.`, mild: `At ${hm(f)} the first light came on. Someone was up early.` }),
    left: (n, at) => ({ plain: `${n} left the house at ${hm(at)}.`, funny: `${n} made a run for it at ${hm(at)}.`, mild: `${n} headed out at ${hm(at)}.` }),
    came: (n, at) => ({ plain: `${n} came home at ${hm(at)}.`, funny: `${n} was back at ${hm(at)}. The sofa had been waiting.`, mild: `${n} was back at ${hm(at)}. The sofa had been waiting.` }),
    stayed: n => ({ plain: `${n} was home all day.`, funny: `${n} didn't leave the house all day. Respect or concern?`, mild: `${n} didn't leave the house all day. Cosy.` }),
    leftMany: (ns, a, b) => ({ plain: `Between ${hm(a)} and ${hm(b)}, ${ns} left the house.`, funny: `Between ${hm(a)} and ${hm(b)}, ${ns} slipped out one after another.`, mild: `Between ${hm(a)} and ${hm(b)}, ${ns} headed out.` }),
    cameMany: (ns, a, b) => ({ plain: `Between ${hm(a)} and ${hm(b)}, ${ns} came home.`, funny: `Between ${hm(a)} and ${hm(b)}, ${ns} trickled back in. The sofa is fully booked.`, mild: `Between ${hm(a)} and ${hm(b)}, ${ns} came back home.` }),
    door: (n, c) => ({ plain: `${n} opened ${c} times.`, funny: `${n} opened ${c} times. Busier than a train station.`, mild: `${n} opened ${c} times. Quite the traffic.` }),
    windows: c => ({ plain: `Windows were opened ${c} times.`, funny: `Windows open ${c} times. Fresh air, fresh heating bills.`, mild: `Windows open ${c} times. Fresh air for everyone.` }),
    busiest: (r, c) => c > 99 ? { plain: `Busiest room: ${r}.`, funny: `Hotspot of the day: ${r}. Something was always going on.`, mild: `Hotspot of the day: ${r}. Something was always going on.` } : { plain: `Busiest room: ${r}, ${c} motions.`, funny: `Hotspot of the day: ${r} with ${c} motions.`, mild: `Hotspot of the day: ${r} with ${c} motions.` },
    app: (n, c, d, kind) => { const x = `${c === 1 ? "once" : `${c} times`}, ${d}`;
      const k = { "washing-machine": ["The laundry is done", "Fresh laundry"], dishwasher: ["The dishes are clean", "Dishes done"], "tumble-dryer": ["Everything's dry", "The dryer warmed things up"], "coffee-maker": ["There was coffee", "Caffeine refill"] }[kind] || ["Done", "It ran"];
      return { plain: `${n} ran ${x}.`, funny: `${k[0]}: ${n} ran ${x}. Don't forget to empty it.`, mild: `${k[1]}: ${n} ran ${x}.` }; },
    apps: list => ({ plain: `Appliances: ${list}.`, funny: `The machines delivered: ${list}.`, mild: `Busy helpers today: ${list}.` }),
    lightTop: (n, d) => ({ plain: `${n} was on the longest: ${d}.`, funny: `${n} shone for ${d}. A record.`, mild: `${n} shone for ${d}. A record.` }),
    kwh: k => ({ plain: `${k} kWh were used.`, funny: k > 15 ? `${k} kWh used. The meter has sore muscles.` : `${k} kWh used. Frugal.`, mild: k > 15 ? `${k} kWh used. The meter had a busy day.` : `${k} kWh used. Nice and frugal.` }),
    lastLight: f => ({ plain: `The last light went out at ${hm(f)}.`, funny: `At ${hm(f)} the last light went out. Done for the day.`, mild: `At ${hm(f)} the last light went out. Done for the day.` }),
    quiet: () => ({ plain: "A quiet day, nothing special happened.", funny: "Nothing happened. Nothing at all. The house was bored to death.", mild: "Nothing happened. The house had a quiet day." }),
  },
};
const IC = { firstLight: "mdi:weather-sunset-up", left: "mdi:walk", came: "mdi:home-import-outline", leftMany: "mdi:walk", cameMany: "mdi:home-import-outline", stayed: "mdi:sofa-outline", door: "mdi:door-open", windows: "mdi:window-open-variant",
  busiest: "mdi:motion-sensor", app: "mdi:washing-machine", apps: "mdi:washing-machine", lightTop: "mdi:lightbulb-on-outline", kwh: "mdi:flash-outline", lastLight: "mdi:weather-night", quiet: "mdi:emoticon-neutral-outline" };

/** the day as story lines [{icon, text, t}] in time order where there is a time */
export function diaryLines(p, f) {
  const cfg = p.config || {}, lang = cfg.personalityLang === "en" ? "en" : S[getLang()] ? getLang() : "en", tone = cfg.personality === "mild" ? "mild" : cfg.personality ? "funny" : "plain";
  const L = S[lang], out = [], say = (k, at, ...a) => out.push({ icon: IC[k], text: L[k](...a)[tone], t: at ?? Infinity });
  if (f.lights.first) say("firstLight", f.lights.first, f.lights.first);
  for (const x of f.people) if (!x.ch.length && x.wasHome && (f.off || new Date().getHours() >= 18)) say("stayed", null, x.name);
  // comings and goings: several within two hours make one sentence ("Between 7:36 and 9:12, Alex, Sam and Jamie left")
  const and = lang === "de" ? " und " : " and ", list = ns => ns.length > 1 ? ns.slice(0, -1).join(", ") + and + ns.at(-1) : ns[0];
  for (const k of ["out", "in"]) {
    const ev = f.people.flatMap(x => x.ch.filter(c => c.k === k).map(c => ({ n: x.name, t: c.t }))).sort((a, b) => a.t - b.t);
    for (let i = 0; i < ev.length;) {
      let j = i; while (j + 1 < ev.length && ev[j + 1].t - ev[j].t <= 2 * 3600000) j++;
      const g = ev.slice(i, j + 1), names = [...new Set(g.map(x => x.n))];
      if (names.length > 1) say(k === "in" ? "cameMany" : "leftMany", g[0].t, list(names), g[0].t, g.at(-1).t);
      else for (const x of g) say(k === "in" ? "came" : "left", x.t, x.n, x.t);
      i = j + 1;
    }
  }
  if (f.doors[0]?.n >= 2) say("door", null, f.doors[0].name, f.doors[0].n);
  const w = f.windows.reduce((n, x) => n + x.n, 0); if (w >= 2) say("windows", null, w);
  if (f.busiest && f.busiest.n >= 3) say("busiest", null, f.busiest.room, f.busiest.n);
  if (f.apps.length === 1) { const a = f.apps[0]; say("app", a.end, a.name, a.n, durText(a.min, lang), a.kind); }
  else if (f.apps.length) say("apps", null, f.apps.map(a => `${a.name} ${a.n}× (${durText(a.min, lang)})`).join(", "));
  if (f.lights.top && f.lights.top.min >= 60) say("lightTop", null, f.lights.top.name, durText(f.lights.top.min, lang));
  if (f.kwh != null && f.kwh > 0) say("kwh", null, Math.round(f.kwh * 10) / 10);
  if (f.lights.last && (f.off || new Date().getHours() >= 21)) say("lastLight", f.lights.last, f.lights.last);
  if (!out.length) say("quiet", null);
  return out.sort((a, b) => a.t - b.t);
}

const dayName = off => off === 0 ? t("Vandaag") : off === 1 ? t("Gisteren") : dayStart(off).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });

/** the home page card: the day's opening line; loads today's diary in the background */
export function diaryCard(p) {
  const f = p._diary?.[0];
  if (!f || Date.now() - f.at > 600000) loadDiary(p, 0).then(() => p.requestUpdate());
  const lines = f ? diaryLines(p, f) : [];
  return html`<div class="card diary" ${pressDir(p, { tap: () => p.openPopup({ type: "diary", off: 0 }) })}>
    <div class="i">${ico("mdi:book-open-variant")}</div><div class="c">${new Date().getHours() < 20 ? t("tot nu toe") : t("vandaag")}</div>
    <div class="n">${t("Dagboek")}</div><div class="s">${lines.length ? lines[lines.length > 1 ? 1 : 0].text : t("Laden…")}</div>
    <div class="lbl">${lines.length ? tn(lines.length, "{n} moment", "{n} momenten") : ""}</div></div>`;
}

/** the popup: the whole day, with ‹ › to the days before (up to 7) */
export function diaryPopup(p, pop, ui) {
  const off = pop.off || 0, f = p._diary?.[off];
  if (!f || (!off && Date.now() - f.at > 600000)) loadDiary(p, off).then(() => p.requestUpdate());
  const lines = f ? diaryLines(p, f) : [];
  const nav = html`<div class="modes n2 diarynav">
    <button ?disabled=${off >= 7} @click=${() => p.openPopup({ ...pop, off: off + 1 })}><ha-icon icon="mdi:chevron-left"></ha-icon>${t("Eerder")}</button>
    <button ?disabled=${off <= 0} @click=${() => p.openPopup({ ...pop, off: off - 1 })}>${t("Later")}<ha-icon icon="mdi:chevron-right"></ha-icon></button></div>`;
  return ui.wrap(t("Dagboek"), dayName(off), f ? (off ? t("de hele dag") : t("tot nu toe")) : t("Laden…"), html`
    ${nav}
    <ul class="diaryl">${lines.map(l => html`<li><span class="di">${ico(l.icon)}</span><span class="dtx">${l.text}</span></li>`)}</ul>`);
}

export const diaryStyles = `
  .popup .diarynav{margin-top:14px}
  .popup .diarynav button{display:flex;align-items:center;justify-content:center;gap:4px}
  .popup .diarynav button:disabled{opacity:.35;cursor:default}
  .popup ul.diaryl{list-style:none;margin:18px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
  .popup ul.diaryl li{display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:start;padding:10px 4px;border-top:1px solid rgba(255,255,255,.08);font-size:15px;line-height:1.45}
  .popup ul.diaryl li:first-child{border-top:0}
  .popup ul.diaryl .di{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.1)}
  .popup ul.diaryl .di img,.popup ul.diaryl .di ha-icon{width:18px;height:18px;--mdc-icon-size:18px}
  .card.diary .s{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
`;
