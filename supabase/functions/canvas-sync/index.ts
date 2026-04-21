const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchAllPages(url: string, authHeader: string): Promise<any[]> {
  const results: any[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const resp = await fetch(nextUrl, { headers: { "Authorization": authHeader } });
    if (!resp.ok) break;
    const data = await resp.json();
    if (Array.isArray(data)) results.push(...data);
    nextUrl = null;
    const link = resp.headers.get("Link") || "";
    for (const part of link.split(",")) {
      if (part.includes('rel="next"')) {
        const match = part.match(/<([^>]+)>/);
        if (match) nextUrl = match[1];
      }
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceHeaders = {
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
      "Content-Type": "application/json",
    };

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), { status: 400, headers: corsHeaders });
    }

    const settingsResp = await fetch(
      `${supabaseUrl}/rest/v1/user_settings?user_id=eq.${user_id}&select=canvas_url,canvas_token`,
      { headers: serviceHeaders }
    );
    const settings = await settingsResp.json();
    if (!settings?.length || !settings[0].canvas_token) {
      return new Response(JSON.stringify({ error: "No Canvas token found" }), { status: 400, headers: corsHeaders });
    }

    const canvasUrl = `https://${settings[0].canvas_url}`;
    const canvasAuth = `Bearer ${settings[0].canvas_token}`;
    const now = new Date();
    const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const courses = await fetchAllPages(
      `${canvasUrl}/api/v1/courses?enrollment_type=student&per_page=50`,
      canvasAuth
    );
    const validCourses = courses.filter((c: any) => c && typeof c === "object" && c.name);

    const allAssignments: any[] = [];
    const allGrades: any[] = [];

    await Promise.all(validCourses.map(async (course: any) => {
      try {
        const assignments = await fetchAllPages(
          `${canvasUrl}/api/v1/courses/${course.id}/assignments?order_by=due_at&per_page=50`,
          canvasAuth
        );
        for (const a of assignments) {
          if (!a.due_at) continue;
          if (new Date(a.due_at) < cutoff) continue;
          allAssignments.push({
            user_id,
            title: a.name,
            course: course.name,
            due_date: a.due_at,
            assignment_type: a.submission_types?.[0] ?? "homework",
            points_possible: a.points_possible ?? null,
          });
        }
      } catch (_) {}

      try {
        const enrollments = await fetchAllPages(
          `${canvasUrl}/api/v1/courses/${course.id}/enrollments?user_id=self&type[]=StudentEnrollment&per_page=1`,
          canvasAuth
        );
        if (enrollments.length > 0) {
          const g = enrollments[0].grades ?? {};
          if (g.current_score != null || g.final_score != null) {
            allGrades.push({
              user_id,
              canvas_course_id: String(course.id),
              course_name: course.name,
              current_score: g.current_score ?? null,
              final_score: g.final_score ?? null,
              current_grade: g.current_grade ?? null,
              final_grade: g.final_grade ?? null,
            });
          }
        }
      } catch (_) {}
    }));

    await fetch(`${supabaseUrl}/rest/v1/assignments?user_id=eq.${user_id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });

    if (allAssignments.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/assignments`, {
        method: "POST",
        headers: { ...serviceHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify(allAssignments),
      });
    }

    await fetch(`${supabaseUrl}/rest/v1/grades?user_id=eq.${user_id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });

    if (allGrades.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/grades`, {
        method: "POST",
        headers: { ...serviceHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify(allGrades),
      });
    }

    return new Response(JSON.stringify({
      success: true,
      assignments: allAssignments.length,
      grades: allGrades.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
