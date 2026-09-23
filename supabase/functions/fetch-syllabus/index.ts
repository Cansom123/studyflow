const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function htmlToText(html: string): string {
  if (!html) return "";
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { canvas_url, canvas_token, course_id } = await req.json();

    if (!canvas_url || !canvas_token || !course_id) {
      return new Response(JSON.stringify({ error: "Missing canvas_url, canvas_token, or course_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = canvas_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const resp = await fetch(
      `https://${url}/api/v1/courses/${course_id}?include[]=syllabus_body`,
      { headers: { "Authorization": `Bearer ${canvas_token}` } },
    );

    if (resp.status === 401) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      return new Response(JSON.stringify({ ok: false, error: "canvas_error", status: resp.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const course = await resp.json();
    const raw = course?.syllabus_body || "";
    const text = htmlToText(raw);

    return new Response(JSON.stringify({ ok: true, found: text.length > 0, content: text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: "unreachable", message: err instanceof Error ? err.message : String(err) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
