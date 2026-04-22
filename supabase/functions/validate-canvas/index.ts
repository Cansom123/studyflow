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
    const resp = await fetch(`https://${url}/api/v1/courses?per_page=50&state[]=available&state[]=unpublished`, {
      headers: { "Authorization": `Bearer ${canvas_token}` },
    });

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

    const raw = await resp.json();
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
    const courses = raw
      .filter((c: any) => c && c.name && c.id)
      .sort((a: any, b: any) => (isRecent(b.name) ? 1 : 0) - (isRecent(a.name) ? 1 : 0));

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
