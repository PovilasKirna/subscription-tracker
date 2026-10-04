// Turns messy statement descriptions ("PAYPAL *SPOTIFY P1A2B3", "Google *YouTube Premium",
// "APPLE.COM/BILL") into a stable merchant key, plus a friendly name and category
// for well-known subscription services (whose website domain also gives them a logo).

export type KnownMerchant = { key: string; name: string; category: string; domain: string; pattern: RegExp };

export const CATEGORIES = [
  "Streaming",
  "Music & audio",
  "Software & AI",
  "Cloud storage",
  "Gaming",
  "News & reading",
  "Fitness",
  "Telecom & internet",
  "Banking & finance",
  "Delivery & mobility",
  "Utilities & home",
  "Other",
] as const;

export const KNOWN_MERCHANTS: KnownMerchant[] = [
  // Streaming / video
  { key: "netflix", name: "Netflix", category: "Streaming", domain: "netflix.com", pattern: /netflix/ },
  { key: "disney-plus", name: "Disney+", category: "Streaming", domain: "disneyplus.com", pattern: /disney ?plus|disney\+|disneyplus/ },
  { key: "hbo-max", name: "HBO Max", category: "Streaming", domain: "hbomax.com", pattern: /hbo ?max|\bmax\.com/ },
  { key: "youtube-premium", name: "YouTube Premium", category: "Streaming", domain: "youtube.com", pattern: /youtube/ },
  {
    key: "prime-video",
    name: "Amazon Prime",
    category: "Streaming",
    domain: "primevideo.com",
    pattern: /prime ?video|amazon ?prime|amzn ?prime/,
  },
  { key: "apple-tv", name: "Apple TV+", category: "Streaming", domain: "tv.apple.com", pattern: /apple ?tv/ },
  { key: "go3", name: "Go3", category: "Streaming", domain: "go3.lt", pattern: /\bgo3\b/ },
  { key: "telia-play", name: "Telia Play", category: "Streaming", domain: "teliaplay.lt", pattern: /telia ?play/ },
  { key: "crunchyroll", name: "Crunchyroll", category: "Streaming", domain: "crunchyroll.com", pattern: /crunchyroll/ },
  { key: "twitch", name: "Twitch", category: "Streaming", domain: "twitch.tv", pattern: /twitch/ },
  { key: "skyshowtime", name: "SkyShowtime", category: "Streaming", domain: "skyshowtime.com", pattern: /skyshowtime/ },
  // Music & audio
  { key: "spotify", name: "Spotify", category: "Music & audio", domain: "spotify.com", pattern: /spotify/ },
  { key: "apple-music", name: "Apple Music", category: "Music & audio", domain: "music.apple.com", pattern: /apple ?music/ },
  { key: "deezer", name: "Deezer", category: "Music & audio", domain: "deezer.com", pattern: /deezer/ },
  { key: "tidal", name: "Tidal", category: "Music & audio", domain: "tidal.com", pattern: /\btidal\b/ },
  { key: "audible", name: "Audible", category: "Music & audio", domain: "audible.com", pattern: /audible/ },
  { key: "storytel", name: "Storytel", category: "Music & audio", domain: "storytel.com", pattern: /storytel/ },
  // Software & AI
  { key: "openai", name: "ChatGPT", category: "Software & AI", domain: "chatgpt.com", pattern: /openai|chatgpt/ },
  { key: "anthropic", name: "Claude", category: "Software & AI", domain: "claude.ai", pattern: /anthropic|claude\.ai/ },
  { key: "github", name: "GitHub", category: "Software & AI", domain: "github.com", pattern: /github/ },
  { key: "jetbrains", name: "JetBrains", category: "Software & AI", domain: "jetbrains.com", pattern: /jetbrains/ },
  { key: "cursor", name: "Cursor", category: "Software & AI", domain: "cursor.com", pattern: /cursor\.(com|sh)|anysphere/ },
  { key: "adobe", name: "Adobe", category: "Software & AI", domain: "adobe.com", pattern: /adobe/ },
  { key: "microsoft", name: "Microsoft 365", category: "Software & AI", domain: "microsoft.com", pattern: /microsoft|msft|office ?365/ },
  { key: "notion", name: "Notion", category: "Software & AI", domain: "notion.com", pattern: /notion/ },
  { key: "figma", name: "Figma", category: "Software & AI", domain: "figma.com", pattern: /figma/ },
  { key: "canva", name: "Canva", category: "Software & AI", domain: "canva.com", pattern: /canva/ },
  { key: "midjourney", name: "Midjourney", category: "Software & AI", domain: "midjourney.com", pattern: /midjourney/ },
  { key: "1password", name: "1Password", category: "Software & AI", domain: "1password.com", pattern: /1password/ },
  { key: "nordvpn", name: "NordVPN", category: "Software & AI", domain: "nordvpn.com", pattern: /nordvpn|nord ?sec/ },
  { key: "proton", name: "Proton", category: "Software & AI", domain: "proton.me", pattern: /proton/ },
  { key: "duolingo", name: "Duolingo", category: "Software & AI", domain: "duolingo.com", pattern: /duolingo/ },
  // Cloud storage
  { key: "icloud", name: "iCloud+", category: "Cloud storage", domain: "icloud.com", pattern: /icloud/ },
  { key: "google-one", name: "Google One", category: "Cloud storage", domain: "one.google.com", pattern: /google ?one|google ?storage/ },
  { key: "dropbox", name: "Dropbox", category: "Cloud storage", domain: "dropbox.com", pattern: /dropbox/ },
  // Apple bills many things under one descriptor; keep it after the specific Apple ones.
  { key: "apple", name: "Apple (App Store)", category: "Software & AI", domain: "apple.com", pattern: /apple\.com|apple services|itunes/ },
  // Gaming
  { key: "playstation", name: "PlayStation Plus", category: "Gaming", domain: "playstation.com", pattern: /playstation|sony ?interactive/ },
  { key: "xbox", name: "Xbox Game Pass", category: "Gaming", domain: "xbox.com", pattern: /xbox/ },
  { key: "nintendo", name: "Nintendo Online", category: "Gaming", domain: "nintendo.com", pattern: /nintendo/ },
  { key: "ea-play", name: "EA Play", category: "Gaming", domain: "ea.com", pattern: /\bea play|electronic arts/ },
  // News & reading
  { key: "medium", name: "Medium", category: "News & reading", domain: "medium.com", pattern: /medium\.com/ },
  { key: "substack", name: "Substack", category: "News & reading", domain: "substack.com", pattern: /substack/ },
  { key: "patreon", name: "Patreon", category: "News & reading", domain: "patreon.com", pattern: /patreon/ },
  { key: "kindle", name: "Kindle Unlimited", category: "News & reading", domain: "amazon.com", pattern: /kindle/ },
  // Fitness
  { key: "lemon-gym", name: "Lemon Gym", category: "Fitness", domain: "lemongym.lt", pattern: /lemon ?gym/ },
  { key: "impuls", name: "Impuls", category: "Fitness", domain: "impuls.lt", pattern: /impuls/ },
  { key: "gym-plius", name: "Gym+", category: "Fitness", domain: "gymplius.lt", pattern: /gym ?(\+|plius|plus)/ },
  { key: "strava", name: "Strava", category: "Fitness", domain: "strava.com", pattern: /strava/ },
  // Telecom
  { key: "telia", name: "Telia", category: "Telecom & internet", domain: "telia.lt", pattern: /\btelia\b/ },
  { key: "tele2", name: "Tele2", category: "Telecom & internet", domain: "tele2.lt", pattern: /tele ?2/ },
  { key: "bite", name: "Bitė", category: "Telecom & internet", domain: "bite.lt", pattern: /\bbite\b/ },
  // Banking
  {
    key: "revolut-plan",
    name: "Revolut plan",
    category: "Banking & finance",
    domain: "revolut.com",
    pattern: /(premium|metal|plus|ultra|standard) plan fee|revolut (premium|metal|plus|ultra)/,
  },
  // Delivery & mobility memberships
  { key: "wolt-plus", name: "Wolt+", category: "Delivery & mobility", domain: "wolt.com", pattern: /wolt ?\+|wolt ?plus/ },
  { key: "bolt-plus", name: "Bolt Plus", category: "Delivery & mobility", domain: "bolt.eu", pattern: /bolt ?plus/ },
  { key: "uber-one", name: "Uber One", category: "Delivery & mobility", domain: "uber.com", pattern: /uber ?one/ },
];

// Payment processors that prefix the real merchant: "PAYPAL *SPOTIFY", "SQ *COFFEE".
const PROCESSOR_PREFIX = /^(paypal|pp|sq|sumup|sp|zettle|izettle|stripe|google|amzn mktp|payu|paysera|klarna)\s*\*\s*/i;
const NOISE_TOKENS = new Set([
  "www",
  "com",
  "net",
  "org",
  "eu",
  "lt",
  "uk",
  "ie",
  "de",
  "nl",
  "us",
  "inc",
  "ltd",
  "llc",
  "uab",
  "gmbh",
  "bv",
  "sa",
  "sarl",
  "ab",
  "oy",
  "as",
  "plc",
  "co",
  "the",
  "payment",
  "purchase",
  "to",
  "from",
  "card",
  "bill",
  "help",
]);

function clean(description: string): string {
  return description.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
}

export function matchKnown(description: string): KnownMerchant | undefined {
  const d = clean(description);
  return KNOWN_MERCHANTS.find((m) => m.pattern.test(d));
}

export function merchantKey(description: string): string {
  const known = matchKnown(description);
  if (known) return known.key;
  let d = clean(description).replace(PROCESSOR_PREFIX, "");
  // Drop a trailing "*REF123" or "#1234" reference.
  d = d.replace(/[*#]\s*[a-z0-9]*\d[a-z0-9]*.*$/, "");
  const tokens = d
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NOISE_TOKENS.has(t) && !/\d/.test(t));
  const key = tokens.slice(0, 3).join("-");
  return key || clean(description).replace(/\s+/g, "-").slice(0, 40) || "unknown";
}

export function merchantName(key: string, sampleDescription: string): string {
  const known = KNOWN_MERCHANTS.find((m) => m.key === key);
  if (known) return known.name;
  const d = sampleDescription
    .replace(PROCESSOR_PREFIX, "")
    .replace(/[*#]\s*\S*\d\S*.*$/, "")
    .trim();
  const base = d || key.replace(/-/g, " ");
  return base.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function merchantCategory(key: string): string {
  return KNOWN_MERCHANTS.find((m) => m.key === key)?.category ?? "Other";
}

/** The website a known merchant's logo is looked up from; `undefined` for everyone else. */
export function merchantDomain(key: string): string | undefined {
  return KNOWN_MERCHANTS.find((m) => m.key === key)?.domain;
}

export function isKnownSubscription(key: string): boolean {
  return KNOWN_MERCHANTS.some((m) => m.key === key);
}

/** "https://www.Hostinger.com/pricing" → "hostinger.com". Null when it isn't a plausible domain name. */
export function normalizeWebsite(input: string): string | null {
  const host = (
    input
      .trim()
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
      .split(/[/?#:]/)[0] ?? ""
  ).replace(/^www\./, "");
  return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(host) ? host : null;
}
