// Quick start sync: assignments from a student's Canvas calendar feed link
// instead of an access token. Writes the same assignments rows canvas-sync-v3
// does (same titles, course names and Canvas links), so upgrading to a token
// later carries everything over. The feed has no grades, submissions or
// announcements, so those are left alone.
//
//   { action: "validate", feed_url }  check a link before it is saved
//   { action: "courses" }             classes found in the saved feed
//   {}                                sync the saved feed into assignments
import { normalizeFeedUrl, parseCanvasFeed, type FeedAssignment } from "./ics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type FetchResult = { ok: true; items: FeedAssignment[] } | { ok: false; error: string; status?: number };

async function fetchFeed(feedUrl: string, tz: string): Promise<FetchResult> {
  let resp: Response;
  try {
    resp = await fetch(feedUrl, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  } catch {
    return { ok: false, error: "unreachable" };
  }
  // A reset or deleted link sends Canvas's login page or a 404.
  if (resp.status >= 300 && resp.status < 400) return { ok: false, error: "feed_not_found", status: resp.status };
  if (resp.status === 401 || resp.status === 403 || resp.status === 404) return { ok: false, error: "feed_not_found", status: resp.status };
  if (!resp.ok) return { ok: false, error: "canvas_error", status: resp.status };
  const text = await resp.text();
  if (text.length > 15_000_000) return { ok: false, error: "too_large" };
  try {
    return { ok: true, items: parseCanvasFeed(text, tz) };
  } catch {
    return { ok: false, error: "not_calendar" };
  }
}

function coursesOf(items: FeedAssignment[]) {
  const map = new Map<string, { id: string; name: string; assignments: number }>();
  for (const a of items) {
    const id = a.courseId ?? `name:${a.course}`;
    const c = map.get(id) ?? { id, name: a.course, assignments: 0 };
    c.assignments++;
    map.set(id, c);
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const runId = crypto.randomUUID().slice(0, 8);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");

    // Signed-in students only, and only their own account.
    let userId: string | null = null;
    if (token && token !== anonKey) {
      const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } });
      if (r.ok) userId = (await r.json()).id;
    }
    if (!userId) return json({ ok: false, error: "Please sign in again, then sync." }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "sync");
    const svc = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" };

    const settingsResp = await fetch(
      `${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}&select=canvas_url,selected_courses,timezone`,
      { headers: svc },
    );
    const settings = (await settingsResp.json())?.[0] ?? {};
    const tz = typeof settings.timezone === "string" && settings.timezone ? settings.timezone : "UTC";

    // ---- Check a link before it's saved ---------------------------------
    if (action === "validate") {
      const feedUrl = normalizeFeedUrl(body?.feed_url);
      if (!feedUrl) return json({ ok: false, error: "not_feed_link" });
      const r = await fetchFeed(feedUrl, tz);
      // Only the reason is logged, never the link.
      console.log(`[run ${runId}] validate user=${userId} -> ${r.ok ? `${r.items.length} assignments` : r.error}`);
      if (!r.ok) return json(r);
      return json({ ok: true, host: new URL(feedUrl).hostname, assignments: r.items.length, courses: coursesOf(r.items) });
    }

    // ---- Everything else reads the saved (encrypted) link ---------------
    const feedResp = await fetch(`${supabaseUrl}/rest/v1/rpc/get_canvas_feed`, {
      method: "POST", headers: svc, body: JSON.stringify({ p_user_id: userId }),
    });
    const saved: string | null = feedResp.ok ? await feedResp.json() : null;
    const feedUrl = saved ? normalizeFeedUrl(saved) : null;
    if (!feedUrl) return json({ ok: false, error: "not_connected" }, 400);

    const r = await fetchFeed(feedUrl, tz);
    if (!r.ok) {
      console.warn(`[run ${runId}] user=${userId} feed -> ${r.error}${r.status ? ` (${r.status})` : ""}`);
      return json({ ...r, message: r.error === "feed_not_found"
        ? "Your Canvas calendar link stopped working. It may have been reset. Copy it again from Canvas > Calendar > Calendar Feed."
        : "Couldn't read your Canvas calendar. Try again in a few minutes." }, 502);
    }

    if (action === "courses") return json({ ok: true, courses: coursesOf(r.items) });

    // ---- Sync ------------------------------------------------------------
    const now = new Date();
    const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000;
    const selected: Array<{ id: string; name: string }> = Array.isArray(settings.selected_courses) ? settings.selected_courses : [];
    const selIds = new Set(selected.map((c) => String(c.id)));
    const selNames = new Set(selected.map((c) => String(c.name || "").toLowerCase().trim()));
    const chosen = r.items.filter((a) => {
      if (a.dueDate && new Date(a.dueDate).getTime() < cutoff) return false;
      if (selected.length === 0) return true;
      const id = a.courseId ?? `name:${a.course}`;
      return selIds.has(id) || selNames.has(a.course.toLowerCase().trim());
    });

    // The feed can't tell what was turned in, so what the student checked
    // off in StudyFlow is kept across syncs.
    const doneResp = await fetch(
      `${supabaseUrl}/rest/v1/assignments?user_id=eq.${userId}&completed=eq.true&select=title,course,completed_at`,
      { headers: svc },
    );
    const doneRows: Array<{ title: string; course: string; completed_at: string | null }> = doneResp.ok ? await doneResp.json() : [];
    const done = new Map(doneRows.map((d) => [`${d.title}||${d.course}`, d.completed_at]));

    const rows = chosen.map((a) => {
      const key = `${a.title}||${a.course}`;
      const isDone = done.has(key);
      return {
        user_id: userId,
        title: a.title,
        course: a.course,
        due_date: a.dueDate,
        assignment_type: "homework",
        points_possible: null,
        completed: isDone,
        completed_at: isDone ? done.get(key) ?? null : null,
        assignment_url: a.url,
        is_locked: false,
        lock_reason: null,
        description: a.description,
        score: null,
        is_missing: false,
        is_excused: false,
      };
    });

    await fetch(`${supabaseUrl}/rest/v1/assignments?user_id=eq.${userId}`, { method: "DELETE", headers: svc });
    if (rows.length > 0) {
      const ins = await fetch(`${supabaseUrl}/rest/v1/assignments`, {
        method: "POST", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify(rows),
      });
      if (!ins.ok) throw new Error(`Saving assignments failed (${ins.status})`);
    }

    // First sync: remember the classes and the school's Canvas address.
    const patch: Record<string, unknown> = {};
    if (selected.length === 0) patch.selected_courses = coursesOf(chosen).map((c) => ({ id: c.id, name: c.name }));
    if (!settings.canvas_url) patch.canvas_url = new URL(feedUrl).hostname;
    if (Object.keys(patch).length) {
      await fetch(`${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}`, { method: "PATCH", headers: svc, body: JSON.stringify(patch) });
    }

    const active = rows.filter((x) => !x.completed).length;
    console.log(`[run ${runId}] user=${userId} feed=${r.items.length} kept=${rows.length} active=${active}`);
    return json({
      success: true, mode: "feed", run_id: runId,
      assignments: rows.length, active_assignments: active, grades: 0,
      courses: coursesOf(chosen).map((c) => ({ id: c.id, name: c.name, assignments_total: c.assignments })),
    });
  } catch (err: any) {
    console.error(`[run ${runId}] error: ${err?.message}`);
    return json({ ok: false, error: err?.message ?? "Internal error", run_id: runId }, 500);
  }
});
