const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract the course-section code between "| " and " --" in CCSD course names
// e.g. "Debate/Trial - S1 - WRIGHT, M | 45100001-2 -- FAL25 - P01" → "45100001-2"
function extractCode(name: string): string | null {
  const m = name.match(/\|\s*(\S+)\s+--/);
  return m ? m[1] : null;
}

async function fetchAllPages(url: string, authHeader: string): Promise<{ items: any[]; firstStatus: number | null; firstError: string | null }> {
  const results: any[] = [];
  let nextUrl: string | null = url;
  let firstStatus: number | null = null;
  let firstError: string | null = null;
  while (nextUrl) {
    let resp: Response;
    try {
      resp = await fetch(nextUrl, { headers: { "Authorization": authHeader } });
    } catch (err: any) {
      firstError = firstError ?? `network error: ${err?.message ?? err}`;
      break;
    }
    if (firstStatus === null) firstStatus = resp.status;
    if (!resp.ok) {
      const body = await resp.text().catch(() => "<unreadable>");
      firstError = firstError ?? `HTTP ${resp.status}: ${body.slice(0, 200)}`;
      break;
    }
    let data: any;
    try {
      data = await resp.json();
    } catch (err: any) {
      firstError = firstError ?? `JSON parse error: ${err?.message ?? err}`;
      break;
    }
    if (!Array.isArray(data)) {
      firstError = firstError ?? `non-array response`;
      break;
    }
    results.push(...data);
    nextUrl = null;
    const link = resp.headers.get("Link") || "";
    for (const part of link.split(",")) {
      if (part.includes('rel="next"')) {
        const match = part.match(/<([^>]+)>/);
        if (match) nextUrl = match[1];
      }
    }
  }
  return { items: results, firstStatus, firstError };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const runId = crypto.randomUUID().slice(0, 8);
  console.log(`=== canvas-sync start (run ${runId}) ===`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");

    // --- Authenticate user ---
    let userId: string | null = null;
    let authedViaToken = false;

    if (token && token !== supabaseKey) {
      const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { "Authorization": `Bearer ${token}`, "apikey": supabaseKey },
      });
      if (userResp.ok) {
        const user = await userResp.json();
        userId = user.id;
        authedViaToken = true;
      } else {
        console.warn(`[run ${runId}] token auth failed ${userResp.status} — trying body fallback`);
      }
    }

    if (!userId) {
      let body: any = null;
      try { body = await req.json(); } catch (_) {}
      const bodyUserId = body?.user_id;
      if (!bodyUserId || typeof bodyUserId !== "string") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      userId = bodyUserId;
    }

    console.log(`[run ${runId}] user=${userId}`);

    // --- Load user settings ---
    const settingsHeaders = authedViaToken
      ? { "Authorization": `Bearer ${token}`, "apikey": supabaseKey }
      : { "Authorization": `Bearer ${serviceKey}`, "apikey": serviceKey };

    const settingsResp = await fetch(
      `${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}&select=canvas_url,canvas_token,selected_courses`,
      { headers: settingsHeaders },
    );
    const settings = await settingsResp.json();

    if (!settings?.length || !settings[0].canvas_token) {
      return new Response(JSON.stringify({ error: "No Canvas token found" }), { status: 400, headers: corsHeaders });
    }

    const canvasUrl = `https://${settings[0].canvas_url}`;
    const canvasAuth = `Bearer ${settings[0].canvas_token}`;
    const selectedCourses: Array<{ id: number | string; name: string }> =
      Array.isArray(settings[0].selected_courses) ? settings[0].selected_courses : [];

    // syncAll = true when user has no explicit selection — sync every enrolled course
    const syncAll = selectedCourses.length === 0;

    // Build multiple lookup structures for robust matching despite ID precision loss
    const selectedIdStrings = new Set(selectedCourses.map((c) => String(c.id)));
    const selectedNameSet = new Set(selectedCourses.map((c) => c.name));
    const selectedNameLower = new Set(selectedCourses.map((c) => c.name.toLowerCase().trim()));
    // Course-section codes extracted from CCSD name format "... | CODE -- TERM - Period"
    const selectedCodeSet = new Set(
      selectedCourses.map((c) => extractCode(c.name)).filter(Boolean) as string[]
    );

    console.log(`[run ${runId}] canvas_url=${canvasUrl} selected=${selectedCourses.length} syncAll=${syncAll}`);
    if (!syncAll) {
      console.log(`[run ${runId}] selectedCodes=${JSON.stringify([...selectedCodeSet])}`);
    }

    const now = new Date();
    const allAssignments: any[] = [];
    const allGrades: any[] = [];

    // --- Fetch assignments via Canvas GraphQL (bypasses per-course REST API restrictions) ---
    const gqlResp = await fetch(`${canvasUrl}/api/graphql`, {
      method: "POST",
      headers: { "Authorization": canvasAuth, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          allCourses {
            _id
            name
            assignmentsConnection(first: 200) {
              nodes {
                _id
                name
                dueAt
                pointsPossible
                submissionTypes
              }
            }
          }
        }`,
      }),
    });

    const gqlData = await gqlResp.json().catch(() => null);
    const allCourses: any[] = gqlData?.data?.allCourses ?? [];
    console.log(`[run ${runId}] graphql: status=${gqlResp.status} courses=${allCourses.length}`);

    // Log all course names returned by GraphQL for diagnostics
    if (!syncAll && allCourses.length > 0) {
      console.log(`[run ${runId}] graphql course list: ${allCourses.map((c: any) => `"${c.name}"(${c._id})`).join(", ")}`);
    }

    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    const discoveredCourses: Array<{ id: string; name: string }> = [];

    for (const course of allCourses) {
      if (!syncAll) {
        const idStr = String(course._id);
        const matchedById = selectedIdStrings.has(idStr);
        const matchedByName = selectedNameSet.has(course.name);
        const matchedByNameLower = selectedNameLower.has(course.name.toLowerCase().trim());
        const courseCode = extractCode(course.name);
        const matchedByCode = courseCode !== null && selectedCodeSet.has(courseCode);

        if (!matchedById && !matchedByName && !matchedByNameLower && !matchedByCode) {
          console.log(`[run ${runId}] skip id=${idStr} name="${course.name}" code=${courseCode ?? "none"}`);
          continue;
        }

        const how = matchedById ? "id" : matchedByName ? "name" : matchedByNameLower ? "name-ci" : "code";
        if (how !== "id") {
          console.log(`[run ${runId}] matched "${course.name}" by ${how}`);
        }
      }

      if (syncAll) {
        discoveredCourses.push({ id: course._id, name: course.name });
      }

      const nodes = course.assignmentsConnection?.nodes ?? [];
      let skippedOld = 0;
      for (const a of nodes) {
        // Include assignments with no due date — professor may not have set one yet
        if (a.dueAt) {
          const dueAt = new Date(a.dueAt);
          if (dueAt < cutoff) { skippedOld++; continue; } // drop assignments due >7 days ago
        }

        allAssignments.push({
          user_id: userId,
          title: a.name,
          course: course.name,
          due_date: a.dueAt ?? null,
          assignment_type: a.submissionTypes?.[0] ?? "homework",
          points_possible: a.pointsPossible ?? null,
        });
      }
      console.log(`[run ${runId}] course "${course.name}": ${nodes.length} total, ${skippedOld} old, ${nodes.length - skippedOld} kept`);
    }

    // If we ran in syncAll mode, save the discovered courses back to user_settings
    // IDs are stored as strings (course._id from GraphQL is already a string — exact, no precision loss)
    if (syncAll && discoveredCourses.length > 0) {
      const svcHdrs = { "Authorization": `Bearer ${serviceKey}`, "apikey": serviceKey, "Content-Type": "application/json" };
      await fetch(`${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: svcHdrs,
        body: JSON.stringify({ selected_courses: discoveredCourses }),
      });
      console.log(`[run ${runId}] auto-saved ${discoveredCourses.length} courses to user_settings`);
    }

    console.log(`[run ${runId}] assignments=${allAssignments.length} grades=${allGrades.length}`);

    // --- Write to database ---
    const serviceHeaders = {
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
      "Content-Type": "application/json",
    };

    await fetch(`${supabaseUrl}/rest/v1/assignments?user_id=eq.${userId}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });

    if (allAssignments.length > 0) {
      const insResp = await fetch(`${supabaseUrl}/rest/v1/assignments`, {
        method: "POST",
        headers: { ...serviceHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify(allAssignments),
      });
      if (!insResp.ok) {
        const body = await insResp.text().catch(() => "<unreadable>");
        console.error(`[run ${runId}] insert assignments failed ${insResp.status}: ${body.slice(0, 300)}`);
      }
    }

    await fetch(`${supabaseUrl}/rest/v1/grades?user_id=eq.${userId}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });

    if (allGrades.length > 0) {
      const insGrades = await fetch(`${supabaseUrl}/rest/v1/grades`, {
        method: "POST",
        headers: { ...serviceHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify(allGrades),
      });
      if (!insGrades.ok) {
        const body = await insGrades.text().catch(() => "<unreadable>");
        console.error(`[run ${runId}] insert grades failed ${insGrades.status}: ${body.slice(0, 300)}`);
      }
    }

    const effectiveCourses = syncAll ? discoveredCourses : selectedCourses;
    const assignmentsByCourse = new Map<string, any[]>();
    for (const a of allAssignments) {
      const list = assignmentsByCourse.get(a.course) ?? [];
      list.push(a);
      assignmentsByCourse.set(a.course, list);
    }
    const courseSummaries = effectiveCourses.map((course) => {
      const list = assignmentsByCourse.get(course.name) ?? [];
      const future = list.filter((a) => a.due_date && new Date(a.due_date) > now).length;
      return { id: course.id, name: course.name, assignments_total: list.length, assignments_future: future };
    });

    console.log(`=== canvas-sync end (run ${runId}) — assignments=${allAssignments.length} ===`);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        assignments: allAssignments.length,
        grades: allGrades.length,
        courses: courseSummaries,
        sync_all: syncAll,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error(`[run ${runId}] fatal: ${err?.message ?? err}\n${err?.stack ?? ""}`);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal error", run_id: runId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
