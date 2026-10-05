const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** "Wed 7 Oct": a near date, read the way a diary does. */
export const weekdayDate = (d: string) => weekdayFmt.format(new Date(`${d}T00:00:00Z`));

/** Deep link that opens a subscription's detail drawer. */
export const drawerHref = (key: string) => `/subscriptions?sub=${encodeURIComponent(key)}`;
