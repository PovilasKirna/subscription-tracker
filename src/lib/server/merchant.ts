// Turns messy statement descriptions ("PAYPAL *SPOTIFY P1A2B3", "Google *YouTube Premium",
// "APPLE.COM/BILL") into a stable merchant key, plus a friendly name and category
// for well-known subscription services.

export type KnownMerchant = { key: string; name: string; category: string; pattern: RegExp };

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
  { key: "netflix", name: "Netflix", category: "Streaming", pattern: /netflix/ },
  { key: "disney-plus", name: "Disney+", category: "Streaming", pattern: /disney ?plus|disney\+|disneyplus/ },
  { key: "hbo-max", name: "HBO Max", category: "Streaming", pattern: /hbo ?max|\bmax\.com/ },
  { key: "youtube-premium", name: "YouTube Premium", category: "Streaming", pattern: /youtube/ },
  { key: "prime-video", name: "Amazon Prime", category: "Streaming", pattern: /prime ?video|amazon ?prime|amzn ?prime/ },
  { key: "apple-tv", name: "Apple TV+", category: "Streaming", pattern: /apple ?tv/ },
  { key: "go3", name: "Go3", category: "Streaming", pattern: /\bgo3\b/ },
  { key: "telia-play", name: "Telia Play", category: "Streaming", pattern: /telia ?play/ },
  { key: "crunchyroll", name: "Crunchyroll", category: "Streaming", pattern: /crunchyroll/ },
  { key: "twitch", name: "Twitch", category: "Streaming", pattern: /twitch/ },
  { key: "skyshowtime", name: "SkyShowtime", category: "Streaming", pattern: /skyshowtime/ },
  // Music & audio
  { key: "spotify", name: "Spotify", category: "Music & audio", pattern: /spotify/ },
  { key: "apple-music", name: "Apple Music", category: "Music & audio", pattern: /apple ?music/ },
  { key: "deezer", name: "Deezer", category: "Music & audio", pattern: /deezer/ },
  { key: "tidal", name: "Tidal", category: "Music & audio", pattern: /\btidal\b/ },
  { key: "audible", name: "Audible", category: "Music & audio", pattern: /audible/ },
  { key: "storytel", name: "Storytel", category: "Music & audio", pattern: /storytel/ },
  // Software & AI
  { key: "openai", name: "ChatGPT", category: "Software & AI", pattern: /openai|chatgpt/ },
  { key: "anthropic", name: "Claude", category: "Software & AI", pattern: /anthropic|claude\.ai/ },
  { key: "github", name: "GitHub", category: "Software & AI", pattern: /github/ },
  { key: "jetbrains", name: "JetBrains", category: "Software & AI", pattern: /jetbrains/ },
  { key: "cursor", name: "Cursor", category: "Software & AI", pattern: /cursor\.(com|sh)|anysphere/ },
  { key: "adobe", name: "Adobe", category: "Software & AI", pattern: /adobe/ },
  { key: "microsoft", name: "Microsoft 365", category: "Software & AI", pattern: /microsoft|msft|office ?365/ },
  { key: "notion", name: "Notion", category: "Software & AI", pattern: /notion/ },
  { key: "figma", name: "Figma", category: "Software & AI", pattern: /figma/ },
  { key: "canva", name: "Canva", category: "Software & AI", pattern: /canva/ },
  { key: "midjourney", name: "Midjourney", category: "Software & AI", pattern: /midjourney/ },
  { key: "1password", name: "1Password", category: "Software & AI", pattern: /1password/ },
  { key: "nordvpn", name: "NordVPN", category: "Software & AI", pattern: /nordvpn|nord ?sec/ },
  { key: "proton", name: "Proton", category: "Software & AI", pattern: /proton/ },
  { key: "duolingo", name: "Duolingo", category: "Software & AI", pattern: /duolingo/ },
  // Cloud storage
  { key: "icloud", name: "iCloud+", category: "Cloud storage", pattern: /icloud/ },
  { key: "google-one", name: "Google One", category: "Cloud storage", pattern: /google ?one|google ?storage/ },
  { key: "dropbox", name: "Dropbox", category: "Cloud storage", pattern: /dropbox/ },
  // Apple bills many things under one descriptor; keep it after the specific Apple ones.
  { key: "apple", name: "Apple (App Store)", category: "Software & AI", pattern: /apple\.com|apple services|itunes/ },
  // Gaming
  { key: "playstation", name: "PlayStation Plus", category: "Gaming", pattern: /playstation|sony ?interactive/ },
  { key: "xbox", name: "Xbox Game Pass", category: "Gaming", pattern: /xbox/ },
  { key: "nintendo", name: "Nintendo Online", category: "Gaming", pattern: /nintendo/ },
  { key: "ea-play", name: "EA Play", category: "Gaming", pattern: /\bea play|electronic arts/ },
  // News & reading
  { key: "medium", name: "Medium", category: "News & reading", pattern: /medium\.com/ },
  { key: "substack", name: "Substack", category: "News & reading", pattern: /substack/ },
  { key: "patreon", name: "Patreon", category: "News & reading", pattern: /patreon/ },
  { key: "kindle", name: "Kindle Unlimited", category: "News & reading", pattern: /kindle/ },
  // Fitness
  { key: "lemon-gym", name: "Lemon Gym", category: "Fitness", pattern: /lemon ?gym/ },
  { key: "impuls", name: "Impuls", category: "Fitness", pattern: /impuls/ },
  { key: "gym-plius", name: "Gym+", category: "Fitness", pattern: /gym ?(\+|plius|plus)/ },
  { key: "strava", name: "Strava", category: "Fitness", pattern: /strava/ },
  // Telecom
  { key: "telia", name: "Telia", category: "Telecom & internet", pattern: /\btelia\b/ },
  { key: "tele2", name: "Tele2", category: "Telecom & internet", pattern: /tele ?2/ },
  { key: "bite", name: "Bitė", category: "Telecom & internet", pattern: /\bbite\b/ },
  // Banking
  {
    key: "revolut-plan",
    name: "Revolut plan",
    category: "Banking & finance",
    pattern: /(premium|metal|plus|ultra|standard) plan fee|revolut (premium|metal|plus|ultra)/,
  },
  // Delivery & mobility memberships
  { key: "wolt-plus", name: "Wolt+", category: "Delivery & mobility", pattern: /wolt ?\+|wolt ?plus/ },
  { key: "bolt-plus", name: "Bolt Plus", category: "Delivery & mobility", pattern: /bolt ?plus/ },
  { key: "uber-one", name: "Uber One", category: "Delivery & mobility", pattern: /uber ?one/ },
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

export function isKnownSubscription(key: string): boolean {
  return KNOWN_MERCHANTS.some((m) => m.key === key);
}
