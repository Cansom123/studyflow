// Reading a Canvas calendar feed (.ics). Pure functions only, so they can be
// tested without a server: `node supabase/functions/canvas-feed-sync/ics.test.ts`.

export type FeedAssignment = {
  canvasAssignmentId: string;
  courseId: string | null;
  title: string;
  course: string;
  dueDate: string | null; // ISO, UTC
  url: string | null;
  description: string | null;
};

// A calendar feed link always looks like
// https://<school>/feeds/calendars/user_<random>.ics. Anything else is
// refused before it is fetched, so this can't be pointed at other sites.
export function normalizeFeedUrl(raw: string): string | null {
  let s = String(raw || "").trim();
  if (!s) return null;
  s = s.replace(/^webcals?:\/\//i, "https://");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  u.protocol = "https:";
  if (u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host === "localhost" || host.endsWith(".local")) return null;
  if (!/^\/feeds\/calendars\/user_[A-Za-z0-9]+\.ics$/.test(u.pathname)) return null;
  return `https://${host}${u.pathname}`;
}

// Lines that start with a space or tab continue the line above.
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

type Prop = { name: string; params: Record<string, string>; value: string };

function parseLine(line: string): Prop | null {
  // NAME;PARAM=x;PARAM2="y:z":VALUE -- the value starts at the first colon
  // that isn't inside a quoted parameter.
  let inQuote = false, idx = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ":" && !inQuote) { idx = i; break; }
  }
  if (idx < 0) return null;
  const head = line.slice(0, idx), value = line.slice(idx + 1);
  const [name, ...rest] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of rest) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

// The UTC offset of a time zone at a moment, in ms.
function tzOffset(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms;
}

// A wall-clock time in a time zone, as a UTC Date.
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const first = wall - tzOffset(wall, tz);
    return new Date(wall - tzOffset(first, tz));
  } catch {
    return new Date(wall); // unknown zone: treat as UTC
  }
}

// DTSTART/DTEND: "20261020T055900Z" (UTC), "20261020T235900" with or without
// TZID (local), or VALUE=DATE "20261020" (a whole day, due at 11:59 PM).
export function parseIcsDate(p: Prop, fallbackTz: string): string | null {
  const m = p.value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return zonedToUtc(+y, +mo, +d, 23, 59, 0, fallbackTz).toISOString();
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))).toISOString();
  return zonedToUtc(+y, +mo, +d, +h, +mi, +(s || 0), p.params.TZID || fallbackTz).toISOString();
}

const TAG_ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  let text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(new RegExp(`<br\\b${TAG_ATTRS}>`, "gi"), "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(new RegExp(`<li\\b${TAG_ATTRS}>`, "gi"), "• ")
    .replace(new RegExp(`<[a-zA-Z!/]${TAG_ATTRS}>`, "g"), "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return null;
  if (text.length > 4000) text = text.slice(0, 4000).trim() + "…";
  return text;
}

// Only assignments. From Canvas's calendar_event.rb (IcalEvent#to_ics):
//   UID      "event-assignment-<id>", "event-assignment-override-<override id>"
//            (a personal or section due date), "event-sub-assignment-<id>"
//            (a discussion checkpoint). Ordinary events are left out.
//   SUMMARY  "<title> [<course CODE>]" -- the course code, not its full name.
//   URL      "https://<host>/calendar?include_contexts=course_<id>&month=..#assignment_<id>"
//            The fragment always names the real assignment, overrides included.
//   DTSTART  UTC; a whole-day item is VALUE=DATE with no DTEND.
export function parseCanvasFeed(text: string, fallbackTz = "UTC"): FeedAssignment[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("not_calendar");
  const out: FeedAssignment[] = [];
  const seen = new Set<string>(); // one row per assignment, even if it's listed twice
  let ev: Record<string, Prop> | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line.trim())) { ev = {}; continue; }
    if (/^END:VEVENT$/i.test(line.trim())) {
      const a = ev ? toAssignment(ev, fallbackTz) : null;
      const key = a ? `${a.courseId}/${a.canvasAssignmentId}` : "";
      if (a && !seen.has(key)) { seen.add(key); out.push(a); }
      ev = null; continue;
    }
    if (!ev) continue;
    const p = parseLine(line);
    if (p && !(p.name in ev)) ev[p.name] = p;
  }
  return out;
}

function toAssignment(ev: Record<string, Prop>, tz: string): FeedAssignment | null {
  const uid = ev.UID?.value.trim() || "";
  const uidMatch = uid.match(/^event-(assignment|assignment-override|sub-assignment)-(\d+)/i);
  if (!uidMatch) return null;
  const rawUrl = ev.URL?.value.trim() || null;

  // "Lab Report [BIO-101]" -> title "Lab Report", course "BIO-101"
  const summary = unescapeText(ev.SUMMARY?.value || "").trim();
  const cm = summary.match(/^(.*?)\s*\[([^\[\]]+)\]\s*$/);
  const title = (cm ? cm[1] : summary).trim();
  const course = (cm ? cm[2] : "").trim();
  if (!title) return null;

  // The course id comes from the link (".../courses/678/assignments/123" or
  // "...calendar?include_contexts=course_678#assignment_123").
  let courseId: string | null = null, host: string | null = null, fragId: string | null = null;
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      host = u.hostname;
      courseId = u.pathname.match(/\/courses\/(\d+)/)?.[1] ?? u.searchParams.get("include_contexts")?.match(/course_(\d+)/)?.[1] ?? null;
      fragId = u.hash.match(/^#assignment_(\d+)$/)?.[1] ?? u.pathname.match(/\/assignments\/(\d+)/)?.[1] ?? null;
    } catch { /* keep nulls */ }
  }
  // An override's UID carries the override's id, not the assignment's; the
  // link's fragment always has the assignment's.
  const plainAssignment = uidMatch[1].toLowerCase() === "assignment";
  const assignmentId = fragId ?? (plainAssignment ? uidMatch[2] : null);
  if (!assignmentId) return null;
  // Same address Canvas's API gives the assignment, so the two connection
  // methods describe each assignment the same way.
  const url = host && courseId ? `https://${host}/courses/${courseId}/assignments/${assignmentId}` : rawUrl;

  const start = ev.DTSTART ? parseIcsDate(ev.DTSTART, tz) : null;
  const end = ev.DTEND ? parseIcsDate(ev.DTEND, tz) : null;
  const html = ev["X-ALT-DESC"]?.value ? unescapeText(ev["X-ALT-DESC"].value) : null;
  const plain = ev.DESCRIPTION?.value ? unescapeText(ev.DESCRIPTION.value).trim() : null;

  return {
    canvasAssignmentId: assignmentId,
    courseId,
    title,
    course: course || "Canvas",
    // Canvas puts the due time in both; DTEND of a whole-day event is the
    // next day, so the start is the one to trust.
    dueDate: start || end,
    url,
    description: htmlToText(html) || (plain ? plain.slice(0, 4000) : null),
  };
}
