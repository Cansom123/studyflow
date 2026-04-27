const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      const page = await resp.json();
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
    // Dynamically compute current school year so sorting works for any user, any year
    const now = new Date();
    const yr = now.getFullYear();
    const fallYear = now.getMonth() >= 7 ? yr : yr - 1; // Aug onwards = new fall
    const springYear = fallYear + 1;
    const fy2 = String(fallYear).slice(-2);
    const sy2 = String(springYear).slice(-2);
    const isRecent = (name: string) => {
      const n = name.toUpperCase();
      return n.includes(`FAL${fy2}`) || n.includes(`SPR${sy2}`) ||
        n.includes(`SUM${sy2}`) || n.includes(`WIN${sy2}`) ||
        n.includes(String(fallYear)) || n.includes(String(springYear));
    };
    // Exclude courses whose term has clearly concluded so they don't appear in the
    // selection UI and can't be accidentally re-added to the user's active list.
    const isTermConcluded = (name: string): boolean => {
      const match = name.toUpperCase().match(/\b(FAL|SPR|SUM|WIN)(\d{2})\b/);
      if (!match) return false;
      const termType = match[1];
      const termYear = 2000 + parseInt(match[2], 10);
      const endMonth: Record<string, number> = { FAL: 11, SPR: 4, SUM: 7, WIN: 1 };
      const termEnd = new Date(termYear, endMonth[termType] ?? 11, 28);
      return termEnd < now;
    };
    // Show every course Canvas returns — don't hide based on term guessing.
    // Sort: recent-term courses first, concluded ones last, so the list is useful.
    const courses = raw
      .filter((c: any) => c && c.name && c.id)
      .sort((a: any, b: any) => {
        const aRecent = isRecent(a.name) ? 2 : isTermConcluded(a.name) ? 0 : 1;
        const bRecent = isRecent(b.name) ? 2 : isTermConcluded(b.name) ? 0 : 1;
        return bRecent - aRecent;
      })
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
