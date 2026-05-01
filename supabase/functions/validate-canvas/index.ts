const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Canvas uses 64-bit integer IDs that exceed JS float64 safe range (~9e15).
// Quote them before JSON.parse to prevent precision loss (e.g. 179010000001170340 â†’ 179010000001170336).
function preserveIds(jsonText: string): string {
  return jsonText.replace(/:(\s*)(\d{16,})/g, ':$1"$2"');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { canvas_url, canvas_token } = await req.json();

    if (!canvas_url || !canvas_token) {
      return new Response(JSON.stringify({ error: "Missing canvas_url or canvas_token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = canvas_url.replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Fetch all pages, mirroring the states canvas-sync uses so the selection
    // UI shows the same courses that will actually be synced.
    const baseUrl = `https://${url}/api/v1/courses?per_page=100&enrollment_type=student` +
      `&state[]=available&state[]=completed&state[]=unpublished`;
    const raw: any[] = [];
    let next: string | null = baseUrl;
    while (next) {
      const resp = await fetch(next, { headers: { "Authorization": `Bearer ${canvas_token}` } });
      if (resp.status === 401) {
        return new Response(JSON.stringify({ error: "invalid_token" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 403) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!resp.ok) {
        return new Response(JSON.stringify({ error: "canvas_error", status: resp.status }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await resp.text();
      let page: any;
      try { page = JSON.parse(preserveIds(text)); } catch (_) { break; }
      if (!Array.isArray(page)) break;
      raw.push(...page);
      next = null;
      for (const part of (resp.headers.get("Link") || "").split(",")) {
        if (part.includes('rel="next"')) {
          const m = part.match(/<([^>]+)>/);
          if (m) next = m[1];
        }
      }
    }
    // Compute current school year â€” works automatically every semester, no code changes needed.
    // Before August â†’ spring semester of fallYear/springYear; August+ â†’ fall semester.
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
    // A course has a term tag if it contains FAL/SPR/SUM/WIN + 2-digit year.
    // Untagged courses (e.g. "Speech and Debate") have no year info â€” keep them.
    const hasTermTag = (name: string): boolean =>
      /\b(FAL|SPR|SUM|WIN)\d{2}\b/.test(name.toUpperCase());

    // Only return courses from the current school year.
    // Old courses are hidden entirely â€” users should not be able to accidentally select them.
    const courses = raw
      .filter((c: any) => c && c.name && c.id)
      .filter((c: any) => !hasTermTag(c.name) || isCurrentYear(c.name))
      .map((c: any) => ({ ...c, id: String(c.id) }));

    return new Response(JSON.stringify({ ok: true, courses }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "unreachable", message: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
