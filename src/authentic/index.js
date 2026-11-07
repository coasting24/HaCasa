// "Authentic Weather" for the weather card (config.wxAnim / config.wxText): the animated <weather-bg> sky and the blunt
// one-liners of the GlassHome Authentic Weather widget (the files next to this one, taken over unchanged), with an optional
// family-friendly set. Only this bridge is HaCasa's own.
import "./weather-bg.ts";
import { weatherEntries, localize } from "./entries.ts";
import { toFamilyFriendly } from "./entries-mild.ts";

let mild = null;
/** text colour of the highlighted word, per entry colour key (Tailwind 400 / 200 / 300 shades, as in the widget) */
const COL = { sun: "oklch(82.8% 0.189 84.429)", cloud: "oklch(70.4% 0.04 256.788)", rain: "oklch(70.7% 0.165 254.624)", storm: "oklch(70.2% 0.183 293.541)",
  snow: "oklch(88.2% 0.059 254.128)", fog: "oklch(86.9% 0.022 252.894)", wind: "oklch(87.1% 0.15 154.449)", night: "oklch(87% 0.065 274.039)", default: "oklch(92.9% 0.013 255.508)" };

/** the entry for a condition, day or night and a temperature in °C: same pool and same stable pick as the widget (it only
 *  changes when the condition, the day phase or the temperature by about 5° changes) */
function pickEntry(cond, night, tempC, family) {
  const entries = family ? (mild ||= toFamilyFriendly(weatherEntries)) : weatherEntries, phase = night ? "night" : "day";
  const fits = e => e.c === cond && (!e.day_phase || e.day_phase === "any" || e.day_phase === phase);
  let pool = entries.filter(e => fits(e) && tempC >= e.min && tempC <= e.max);
  if (!pool.length) pool = entries.filter(fits);
  if (!pool.length) return entries[entries.length - 1];
  const bucket = `${cond}-${phase}-${Math.round(tempC / 5)}`; let h = 0;
  for (let i = 0; i < bucket.length; i++) h = ((h * 31) + bucket.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

/** { pre, word, post, sub, color } for the card; lang "de", "en", … (no translation yet → English) */
export function authenticText(cond, night, tempC, family, lang) {
  const e = pickEntry(cond, night, tempC, family), title = localize(e.t, lang), [pre, post = ""] = title.split("{{h}}");
  return { pre, word: localize(e.h, lang), post, sub: localize(e.s, lang), color: COL[e.col] || COL.default };
}
