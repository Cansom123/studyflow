const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function preserveIds(jsonText: string): string {
  return jsonText.replace(/:( *)(\d{16,})/g, ':$1"$2"');
}

const reply = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

// The signed-in student's own Canvas URL and (decrypted) token, from the
// JWT in the Authorization header. Null when not signed in or not connected.
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
    let canvas_url: string | undefined = body.canvas_url;
    let canvas_token: string | undefined = body.canvas_token;

    // No token sent: check the signed-in student's saved connection instead
    // ("Did we miss a class?" re-lists their courses this way). The token is
    // stored encrypted and never sent to the browser.
    if (!canvas_token) {
      const saved = await savedCanvasFor(req);
      if (!saved) return reply({ error: "not_connected" });
      canvas_url = saved.url;
      canvas_token = saved.token;
    }

    if (!canvas_url || !canvas_token) {
      return new Response(JSON.stringify({ error: "Missing canvas_url or canvas_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only the host name: students paste whole address-bar URLs
    // (".../courses/123?login_success=1"), and a path made Canvas answer 404.
    const url = String(canvas_url).trim().toLowerCase().replace(/\s+/g, "")
      .replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "");
    const token = String(canvas_token).replace(/^\s*bearer\s+/i, "").replace(/\s+/g, "");
    // Shape only, never the token: a full Canvas token looks like
    // "<digits>~<64 characters>", so length and the "~" part show whether a
    // pasted token was cut short or isn't a Canvas access token at all.
    const tilde = token.indexOf("~");
    console.log(`validate-canvas token len=${token.length} prefixDigits=${tilde > 0 && /^\d+$/.test(token.slice(0, tilde))} afterTilde=${tilde >= 0 ? token.length - tilde - 1 : -1} dots=${(token.match(/\./g) || []).length}`);

    const baseUrl = `https://${url}/api/v1/courses?per_page=100&enrollment_type=student` +
      `&state[]=available&state[]=completed&state[]=unpublished`;
    const raw: any[] = [];
    let next: string | null = baseUrl;
    let firstPage = true;
    while (next) {
      const resp = await fetch(next, { headers: { "Authorization": `Bearer ${token}` } });
      console.log(`validate-canvas host=${url} status=${resp.status}`);
      if (resp.status === 401) {
        // Canvas's own reason ("Invalid access token.", an expired token,
        // "user authorization required"...): tells a typo'd token from an
        // expired or revoked one. Contains no token data.
        const why = (await resp.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
        console.log(`validate-canvas 401 www-auth=${resp.headers.get("www-authenticate") || "-"} body=${why}`);
        // An expired token needs a different fix (a new token with no or a
        // later expiry date) than a mistyped one, so say which it is.
        if (/expired/i.test(why)) {
          const expiredAt = (why.match(/"expired_at"\s*:\s*"([^"]+)"/) || [])[1] || null;
          return reply({ error: "expired_token", expired_at: expiredAt });
        }
        return reply({ error: "invalid_token" });
      }
      if (resp.status === 403) return reply({ error: "forbidden" });
      if (!resp.ok) return reply({ error: "canvas_error", status: resp.status });
      const text = await resp.text();
      let page: any;
      try { page = JSON.parse(preserveIds(text)); } catch (_) { page = null; }
      if (!Array.isArray(page)) {
        // A real Canvas answers with a JSON list. Anything else (a school
        // login page, a different website) means this isn't the Canvas
        // address, so say so instead of "connected, 0 classes".
        if (firstPage) {
          console.log(`validate-canvas host=${url} not_canvas`);
          return reply({ error: "not_canvas" });
        }
        break;
      }
      firstPage = false;
      raw.push(...page);
      next = null;
      for (const part of (resp.headers.get("Link") || "").split(",")) {
        if (part.includes('rel="next"')) {
          const m = part.match(/<([^>]+)>/);
          if (m) next = m[1];
        }
      }
    }
    const now = new Date();
    const fallYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const springYear = fallYear + 1;
    const fy2 = String(fallYear).slice(-2);
    const sy2 = String(springYear).slice(-2);

    const isCurrentYear = (name: string): boolean => {
      const n = name.toUpperCase();
      return n.includes(`FAL${fy2}`) || n.includes(`SPR${sy2}`) ||
        n.includes(`SUM${sy2}`) || n.includes(`WIN${sy2}`) ||
        n.includes(String(fallYear)) || n.includes(String(springYear)) ||
        n.includes(`${fy2}/${sy2}`) || n.includes(`${fy2}-${sy2}`);
    };
    const hasTermTag = (name: string): boolean =>
      /\b(FAL|SPR|SUM|WIN)\d{2}\b/.test(name.toUpperCase());

    const courses = raw
      .filter((c: any) => c && c.name && c.id)
      .filter((c: any) => !hasTermTag(c.name) || isCurrentYear(c.name))
      .map((c: any) => ({ ...c, id: String(c.id) }));

    console.log(`validate-canvas host=${url} ok courses=${courses.length}`);
    return reply({ ok: true, courses });
  } catch (err: any) {
    console.log(`validate-canvas unreachable: ${err?.message}`);
    return reply({ error: "unreachable", message: err.message });
  }
});
