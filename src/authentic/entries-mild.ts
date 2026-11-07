// From the GlassHome "Authentic Weather" widget (src/weather/entries-mild.ts), taken over unchanged.
import type { WeatherEntry } from "./entries";

// Family-friendly rewrites of the entries that swear, joke about undressing or
// insult the reader. Keyed by condition + English title + English subtitle of
// the original entry; only the parts that change are given (per locale), the
// rest is kept. An entry with no clean version is dropped in this mode — the
// pool of each condition stays non-empty either way.
type Part = Partial<Record<"en" | "de", string>>;
interface Mild { h?: Part; t?: Part; s?: Part }

const really: Part = { en: "really", de: "richtig" };

export const MILD: Record<string, Mild> = {
  "sunny|It's {{h}} hot.|Hydration is survival.": { h: really },
  "sunny|Fucking {{h}} in the air.|Take off your shirt and get wet.": {
    h: { en: "sunshine", de: "Sonnenschein" },
    t: { en: "There's {{h}} in the air.", de: "{{h}} liegt in der Luft." },
    s: { en: "Time to head outside and splash around.", de: "Zeit, nach draußen zu gehen und zu planschen." },
  },
  "sunny|It's {{h}} nice.|Take off your shirt but keep on your panties.": {
    h: really,
    s: { en: "Grab your sunglasses and a cold drink.", de: "Sonnenbrille auf und ein kühles Getränk dazu." },
  },
  "sunny|It's {{h}} alright today.|Not amazeballs but also not fucking shitty.": {
    h: { en: "actually", de: "Ehrlich gesagt" },
    s: { en: "Not amazing, but not bad either.", de: "Nicht der Knaller, aber auch nicht schlecht." },
  },
  "sunny|It's like an {{h}}|Just get naked now and get some ice cream.": {
    s: { en: "Time to get some ice cream.", de: "Zeit für ein Eis." },
  },
  "sunny|I'm {{h}} melting.|Take off your shirt and get wet.": {
    h: { en: "totally", de: "total" },
    s: { en: "Find some shade and a cold drink.", de: "Such dir Schatten und ein kühles Getränk." },
  },
  "sunny|It's so {{h}} hot.|I wouldn't go outside for more information.": { h: { en: "incredibly", de: "unglaublich" } },
  "sunny|It's {{h}} car wash time.|Exactly! It's going to be hot as shit.": {
    h: { en: "definitely", de: "richtige" },
    s: { en: "Exactly! It's going to be really hot.", de: "Exakt! Es wird richtig heiß." },
  },
  "sunny|Let's get {{h}} naked.|You heard it, it's going to be hot!": {
    h: { en: "swimming", de: "schwimmen" },
    t: { en: "Let's go {{h}}.", de: "Lass uns {{h}} gehen." },
  },
  "sunny|Global {{h}} warming.|Yeah, let's blame Global Warming.": {
    h: { en: "warming.", de: "Klimawandel." },
    t: { en: "Global {{h}}", de: "Mal wieder der {{h}}" },
  },
  "sunny|It's {{h}} tropical.|Ice Cream is my final answer.": { h: really },
  "sunny|It's too {{h}} hot.|Ice Cream is my final answer.": {
    h: { en: "too", de: "zu" },
    t: { en: "It's {{h}} hot.", de: "Es ist {{h}} heiß." },
  },
  "sunny|I think {{h}} fucking hot.|Just kidding, but the fucking weather is.": {},
  "sunny|Drop it like it's {{h}}|*Don't drop your fucking iPhone though, seriously.": {
    s: { en: "*Don't drop your iPhone though, seriously.", de: "*Lass bloß nicht dein iPhone fallen, ernsthaft." },
  },
  "sunny|It's {{h}} hot.|Even fucking Siri has no answer for you today.": {
    h: { en: "super", de: "mega" },
    s: { en: "Even Siri has no answer for you today.", de: "Selbst Siri hat heute keine Antwort für dich." },
  },
  "sunny|Fucking {{h}} Balls.|So fucking nice outside, holy schmoly.": {
    h: { en: "Amazing", de: "Traumhaftes" },
    t: { en: "{{h}} weather!", de: "{{h}} Wetter!" },
    s: { en: "So nice outside, holy moly.", de: "So schön draußen, holla die Waldfee." },
  },

  "clear-night|Stars are {{h}} visible.|Rare. Put your fucking phone down.": {
    s: { en: "Rare. Put your phone down.", de: "Selten. Leg dein Handy weg." },
  },
  "clear-night|Clear and {{h}} cold.|Beautiful sky, terrible idea to go out.": {
    h: really,
    s: { en: "Beautiful sky, but bundle up.", de: "Wunderschöner Himmel, aber zieh dich warm an." },
  },
  "clear-night|It's {{h}} out there.|Call someone. Or don't, you hermit.": {
    s: { en: "Call a friend. Or don't, no pressure.", de: "Ruf einen Freund an. Oder auch nicht, kein Stress." },
  },

  "partlycloudy|A {{h}} mix of clouds and sky.|Make up your mind.": { h: { en: "half-hearted", de: "halbherziger" } },
  "partlycloudy|{{h}} with a chance of....|You thought I would say meatballs right? Stupid.": {
    s: { en: "You thought I would say meatballs, right? Gotcha.", de: "Du dachtest, ich sage Fleischbällchen, oder? Reingelegt." },
  },

  "cloudy|It's {{h}} cloudy.|Grey everywhere.": { h: really },
  "cloudy|Fifty {{h}} of grey.|Fucking grey clouds everywhere.": {
    h: { en: "shades", de: "Grautöne" },
    t: { en: "Lots of {{h}} of grey.", de: "Jede Menge {{h}}." },
    s: { en: "Grey clouds everywhere.", de: "Graue Wolken überall." },
  },
  "cloudy|It's {{h}} out there.|Even the clouds gave up today.": { h: { en: "gloomy", de: "trüb" } },

  "fog|You can {{h}} see shit.|Good luck driving.": {
    t: { en: "You can {{h}} see a thing.", de: "Du kannst {{h}} etwas sehen." },
  },
  "fog|It's {{h}} out there.|Drive slow. Or stay home, coward.": {
    s: { en: "Drive slow. Or stay home where it's cozy.", de: "Fahr langsam. Oder bleib zu Hause, da ist es gemütlich." },
  },
  "fog|Zero {{h}}|Perfect for hiding from your problems.": {
    s: { en: "Perfect for playing hide and seek.", de: "Perfekt zum Verstecken spielen." },
  },

  "windy|Hold the {{h}} door.|No seriously, hold it or it's gone.": {
    h: { en: "front", de: "Haus" },
    t: { de: "Halt die {{h}}tür fest." },
  },
  "windy|Umbrellas are {{h}}|The wind just made you look like an idiot.": {
    s: { en: "The wind just took your umbrella for a ride.", de: "Der Wind hat deinen Regenschirm gerade mitgenommen." },
  },
  "windy|It's getting {{h}} dark.|The storm is coming - May the Force be with you.": { h: really },

  "rainy|It's {{h}} raining.|Everything will get wet.": { h: really, t: { en: "It's {{h}} rainy." } },
  "rainy|Get your {{h}}|Shitloads of rain is awaiting you.": {
    s: { en: "Loads of rain are awaiting you.", de: "Jede Menge Regen erwartet dich." },
  },
  "rainy|It's {{h}}|The rain doesn't care about your plans.": {
    h: { en: "dreary.", de: "trist." },
    s: { de: "Dem Regen sind deine Pläne egal." },
  },

  "pouring|Call {{h}}|It's fucking biblical out there.": {
    s: { en: "It's biblical out there.", de: "Es ist biblisch da draußen." },
  },
  "pouring|Get the fuck {{h}}|Seriously, what are you doing out there?": {
    h: { en: "inside", de: "rein" },
    t: { en: "Get {{h}} now.", de: "Geh jetzt {{h}}." },
  },

  "lightning|{{h}} storm.|It's time to sing the \"Fuck you Thunder\" song.": {
    t: { en: "A big {{h}} storm.", de: "Ein großes {{h}}." },
    s: { en: "Time to hide under a blanket.", de: "Zeit, sich unter der Decke zu verstecken." },
  },
  "lightning|Nature is throwing {{h}}|Stay the fuck away from trees.": {
    s: { en: "Stay away from trees.", de: "Halt dich von Bäumen fern." },
  },
  "lightning-rainy|It's {{h}} stormy.|Nature is pissed.": {
    t: { en: "It's {{h}} out there.", de: "Es ist {{h}} da draußen." },
    s: { en: "Nature is really angry.", de: "Die Natur ist richtig sauer." },
  },
  "lightning-rainy|Going outside? You're {{h}}|Come back when it's over.": {
    h: { en: "soaked.", de: "klatschnass." },
    t: { de: "Du gehst raus? Du wirst {{h}}" },
  },

  "snowy|It's {{h}} freezing.|Only polar bears thrive.": { h: really },
  "snowy|It's {{h}} snowing.|Slippery hellscape.": {
    t: { en: "The snow is {{h}}.", de: "Der Schnee ist {{h}}." },
    h: { en: "wet", de: "nass" },
    s: { en: "Slippery mess.", de: "Rutschige Angelegenheit." },
  },
  "snowy-rainy|It's {{h}} snow-rain.|Worst combo ever.": { h: { en: "yucky", de: "matschiger" } },

  "hail|It's {{h}} hailing.|Nature is throwing rocks at you.": {
    h: { en: "hard", de: "richtig" },
    t: { en: "It's hailing {{h}}.", de: "Es hagelt {{h}}." },
  },
  "hail|{{h}}|No, not the good kind. Your car is fucked.": {
    h: { en: "hail yeah.", de: "Heiliger Strohsack." },
    s: { en: "No, not the good kind. Your car is in trouble.", de: "Nein, nicht das Gute. Dein Auto hat es schwer." },
  },

  "exceptional|Weather is {{h}}.|Even the forecast gave up.": { h: { en: "wild", de: "verrückt." } },
};

/** Entries with no clean rewrite are removed in family-friendly mode. */
export const DROP = new Set(["sunny|I think {{h}} fucking hot.|Just kidding, but the fucking weather is."]);

export const entryKey = (e: WeatherEntry): string => `${e.c ?? ""}|${e.t.en ?? ""}|${e.s.en ?? ""}`;

export function toFamilyFriendly(entries: WeatherEntry[]): WeatherEntry[] {
  return entries
    .filter((e) => !DROP.has(entryKey(e)))
    .map((e) => {
      const m = MILD[entryKey(e)];
      if (!m) return e;
      return { ...e, h: { ...e.h, ...m.h }, t: { ...e.t, ...m.t }, s: { ...e.s, ...m.s } };
    });
}
