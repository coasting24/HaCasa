// "Authentic Weather" for the weather card (config.wxAnim / config.wxText): the animated <weather-bg> sky and the blunt
// one-liners of the GlassHome Authentic Weather widget (the files next to this one, taken over unchanged), with an optional
// family-friendly set. Only this bridge is HaCasa's own.
import "./weather-bg.ts";
import { weatherEntries, localize } from "./entries.ts";
import { toFamilyFriendly } from "./entries-mild.ts";

let mild = null;
/** text colour of the highlighted word, per entry colour key: the widget's hues (Tailwind), one or two shades stronger,
    so the word stands out on HaCasa's dark glass instead of going almost white (the night's indigo-200 did) */
const COL = { sun: "oklch(87.9% 0.169 91.605)", cloud: "oklch(80.9% 0.105 251.813)", rain: "oklch(70.7% 0.165 254.624)", storm: "oklch(70.2% 0.183 293.541)",
  snow: "oklch(82.8% 0.111 230.318)", fog: "oklch(85.5% 0.138 181.071)", wind: "oklch(84.5% 0.143 164.978)", night: "oklch(78.5% 0.115 274.713)", default: "oklch(82.8% 0.111 230.318)" };

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
