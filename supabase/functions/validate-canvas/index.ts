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
    const resp = await fetch(`https://${url}/api/v1/courses?enrollment_type=student&per_page=50`, {
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
    const courses = raw.filter((c: any) => c && c.name && c.id && c.workflow_state !== "completed");

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
