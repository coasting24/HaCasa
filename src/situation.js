// A home page that follows the situation (config.situations): the card row puts first what matters now. Morning: the
// weather, the day's appointments, the waste pickup; evening: scenes, the climate, security; night: whether all is shut;
// away: security, energy and who is where. The situation comes from the clock and who is home, or from a helper chosen in
// the settings (an input_select with the states morning / day / evening / night / away). Only the order changes: every
// card stays where the page settings put it otherwise, nothing appears or disappears unexpectedly.
// With it comes the card "All shut?" (key "leaving"): lights still on, doors and windows open, open covers, media and
// appliances running, and one button that switches the lights and the media off.
import { html, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { t } from "./i18n.js";
import { isOn, unavailable } from "./util.js";
import { name, deviceName } from "./model.js";
import { applianceState } from "./extras2.js";
import { pressDir, ico } from "./cards.js";

export const SITUATIONS = ["morning", "day", "evening", "night", "away", "leaving"];
export const SITUATION_LABEL = () => ({ morning: t("Ochtend"), day: t("Dag"), evening: t("Avond"), night: t("Nacht"), away: t("Niemand thuis"), leaving: t("Weggaan") });

const ago = (s, min) => s?.last_changed && Date.now() - new Date(s.last_changed) < min * 60000;
/** leaving: someone is home, the front door (settings, else any outside door) opened in the last few minutes, and
    something is still on or open */
export function leavingNow(p) {
  const h = p.home; if (!h || (h.persons?.length && !h.home)) return false;
  const door = p.config.leavingDoor ? [p.hass.states[p.config.leavingDoor]] : (h.doors || []).map(e => e.state);
  return door.some(s => ago(s, 3)) && count(stillOn(p)) > 0;
}
/** the situation now: the helper's state when one is chosen and valid, else leaving (front door + still on), else nobody
    home → away, else by the clock */
export function situationOf(p) {
  const ent = p.config.situationEntity && p.hass.states[p.config.situationEntity];
  if (ent && SITUATIONS.includes(ent.state)) return ent.state;
  if (leavingNow(p)) return "leaving";
  const h = p.home; if (h?.persons?.length && !h.home) return "away";
  const hr = new Date().getHours();
  return hr >= 5 && hr < 10 ? "morning" : hr < 17 && hr >= 10 ? "day" : hr >= 17 && hr < 22 ? "evening" : "night";
}

/** what to put first in each situation (card keys); the rest keeps its order */
const FIRST = {
  morning: ["weather", "agenda", "waste", "leaving", "attention"],
  day: [],
  evening: ["covers", "lightsall", "scenes", "leaving", "climate", "security"],
  night: ["leaving", "security", "climate"],
  away: ["security", "leaving", "energy", "people", "attention"],
  leaving: ["leaving", "security", "weather"],
};
/** at night the row shows only these (config.nightDim), and the photo is dimmed */
export const NIGHT_KEYS = ["leaving", "security", "climate"];
/** at night something stirs: motion in a room, or a door or window that changed in the last two minutes */
export const nightAlert = p => { const h = p.home; return !!h && ((h.motion || []).length > 0 || [...(h.doors || []), ...(h.windows || [])].some(e => ago(e.state, 2))); };
export function orderBySituation(list, sit) {
  const first = FIRST[sit] || [], rank = k => { const i = first.indexOf(k); return i < 0 ? first.length : i; };
  return list.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.key) - rank(b.c.key) || a.i - b.i).map(x => x.c);
}

/** everything still on or open in the home: { lights, open, covers, media, appliances } (entities / items with a name) */
export function stillOn(p) {
  const h = p.home, hass = p.hass, ok = s => s && !unavailable(s);
  const media = p.rooms.flatMap(r => r.ents.media).filter(m => m.state?.state === "playing");
  const covers = p.rooms.flatMap(r => r.ents.covers).filter(c => ok(c.state) && (c.state.state === "open" || c.state.state === "opening"));
  const appliances = p.rooms.flatMap(r => r.ents.appliances).filter(a => { try { return applianceState(hass, a).st === "running"; } catch { return false; } });
  return { lights: h.lightsOn || [], open: [...(h.doorsOpen || []), ...(h.windowsOpen || [])], covers, media, appliances };
}
const count = s => s.lights.length + s.open.length + s.covers.length + s.media.length + s.appliances.length;

/** switch the lights off and stop the media (doors, windows and appliances are only shown: they need a hand) */
export function allOff(p, s = stillOn(p), going = false) {
  const lights = s.lights.map(e => e.id || e.entity_id).filter(Boolean), media = s.media.map(m => m.id).filter(Boolean);
  // "I'm leaving": the alarm too, when the settings say so and it is not armed yet
  const alarm = going && p.config.leavingArm && p.home?.alarm && p.home.alarm.state === "disarmed" ? p.home.alarm : null;
  p.openPopup({ type: "confirm", title: t("Alles dicht?"), big: going ? t("Ik ga weg") : t("Alles uit?"),
    sub: [lights.length ? t("{n} lampen uit", { n: lights.length }) : "", media.length ? t("{n} spelers stoppen", { n: media.length }) : "", alarm ? t("alarm aan (afwezig)") : ""].filter(Boolean).join(" · "),
    okLabel: going ? t("Ik ga weg") : t("Alles uit"),
    ok: async () => {
      if (lights.length) await p.call("light", "turn_off", { entity_id: lights });
      for (const id of media) await p.call("media_player", "media_pause", { entity_id: id });
      if (alarm) { try { await p.hass.callService("alarm_control_panel", "alarm_arm_away", { entity_id: alarm.entity_id }); } catch { p.showToast?.(t("Alarm vraagt een code: schakel het in via de beveiliging")); } }
    } });
}

/** the card "All shut?" */
export function leavingCard(p) {
  const s = stillOn(p), n = count(s), canOff = s.lights.length + s.media.length > 0, going = p.config.situations && situationOf(p) === "leaving";
  const nm = e => name(p.hass, e), an = a => deviceName(p.hass, a.device) || nm({ id: a.key }), list = [
    s.lights.length ? t("{n} lampen aan", { n: s.lights.length }) : "",
    s.open.length ? (s.open.length === 1 ? t("{n} open", { n: nm(s.open[0]) }) : t("{n} deuren/ramen open", { n: s.open.length })) : "",
    s.covers.length ? t("{n} rolluiken open", { n: s.covers.length }) : "",
    s.media.length ? t("{n} speelt", { n: nm(s.media[0]) }) : "",
    s.appliances.length ? t("{n} draait", { n: an(s.appliances[0]) }) : "",
  ].filter(Boolean);
  return html`<div class=${classMap({ card: true, leaving: true, on: n > 0, calm: !n })} ${pressDir(p, { tap: () => p.openPopup({ type: "leaving" }) })}>
    <div class="i">${ico(n ? "mdi:home-alert-outline" : "mdi:home-lock", n ? "door" : "lock")}</div>
    <div class="c">${n ? t("{n} dingen", { n }) : t("Alles dicht")}</div>
    <div class="n">${t("Alles dicht?")}</div>
    <div class="s">${n ? list.slice(0, 3).join(" · ") : t("Geen lampen aan, niets open, niets speelt")}</div>
    ${canOff ? html`<div class="ctl lvctl"><button @click=${ev => { ev.stopPropagation(); allOff(p, s, going); }}>${going ? t("Ik ga weg") : t("Alles uit")}</button></div>` : nothing}
  </div>`;
}

/** the popup: every item, tappable for its own controls, and the button for all */
export function leavingPopup(p, pop, ui) {
  const s = stillOn(p), nm = e => name(p.hass, e), more = id => () => p.moreInfo(id);
  // appliances are devices: their name is the device's, their controls those of the plug or the operation sensor
  const label = x => x.device !== undefined && String(x.id || "").startsWith("device:") ? deviceName(p.hass, x.device) || nm({ id: x.key }) : nm(x);
  const sec = (title, items, icon, text) => items.length ? html`<div class="prow"><span>${title}</span><b>${items.length}</b></div>
    <ul>${items.map(x => ui.li(icon, label(x), text(x), { onclick: more(String(x.id || "").startsWith("device:") ? x.key : x.id) }))}</ul>` : nothing;
  const any = count(s) > 0;
  return ui.wrap(t("Alles dicht?"), html`<div class="big">${any ? t("{n} dingen", { n: count(s) }) : t("Alles dicht")}</div>`, "", html`
    ${sec(t("Lampen"), s.lights, "mdi:lightbulb-on-outline", () => t("aan"))}
    ${sec(t("Deuren en ramen"), s.open, "mdi:door-open", () => t("open"))}
    ${sec(t("Rolluiken"), s.covers, "mdi:window-shutter-open", x => x.state?.attributes?.current_position != null ? `${x.state.attributes.current_position}%` : t("open"))}
    ${sec(t("Media"), s.media, "mdi:play-circle-outline", x => x.state?.attributes?.media_title || t("speelt"))}
    ${sec(t("Apparaten"), s.appliances, "mdi:washing-machine", () => t("draait"))}
    ${!any ? html`<div class="sub">${t("Geen lampen aan, niets open, niets speelt")}</div>` : nothing}
    ${s.lights.length + s.media.length ? html`<div class="modes n1" style="margin-top:16px"><button class="on" @click=${() => allOff(p, s)}>${t("Alles uit")}</button></div>` : nothing}`);
}

/** home card "All covers": how many are open, all up / stop / down; a tap lists them */
export function coversCard(p) {
  const all = p.rooms.flatMap(r => r.ents.covers).filter(c => c.state && !unavailable(c.state)), ids = all.map(c => c.id);
  const open = all.filter(c => c.state.state === "open" || c.state.state === "opening"), canStop = all.some(c => (c.state.attributes.supported_features || 0) & 8);
  const go = svc => ev => { ev.stopPropagation(); p.call("cover", svc, { entity_id: ids }); };
  return html`<div class=${classMap({ card: true, cvb: true, on: open.length > 0 })} ${pressDir(p, { tap: () => p.openPopup({ type: "coversall" }) })}>
    <div class="i">${ico("mdi:window-shutter", "window")}</div>
    <div class="c">${open.length ? t("{n} open", { n: open.length }) : t("Dicht")}</div>
    <div class="n">${t("Alle rolluiken")}</div>
    <div class="s">${open.length ? open.slice(0, 2).map(c => name(p.hass, c)).join(" · ") : t("{n} rolluiken dicht", { n: all.length })}</div>
    <div class="ctl cvctl"><button @click=${go("open_cover")} title=${t("Omhoog")} aria-label=${t("Omhoog")}><ha-icon icon="mdi:chevron-up"></ha-icon></button>
      ${canStop ? html`<button @click=${go("stop_cover")} title=${t("Stoppen")} aria-label=${t("Stoppen")}><ha-icon icon="mdi:stop"></ha-icon></button>` : nothing}
      <button @click=${go("close_cover")} title=${t("Omlaag")} aria-label=${t("Omlaag")}><ha-icon icon="mdi:chevron-down"></ha-icon></button></div>
  </div>`;
}
export function coversPopup(p, pop, ui) {
  const all = p.rooms.flatMap(r => r.ents.covers.map(c => ({ ...c, room: r }))).filter(c => c.state);
  return ui.wrap(t("Alle rolluiken"), html`<div class="big">${t("{n} rolluiken", { n: all.length })}</div>`, "", html`<ul>${all.map(c => ui.li("mdi:window-shutter", name(p.hass, c), c.state.attributes.current_position != null ? `${c.state.attributes.current_position}%` : c.state.state, { sub: c.room.name, onclick: () => p.moreInfo(c.id) }))}</ul>`);
}
/** home card "Lights": how many are on, all off; a tap opens the lights list */
export function lightsAllCard(p) {
  const on = p.home?.lightsOn || [];
  return html`<div class=${classMap({ card: true, leaving: true, on: on.length > 0, calm: !on.length })} ${pressDir(p, { tap: () => p.openPopup({ type: "lights" }) })}>
    <div class="i">${ico("mdi:lightbulb-group-outline", "bulb")}</div>
    <div class="c">${on.length ? t("{n} aan", { n: on.length }) : t("Uit")}</div>
    <div class="n">${t("Lampen")}</div>
    <div class="s">${on.length ? on.slice(0, 3).map(e => name(p.hass, e)).join(" · ") : t("Alle lampen zijn uit")}</div>
    ${on.length ? html`<div class="ctl lvctl"><button @click=${ev => { ev.stopPropagation(); p.call("light", "turn_off", { entity_id: on.map(e => e.id) }); }}>${t("Alle uit")}</button></div>` : nothing}
  </div>`;
}

export const situationStyles = `
  /* night: the photo dimmed, the row thinned out; when something stirs, security lights up */
  :host(.night) .bg{filter:brightness(.32) saturate(.8);transition:filter 1.5s ease}
  :host(.night) .title h1,:host(.night) .title .temp,:host(.night) .wx{opacity:.55;transition:opacity 1.5s ease}
  :host(.night.nalert) .bg{filter:brightness(.55)}
  :host(.night.nalert) .card.security{box-shadow:0 0 0 2px rgba(255,210,122,.85),0 12px 32px rgba(0,0,0,.3);animation:nAlert 2.4s ease-in-out infinite}
  @keyframes nAlert{50%{box-shadow:0 0 0 2px rgba(255,210,122,.35),0 12px 32px rgba(0,0,0,.3)}}
  .card.leaving.calm .i{opacity:.7}
  .card.leaving .ctl.lvctl{left:var(--cp);right:var(--cp);width:auto;display:flex}
  .card.leaving .ctl.lvctl button{flex:1;height:40px;background:rgba(255,255,255,.12);border:1px solid var(--line);font:inherit;font-size:14px;font-weight:700;color:#fff}
  .card.leaving{padding-bottom:calc(var(--cp) + 46px)}
  .card.leaving.calm{padding-bottom:var(--cp)}
`;
