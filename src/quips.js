// "Persoonlijkheid" (config.personality): HaCasa comments on the house in the ticker under the greeting, in the tone of the
// weather card's one-liners: "Drei Fenster offen bei 4°. Mutig." Two sets per language: "funny" (may swear a little) and
// "mild" (the same jokes, clean). Dutch (checked by a native speaker), German and English here; any other panel language gets the English lines, and
// config.personalityLang = "en" keeps them English everywhere. Only situations worth a remark make a line, at most two
// at once, so the ticker stays the ticker; the wording changes every ten minutes, not on every render.
import { isOn, num } from "./util.js";
import { getLang } from "./i18n.js";
import { name, deviceName } from "./model.js";
import { applianceState } from "./extras2.js";
import { cardCfg, isHidden } from "./cards.js";

// {placeholders} are filled in; numbers in the text are set in bold by the ticker
const Q = {
  de: {
    coldWindows: { funny: ["{n} Fenster offen bei {t}°. Mutig.", "Draußen {t}°, {n} Fenster offen. Heizt du für die Nachbarn?", "{t}° und {n} Fenster auf. Die Heizung weint leise."],
      mild: ["{n} Fenster offen bei {t}°. Mutig.", "Draußen {t}°, {n} Fenster offen. Heizt du für die Nachbarn?", "{t}° und {n} Fenster auf. Die Heizung seufzt."] },
    emptyLights: { funny: ["Niemand zuhause, aber {n} Lichter halten die Stellung.", "Alle weg. {n} Lampen feiern trotzdem.", "Keiner da, {n} Lichter an. Für wen eigentlich, verdammt?"],
      mild: ["Niemand zuhause, aber {n} Lichter halten die Stellung.", "Alle weg. {n} Lampen feiern trotzdem.", "Keiner da, {n} Lichter an. Für wen eigentlich?"] },
    manyLights: { funny: ["{n} Lichter an. Das Kraftwerk dankt.", "{n} Lampen gleichzeitig. Landebahn oder Wohnung?", "{n} Lichter an. Man sieht euch vom Mond aus."],
      mild: ["{n} Lichter an. Das Kraftwerk dankt.", "{n} Lampen gleichzeitig. Landebahn oder Wohnung?", "{n} Lichter an. Man sieht euch vom Mond aus."] },
    applianceWaiting: { funny: ["{name} ist fertig und wartet seit {m} Minuten beleidigt.", "{name}: seit {m} Minuten fertig. Die Wäsche riecht schon nach Rache.", "{name} wartet seit {m} Minuten. Ausräumen wäre jetzt verdammt nett."],
      mild: ["{name} ist fertig und wartet seit {m} Minuten beleidigt.", "{name}: seit {m} Minuten fertig. Niemand kommt.", "{name} wartet seit {m} Minuten. Ausräumen wäre jetzt nett."] },
    applianceRunning: { funny: ["{name} arbeitet. Du nicht.", "{name} schuftet. Wenigstens einer.", "{name} läuft. Sei leise, es konzentriert sich."],
      mild: ["{name} arbeitet. Du nicht.", "{name} schuftet. Wenigstens einer.", "{name} läuft. Sei leise, es konzentriert sich."] },
    doorOpen: { funny: ["{name} steht seit {m} Minuten offen. Kommt noch jemand?", "{name} ist seit {m} Minuten auf. Zieht's?", "{name}: {m} Minuten offen. Mach die verdammte Tür zu."],
      mild: ["{name} steht seit {m} Minuten offen. Kommt noch jemand?", "{name} ist seit {m} Minuten auf. Zieht's?", "{name}: {m} Minuten offen. Tür zu, bitte."] },
    powerHigh: { funny: ["{w} W gerade. Wer hat den Föhn an?", "{w} W. Der Zähler dreht sich wie ein Ventilator.", "{w} W Verbrauch. Startet hier gleich eine Rakete?"],
      mild: ["{w} W gerade. Wer hat den Föhn an?", "{w} W. Der Zähler dreht sich wie ein Ventilator.", "{w} W Verbrauch. Startet hier gleich eine Rakete?"] },
    hotInside: { funny: ["{t}° drinnen. Sauna ist geöffnet.", "{t}° im Haus. Fehlt nur noch der Aufguss.", "{t}° drinnen. Schwitzen ist auch Sport."],
      mild: ["{t}° drinnen. Sauna ist geöffnet.", "{t}° im Haus. Fehlt nur noch der Aufguss.", "{t}° drinnen. Schwitzen ist auch Sport."] },
    coldInside: { funny: ["{t}° drinnen. Pinguine fühlen sich wohl.", "Nur {t}° im Haus. Pullover-Pflicht.", "{t}° drinnen. Verdammt frisch hier."],
      mild: ["{t}° drinnen. Pinguine fühlen sich wohl.", "Nur {t}° im Haus. Pullover-Pflicht.", "{t}° drinnen. Ganz schön frisch hier."] },
    lateLights: { funny: ["Es ist {time}. {n} Lichter sind noch wach. Und du?", "{time} Uhr, {n} Lampen an. Geh ins Bett.", "{time}. Das Haus will schlafen, {n} Lichter nicht."],
      mild: ["Es ist {time}. {n} Lichter sind noch wach. Und du?", "{time} Uhr, {n} Lampen an. Zeit fürs Bett.", "{time}. Das Haus will schlafen, {n} Lichter nicht."] },
    calm: { funny: ["Alles ruhig. Verdächtig ruhig.", "Nichts los. Das Haus langweilt sich.", "Alles zu, alles aus. Langweilig, aber sicher."],
      mild: ["Alles ruhig. Verdächtig ruhig.", "Nichts los. Das Haus langweilt sich.", "Alles zu, alles aus. Langweilig, aber sicher."] },
    forgottenLights: { funny: ["{room}: Das Licht brennt, aber seit {m} Minuten bewegt sich nichts.", "{room}: Licht an, niemand da. Seit {m} Minuten.", "{room} ist seit {m} Minuten leer. Das Licht hat's nicht gemerkt."],
      mild: ["{room}: Das Licht brennt, aber seit {m} Minuten bewegt sich nichts.", "{room}: Licht an, niemand da. Seit {m} Minuten.", "{room} ist seit {m} Minuten leer. Das Licht hat's nicht gemerkt."] },
  },
  nl: {
    coldWindows: { funny: ["{n} ramen open bij {t}°. Stoer.", "Buiten {t}°, {n} ramen open. Stook je voor de buren?", "{t}° en {n} ramen open. De verwarming huilt zachtjes."],
      mild: ["{n} ramen open bij {t}°. Stoer.", "Buiten {t}°, {n} ramen open. Stook je voor de buren?", "{t}° en {n} ramen open. De verwarming zucht."] },
    emptyLights: { funny: ["Niemand thuis, maar {n} lampen houden de wacht.", "Iedereen weg. {n} lampen geven toch een feestje.", "Niemand hier, {n} lampen aan. Voor wie in godsnaam?"],
      mild: ["Niemand thuis, maar {n} lampen houden de wacht.", "Iedereen weg. {n} lampen geven toch een feestje.", "Niemand hier, {n} lampen aan. Voor wie eigenlijk?"] },
    manyLights: { funny: ["{n} lampen aan. De energieleverancier zegt dankjewel.", "{n} lampen tegelijk. Landingsbaan of woonkamer?", "{n} lampen aan. Ze zien jullie vanaf de maan."],
      mild: ["{n} lampen aan. De energieleverancier zegt dankjewel.", "{n} lampen tegelijk. Landingsbaan of woonkamer?", "{n} lampen aan. Ze zien jullie vanaf de maan."] },
    applianceWaiting: { funny: ["{name} is al {m} minuten klaar en wacht op je.", "{name}: {m} minuten geleden klaar. De was beraamt wraak.", "{name} wacht al {m} minuten. Uitruimen zou verdomd fijn zijn."],
      mild: ["{name} is al {m} minuten klaar en wacht op je.", "{name}: {m} minuten geleden klaar. Niemand komt.", "{name} wacht al {m} minuten. Uitruimen zou fijn zijn."] },
    applianceRunning: { funny: ["{name} is aan het werk. Jij niet.", "{name} zwoegt. Iemand moet het doen.", "{name} draait. Stil, hij concentreert zich."],
      mild: ["{name} is aan het werk. Jij niet.", "{name} zwoegt. Iemand moet het doen.", "{name} draait. Stil, hij concentreert zich."] },
    doorOpen: { funny: ["{name} staat al {m} minuten open. Verwacht je iemand?", "{name} staat {m} minuten open. Tocht het?", "{name}: {m} minuten open. Doe die verdomde deur dicht."],
      mild: ["{name} staat al {m} minuten open. Verwacht je iemand?", "{name} staat {m} minuten open. Tocht het?", "{name}: {m} minuten open. Deur dicht, alsjeblieft."] },
    powerHigh: { funny: ["Nu {w} W. Wie staat er te föhnen?", "{w} W. De meter draait als een ventilator.", "{w} W. Gaat hier zo een raket de lucht in?"],
      mild: ["Nu {w} W. Wie staat er te föhnen?", "{w} W. De meter draait als een ventilator.", "{w} W. Gaat hier zo een raket de lucht in?"] },
    hotInside: { funny: ["{t}° binnen. De sauna is open.", "{t}° in huis. Nog even opgieten en klaar.", "{t}° binnen. Zweten telt ook als sporten."],
      mild: ["{t}° binnen. De sauna is open.", "{t}° in huis. Nog even opgieten en klaar.", "{t}° binnen. Zweten telt ook als sporten."] },
    coldInside: { funny: ["{t}° binnen. Pinguïns voelen zich hier thuis.", "Maar {t}° in huis. Trui aan.", "{t}° binnen. Verdomd fris hier."],
      mild: ["{t}° binnen. Pinguïns voelen zich hier thuis.", "Maar {t}° in huis. Trui aan.", "{t}° binnen. Best fris hier."] },
    lateLights: { funny: ["Het is {time}. {n} lampen zijn nog wakker. Jij ook?", "{time}, {n} lampen aan. Naar bed jij.", "{time}. Het huis wil slapen, {n} lampen niet."],
      mild: ["Het is {time}. {n} lampen zijn nog wakker. Jij ook?", "{time}, {n} lampen aan. Bedtijd.", "{time}. Het huis wil slapen, {n} lampen niet."] },
    calm: { funny: ["Alles rustig. Verdacht rustig.", "Niks aan de hand. Het huis verveelt zich.", "Alles dicht, alles uit. Saai, maar veilig."],
      mild: ["Alles rustig. Verdacht rustig.", "Niks aan de hand. Het huis verveelt zich.", "Alles dicht, alles uit. Saai, maar veilig."] },
    forgottenLights: { funny: ["{room}: het licht brandt, maar al {m} minuten beweegt er niks.", "{room}: licht aan, niemand thuis. Al {m} minuten.", "{room} is al {m} minuten leeg. Het licht heeft het niet door."],
      mild: ["{room}: het licht brandt, maar al {m} minuten beweegt er niks.", "{room}: licht aan, niemand thuis. Al {m} minuten.", "{room} is al {m} minuten leeg. Het licht heeft het niet door."] },
  },
  en: {
    coldWindows: { funny: ["{n} windows open at {t}°. Brave.", "{t}° outside, {n} windows open. Heating for the neighbours?", "{t}° and {n} windows open. The heating is quietly crying."],
      mild: ["{n} windows open at {t}°. Brave.", "{t}° outside, {n} windows open. Heating for the neighbours?", "{t}° and {n} windows open. The heating sighs."] },
    emptyLights: { funny: ["Nobody home, but {n} lights are holding the fort.", "Everyone's out. {n} lamps are partying anyway.", "Nobody here, {n} lights on. Who the hell for?"],
      mild: ["Nobody home, but {n} lights are holding the fort.", "Everyone's out. {n} lamps are partying anyway.", "Nobody here, {n} lights on. Who for?"] },
    manyLights: { funny: ["{n} lights on. The power plant says thanks.", "{n} lamps at once. Runway or living room?", "{n} lights on. They can see you from the moon."],
      mild: ["{n} lights on. The power plant says thanks.", "{n} lamps at once. Runway or living room?", "{n} lights on. They can see you from the moon."] },
    applianceWaiting: { funny: ["{name} has been done for {m} minutes and is sulking.", "{name}: done {m} minutes ago. The laundry is plotting revenge.", "{name} has waited {m} minutes. Emptying it would be damn nice."],
      mild: ["{name} has been done for {m} minutes and is sulking.", "{name}: done {m} minutes ago. Nobody comes.", "{name} has waited {m} minutes. Emptying it would be nice."] },
    applianceRunning: { funny: ["{name} is working. You're not.", "{name} is grinding away. At least someone is.", "{name} is running. Quiet, it's concentrating."],
      mild: ["{name} is working. You're not.", "{name} is grinding away. At least someone is.", "{name} is running. Quiet, it's concentrating."] },
    doorOpen: { funny: ["{name} has been open for {m} minutes. Expecting someone?", "{name} open for {m} minutes. Feel the draught?", "{name}: open {m} minutes. Close the damn door."],
      mild: ["{name} has been open for {m} minutes. Expecting someone?", "{name} open for {m} minutes. Feel the draught?", "{name}: open {m} minutes. Door shut, please."] },
    powerHigh: { funny: ["{w} W right now. Who's got the hairdryer on?", "{w} W. The meter is spinning like a fan.", "{w} W. Is something about to launch?"],
      mild: ["{w} W right now. Who's got the hairdryer on?", "{w} W. The meter is spinning like a fan.", "{w} W. Is something about to launch?"] },
    hotInside: { funny: ["{t}° inside. The sauna is open.", "{t}° in the house. Just add steam.", "{t}° inside. Sweating counts as exercise."],
      mild: ["{t}° inside. The sauna is open.", "{t}° in the house. Just add steam.", "{t}° inside. Sweating counts as exercise."] },
    coldInside: { funny: ["{t}° inside. Penguins feel at home.", "Only {t}° in the house. Jumpers on.", "{t}° inside. Damn fresh in here."],
      mild: ["{t}° inside. Penguins feel at home.", "Only {t}° in the house. Jumpers on.", "{t}° inside. Pretty fresh in here."] },
    lateLights: { funny: ["It's {time}. {n} lights are still awake. You too?", "{time}, {n} lamps on. Go to bed.", "{time}. The house wants to sleep, {n} lights don't."],
      mild: ["It's {time}. {n} lights are still awake. You too?", "{time}, {n} lamps on. Bedtime.", "{time}. The house wants to sleep, {n} lights don't."] },
    calm: { funny: ["All quiet. Suspiciously quiet.", "Nothing going on. The house is bored.", "Everything shut, everything off. Boring, but safe."],
      mild: ["All quiet. Suspiciously quiet.", "Nothing going on. The house is bored.", "Everything shut, everything off. Boring, but safe."] },
    forgottenLights: { funny: ["{room}: the lights are on, but nothing has moved for {m} minutes.", "{room}: lights on, nobody there. For {m} minutes.", "{room} has been empty for {m} minutes. The lights didn't notice."],
      mild: ["{room}: the lights are on, but nothing has moved for {m} minutes.", "{room}: lights on, nobody there. For {m} minutes.", "{room} has been empty for {m} minutes. The lights didn't notice."] },
  },
};
const ICON = { coldWindows: "mdi:window-open-variant", emptyLights: "mdi:lightbulb-on-outline", manyLights: "mdi:lightbulb-group-outline", applianceWaiting: "mdi:emoticon-angry-outline",
  applianceRunning: "mdi:emoticon-cool-outline", doorOpen: "mdi:door-open", powerHigh: "mdi:flash-alert-outline", hotInside: "mdi:thermometer-high", coldInside: "mdi:snowflake-thermometer",
  lateLights: "mdi:weather-night", calm: "mdi:emoticon-wink-outline", forgottenLights: "mdi:lightbulb-question-outline" };

const mins = since => Math.max(0, Math.round((Date.now() - new Date(since)) / 60000));
/** one line for a situation: the language's set (or English), the funny or mild variant, a different wording every ten minutes */
function line(p, key, vars, seed) {
  const cfg = p.config || {}, lang = cfg.personalityLang === "en" ? "en" : Q[getLang()] ? getLang() : "en";
  const list = Q[lang][key][cfg.personality === "mild" ? "mild" : "funny"];
  const slot = Math.floor(Date.now() / 600000), h = [...(key + seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, slot);
  const text = list[h % list.length].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  return { k: "quips", uicon: ICON[key], text };
}
const timeNow = () => { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const outside = p => num(p.home?.weather?.attributes?.temperature);

/** the remarks for the home page (h = the home model), most important first, at most two */
export function homeQuips(p, h) {
  if (!p.config?.personality || !h) return [];
  const out = [], add = (key, vars, seed = "") => out.push(line(p, key, vars, seed)), hour = new Date().getHours();
  const tOut = outside(p), lights = h.lightsOn?.length || 0;
  const apps = p.rooms.flatMap(r => r.ents.appliances).filter(a => !isHidden(p, a.id) && !a.plain).map(a => ({ a, st: applianceState(p.hass, a, cardCfg(p, a.id).threshold ?? 5), n: cardCfg(p, a.id).name || deviceName(p.hass, a.device) }));
  // household appliances only (as in the diary): a fridge or a computer on a metered plug is no news
  const REAL = /wasch|wash|spül|spuel|dish|vaat|trockner|dryer|droger|kaffee|coffee|koffie|ofen|oven|mikrowelle|micro|magnetron/i;
  const real = apps.filter(x => x.a.op || x.a.wd || REAL.test(x.n));
  const waiting = real.find(x => x.st.st === "done" && x.st.doneAt && mins(x.st.doneAt) >= 20);
  const longDoor = (h.doorsOpen || []).find(e => mins(e.state?.last_changed) >= 10);
  const w = num(h.energy?.power?.state);
  if (h.windowsOpen?.length && tOut != null && tOut < 10) add("coldWindows", { n: h.windowsOpen.length, t: Math.round(tOut) });
  if (h.persons?.length && h.home === 0 && lights) add("emptyLights", { n: lights });
  if (waiting) add("applianceWaiting", { name: waiting.n, m: mins(waiting.st.doneAt) }, waiting.a.id);
  if (longDoor) add("doorOpen", { name: name(p.hass, longDoor), m: mins(longDoor.state.last_changed) }, longDoor.id);
  if (w != null && w >= 2500) add("powerHigh", { w: Math.round(w) });
  if ((hour >= 23 || hour < 5) && lights) add("lateLights", { n: lights, time: timeNow() });
  if (lights >= 8) add("manyLights", { n: lights });
  if (h.temp != null && h.temp >= 26) add("hotInside", { t: Math.round(h.temp) });
  if (h.temp != null && h.temp <= 17) add("coldInside", { t: Math.round(h.temp) });
  const running = real.find(x => x.st.st === "running");
  if (running) add("applianceRunning", { name: running.n }, running.a.id);
  if (!out.length && !lights && !h.doorsOpen?.length && !h.windowsOpen?.length) add("calm", {});
  return out.slice(0, 2);
}

/** the remarks for a room page: forgotten lights (on, no motion for 30 minutes), open windows in the cold */
export function roomQuips(p, r) {
  if (!p.config?.personality || !r) return [];
  const out = [], e = r.ents, tOut = outside(p);
  if (r.lightsOn && r.motion && !r.motionOn && mins(r.motion.last_changed) >= 30) out.push(line(p, "forgottenLights", { room: r.name, m: mins(r.motion.last_changed) }, r.id));
  const win = e.windows.filter(x => isOn(x.state));
  if (win.length && tOut != null && tOut < 10) out.push(line(p, "coldWindows", { n: win.length, t: Math.round(tOut) }, r.id));
  return out.slice(0, 2);
}
