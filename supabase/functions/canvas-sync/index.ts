const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Canvas uses 64-bit integer IDs that exceed JS float64 precision.
// Replace bare large integers in JSON text with quoted strings before parsing.
function preserveIds(jsonText: string): string {
  return jsonText.replace(/:(\s*)(\d{16,})/g, ':$1"$2"');
}

// Extract CCSD section code: "Course - S1 - TEACHER | 45100001-2 -- FAL25 - P01" → "45100001-2"
function extractCode(name: string): string | null {
  const m = name.match(/\|\s*(\S+)\s+--/);
  return m ? m[1] : null;
}

// Return true when the semester tag in a course name refers to a concluded term.
// e.g. "FAL25" is concluded in Spring 2026; "SPR26" is current.
function isTermConcluded(courseName: string, now: Date): boolean {
  const match = courseName.toUpperCase().match(/\b(FAL|SPR|SUM|WIN)(\d{2})\b/);
  if (!match) return false;
  const termType = match[1];
  const termYear = 2000 + parseInt(match[2], 10);
  // Approximate last month of each term type (0-indexed)
  const endMonth: Record<string, number> = { FAL: 11, SPR: 4, SUM: 7, WIN: 1 };
  const termEnd = new Date(termYear, endMonth[termType] ?? 11, 28);
  return termEnd < now;
}

// Fetch all pages of a paginated Canvas REST endpoint, preserving large IDs as strings.
async function fetchAllPages(url: string, auth: string): Promise<any[]> {
  const results: any[] = [];
  let next: string | null = url;
  while (next) {
    let resp: Response;
    try {
      resp = await fetch(next, { headers: { Authorization: auth } });
    } catch (e: any) {
      console.warn(`fetch error: ${e?.message}`);
      break;
    }
    if (!resp.ok) {
      console.warn(`HTTP ${resp.status} for ${next}`);
      break;
    }
    const text = await resp.text();
    let data: any;
    try { data = JSON.parse(preserveIds(text)); } catch (_) { break; }
    if (!Array.isArray(data)) break;
    results.push(...data);
    next = null;
    for (const part of (resp.headers.get("Link") || "").split(",")) {
      if (part.includes('rel="next"')) {
        const m = part.match(/<([^>]+)>/);
        if (m) next = m[1];
      }
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const runId = crypto.randomUUID().slice(0, 8);
  console.log(`=== canvas-sync start (run ${runId}) ===`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");

    // --- Authenticate ---
    let userId: string | null = null;
    let authedViaToken = false;

    if (token && token !== supabaseKey) {
      const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
      });
      if (r.ok) {
        const u = await r.json();
        userId = u.id;
        authedViaToken = true;
      } else {
        console.warn(`[run ${runId}] token auth failed ${r.status}`);
      }
    }

    if (!userId) {
      let body: any = null;
      try { body = await req.json(); } catch (_) {}
      const bid = body?.user_id;
      if (!bid || typeof bid !== "string") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      userId = bid;
    }

    console.log(`[run ${runId}] user=${userId}`);

    // --- Load user settings ---
    const sHdrs = authedViaToken
      ? { Authorization: `Bearer ${token}`, apikey: supabaseKey }
      : { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };

    const settingsResp = await fetch(
      `${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}&select=canvas_url,canvas_token,selected_courses`,
      { headers: sHdrs },
    );
    const settings = await settingsResp.json();

    if (!settings?.length || !settings[0].canvas_token) {
      return new Response(JSON.stringify({ error: "No Canvas token found" }), { status: 400, headers: corsHeaders });
    }

    const canvasUrl = `https://${settings[0].canvas_url}`;
    const canvasAuth = `Bearer ${settings[0].canvas_token}`;
    const selectedCourses: Array<{ id: number | string; name: string }> =
      Array.isArray(settings[0].selected_courses) ? settings[0].selected_courses : [];

    const syncAll = selectedCourses.length === 0;

    // Build match sets for name / section-code based matching
    const selectedNameSet = new Set(selectedCourses.map((c) => c.name));
    const selectedNameLower = new Set(selectedCourses.map((c) => c.name.toLowerCase().trim()));
    const selectedCodeSet = new Set(
      selectedCourses.map((c) => extractCode(c.name)).filter((x): x is string => x !== null)
    );

    console.log(`[run ${runId}] selected=${selectedCourses.length} syncAll=${syncAll}`);

    const now = new Date();
    // Only include assignments due within the last 3 days or in the future
    const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // ── STEP 1: Get ALL enrolled courses via REST ─────────────────────────────
    // state[]=available  → active/published courses
    // state[]=completed  → concluded/archived courses
    // state[]=unpublished → some schools keep courses unpublished throughout
    // This is more reliable than GraphQL allCourses which can miss concluded courses.
    console.log(`[run ${runId}] fetching Canvas course list...`);
    const restCourses = await fetchAllPages(
      `${canvasUrl}/api/v1/courses?per_page=100&enrollment_type=student` +
        `&state[]=available&state[]=completed&state[]=unpublished`,
      canvasAuth,
    );
    console.log(`[run ${runId}] REST courses: ${restCourses.length}`);

    // Match REST courses against user's selected list
    const matchedCourses = syncAll
      ? restCourses
      : restCourses.filter((c: any) => {
          if (!c?.name) return false;
          if (selectedNameSet.has(c.name)) return true;
          if (selectedNameLower.has((c.name as string).toLowerCase().trim())) return true;
          const code = extractCode(c.name);
          return code !== null && selectedCodeSet.has(code);
        });

    console.log(`[run ${runId}] matched ${matchedCourses.length}/${restCourses.length} courses`);
    console.log(`[run ${runId}] matched: ${matchedCourses.map((c: any) => `"${c.name}"`).join(", ")}`);

    // Log any selected courses that didn't match (helps diagnose name mismatches)
    if (!syncAll) {
      for (const sc of selectedCourses) {
        const found = matchedCourses.some((c: any) => {
          if (c.name === sc.name) return true;
          const code = extractCode(sc.name);
          return code !== null && extractCode(c.name) === code;
        });
        if (!found) console.warn(`[run ${runId}] NOT FOUND in REST: "${sc.name}"`);
      }
    }

    const allAssignments: any[] = [];
    const allGrades: any[] = [];

    // ── STEP 2: Fetch assignments for each course in parallel ─────────────────
    await Promise.all(matchedCourses.map(async (course: any) => {
      const courseId = String(course.id);
      const concluded = isTermConcluded(course.name || "", now);

      let rawAssignments: any[] = [];
      try {
        rawAssignments = await fetchAllPages(
          `${canvasUrl}/api/v1/courses/${courseId}/assignments` +
            `?per_page=100&include[]=submission&order_by=due_at`,
          canvasAuth,
        );
      } catch (e: any) {
        console.warn(`[run ${runId}] assignments fetch failed for "${course.name}": ${e?.message}`);
        return;
      }

      let kept = 0;
      for (const a of rawAssignments) {
        // Skip assignments the student has already submitted or that are graded
        const wf = a.submission?.workflow_state;
        if (wf === "graded" || wf === "submitted") continue;

        // Classify submission types
        const types: string[] = a.submission_types ?? [];
        const isNonWork = types.length > 0 &&
          types.every((t: string) => t === "none" || t === "not_graded" || t === "on_paper" || t === "wiki_page");

        if (a.due_at === null || a.due_at === undefined) {
          // No due date: skip if from a concluded term OR non-submittable type
          if (concluded || isNonWork) continue;
        } else {
          if (new Date(a.due_at) < cutoff) continue; // older than 3 days → skip
        }

        allAssignments.push({
          user_id: userId,
          title: a.name,
          course: course.name,
          due_date: a.due_at ?? null,
          assignment_type: types[0] ?? "homework",
          points_possible: a.points_possible ?? null,
        });
        kept++;
      }

      console.log(
        `[run ${runId}] "${course.name}" (${concluded ? "concluded" : "active"}): ` +
          `${rawAssignments.length} raw → ${kept} kept`,
      );
    }));

    // ── STEP 3: Fetch grades for all enrolled courses in one call ─────────────
    console.log(`[run ${runId}] fetching grades...`);
    const courseIdToName = new Map(matchedCourses.map((c: any) => [String(c.id), c.name as string]));

    try {
      const enrollments = await fetchAllPages(
        `${canvasUrl}/api/v1/users/self/enrollments` +
          `?type[]=StudentEnrollment&include[]=grades&per_page=100`,
        canvasAuth,
      );

      for (const e of enrollments) {
        const courseId = String(e.course_id);
        const courseName = courseIdToName.get(courseId);
        if (!courseName || !e.grades) continue;
        const { current_score, final_score, current_grade, final_grade } = e.grades;
        // Skip rows where Canvas hasn't published any grade data yet
        if (current_score == null && final_score == null && !current_grade && !final_grade) continue;
        allGrades.push({
          user_id: userId,
          canvas_course_id: courseId,
          course_name: courseName,
          current_score: current_score ?? null,
          final_score: final_score ?? null,
          current_grade: current_grade ?? null,
          final_grade: final_grade ?? null,
          synced_at: now.toISOString(),
        });
      }
      console.log(`[run ${runId}] grades with data: ${allGrades.length}`);
    } catch (e: any) {
      console.warn(`[run ${runId}] grades fetch failed: ${e?.message}`);
    }

    // Save discovered courses back to settings when running in syncAll mode
    if (syncAll && matchedCourses.length > 0) {
      const discovered = matchedCourses.map((c: any) => ({ id: String(c.id), name: c.name }));
      await fetch(`${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selected_courses: discovered }),
      });
      console.log(`[run ${runId}] auto-saved ${discovered.length} courses`);
    }

    console.log(`[run ${runId}] assignments=${allAssignments.length} grades=${allGrades.length}`);

    // ── STEP 4: Write to database ─────────────────────────────────────────────
    const svcHdr = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    };

    await fetch(`${supabaseUrl}/rest/v1/assignments?user_id=eq.${userId}`, {
      method: "DELETE",
      headers: svcHdr,
    });

    if (allAssignments.length > 0) {
      const r = await fetch(`${supabaseUrl}/rest/v1/assignments`, {
        method: "POST",
        headers: { ...svcHdr, Prefer: "return=minimal" },
        body: JSON.stringify(allAssignments),
      });
      if (!r.ok) {
        console.error(`[run ${runId}] insert assignments failed ${r.status}: ${(await r.text()).slice(0, 300)}`);
      }
    }

    await fetch(`${supabaseUrl}/rest/v1/grades?user_id=eq.${userId}`, {
      method: "DELETE",
      headers: svcHdr,
    });

    if (allGrades.length > 0) {
      const r = await fetch(`${supabaseUrl}/rest/v1/grades`, {
        method: "POST",
        headers: { ...svcHdr, Prefer: "return=minimal" },
        body: JSON.stringify(allGrades),
      });
      if (!r.ok) {
        console.error(`[run ${runId}] insert grades failed ${r.status}: ${(await r.text()).slice(0, 300)}`);
      }
    }

    // Build per-course assignment summary for the response
    const effectiveCourses = syncAll
      ? matchedCourses.map((c: any) => ({ id: String(c.id), name: c.name }))
      : selectedCourses;

    const assignmentsByCourse = new Map<string, any[]>();
    for (const a of allAssignments) {
      const list = assignmentsByCourse.get(a.course) ?? [];
      list.push(a);
      assignmentsByCourse.set(a.course, list);
    }

    const courseSummaries = effectiveCourses.map((course) => {
      const list = assignmentsByCourse.get(course.name) ?? [];
      const future = list.filter((a: any) => a.due_date && new Date(a.due_date) > now).length;
      return { id: course.id, name: course.name, assignments_total: list.length, assignments_future: future };
    });

    console.log(`=== canvas-sync end (run ${runId}) assignments=${allAssignments.length} grades=${allGrades.length} ===`);

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
    console.error(`[run ${runId}] fatal: ${err?.message ?? err}`);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal error", run_id: runId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
