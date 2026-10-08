const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

// A tag ends at the first ">" that is NOT inside a quoted attribute (same as
// canvas-sync-v3), so pasted chat-app HTML doesn't leak into the text.
const TAG_ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", bull: "•",
};

function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(new RegExp(`<br\\b${TAG_ATTRS}>`, "gi"), "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(new RegExp(`<li\\b${TAG_ATTRS}>`, "gi"), "• ")
    .replace(new RegExp(`<[a-zA-Z!/]${TAG_ATTRS}>`, "g"), "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The signed-in student's own Canvas URL and (decrypted) token. The token
// is stored encrypted in Supabase Vault and never sent to the browser.
async function savedCanvasFor(req: Request): Promise<{ url: string; token: string } | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt === anonKey) return null;
  const u = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey } });
  if (!u.ok) return null;
  const userId = (await u.json()).id;
  const s = await fetch(`${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}&select=canvas_url`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey },
  });
  const rows = s.ok ? await s.json() : [];
  const t = await fetch(`${supabaseUrl}/rest/v1/rpc/get_canvas_token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId }),
  });
  const token = t.ok ? await t.json() : null;
  if (!rows?.[0]?.canvas_url || !token) return null;
  return { url: rows[0].canvas_url, token };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { course_id } = body;
    let canvas_url: string | undefined = body.canvas_url;
    let canvas_token: string | undefined = body.canvas_token;

    // Normal case: the app sends only the course; the server uses the
    // student's saved Canvas connection.
    if (!canvas_token) {
      const saved = await savedCanvasFor(req);
      if (!saved) return json({ ok: false, error: "not_connected" });
      canvas_url = saved.url;
      canvas_token = saved.token;
    }

    if (!canvas_url || !canvas_token || !course_id) {
      return json({ error: "Missing canvas_url, canvas_token, or course_id" }, 400);
    }

    const url = canvas_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const resp = await fetch(
      `https://${url}/api/v1/courses/${encodeURIComponent(String(course_id))}?include[]=syllabus_body`,
      { headers: { "Authorization": `Bearer ${canvas_token}` } },
    );

    if (resp.status === 401) return json({ ok: false, error: "invalid_token" });
    if (!resp.ok) return json({ ok: false, error: "canvas_error", status: resp.status });

    const course = await resp.json();
    const text = htmlToText(course?.syllabus_body || "");
    return json({ ok: true, found: text.length > 0, content: text });
  } catch (err) {
    return json({ ok: false, error: "unreachable", message: err instanceof Error ? err.message : String(err) });
  }
});
