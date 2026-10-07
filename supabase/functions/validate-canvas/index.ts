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
      if (resp.status === 401) return reply({ error: "invalid_token" });
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
