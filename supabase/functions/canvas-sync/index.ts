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
function extractCode(name: string | null | undefined): string | null {
  if (!name) return null;
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

    const now = new Date();

    // Filter saved selections to current school year — silently skips courses from previous
    // years without requiring users to manually clean up their settings.
    const nowSY = now;
    const fallYearSY = nowSY.getMonth() >= 7 ? nowSY.getFullYear() : nowSY.getFullYear() - 1;
    const springYearSY = fallYearSY + 1;
    const fy2SY = String(fallYearSY).slice(-2);
    const sy2SY = String(springYearSY).slice(-2);
    const isCurrentYearCourse = (name: string): boolean => {
      const n = (name || '').toUpperCase();
      const hasTag = /\b(FAL|SPR|SUM|WIN)\d{2}\b/.test(n);
      if (!hasTag) return true; // no term tag = assume active (e.g. "AP Study Hall")
      return n.includes(`FAL${fy2SY}`) || n.includes(`SPR${sy2SY}`) ||
        n.includes(`SUM${sy2SY}`) || n.includes(`WIN${sy2SY}`);
    };
    const activeSel = selectedCourses.filter((c) => isCurrentYearCourse(c.name || ""));
    if (activeSel.length < selectedCourses.length) {
      console.log(`[run ${runId}] skipped ${selectedCourses.length - activeSel.length} concluded course(s) from saved selection`);
    }

    // Fall back to syncAll only when there are no usable non-concluded selections.
    // This handles users who haven't refreshed their list since last semester.
    const syncAll = activeSel.length === 0;

    // Split active selections into current (non-concluded) and concluded.
    // Concluded selections (e.g. FAL25 courses saved during S1 setup) are used only to find
    // their current-semester equivalents via section code — their own assignments are not pulled.
    const currentSel = activeSel.filter((c) => !isTermConcluded(c.name || "", now));
    const concludedSel = activeSel.filter((c) => isTermConcluded(c.name || "", now));

    // Build match sets from currently-active selections only
    const selectedIdSet = new Set(currentSel.map((c) => String(c.id)));
    const selectedNameSet = new Set(currentSel.map((c) => c.name));
    const selectedNameLower = new Set(currentSel.map((c) => (c.name || '').toLowerCase().trim()));
    const selectedCodeSet = new Set(
      currentSel.map((c) => extractCode(c.name)).filter((x): x is string => x !== null)
    );

    // Section codes from concluded selections — used to find their current-semester equivalents.
    // e.g. if the user saved a FAL25 course with code "45100001-2", we'll find the SPR26 course
    // with the same code and pull its assignments instead.
    const concludedCodeSet = new Set(
      concludedSel.map((c) => extractCode(c.name)).filter((x): x is string => x !== null)
    );

    console.log(`[run ${runId}] selected=${selectedCourses.length} active=${activeSel.length} current=${currentSel.length} concluded=${concludedSel.length} syncAll=${syncAll}`);

    // ── STEP 1: Get ALL enrolled courses via REST ─────────────────────────────
    // Do NOT filter by enrollment_type — some districts enroll students under
    // non-standard types (observer, designer, custom) for certain courses, and
    // those courses would be silently skipped with enrollment_type=student.
    // state[]=available  → active/published courses
    // state[]=completed  → concluded/archived courses
    // state[]=unpublished → some schools keep courses unpublished throughout
    console.log(`[run ${runId}] fetching Canvas course list...`);
    const restCourses = await fetchAllPages(
      `${canvasUrl}/api/v1/courses?per_page=100` +
        `&state[]=available&state[]=completed&state[]=unpublished`,
      canvasAuth,
    );
    console.log(`[run ${runId}] REST courses: ${restCourses.length}`);

    // Extract the FAL/SPR/SUM/WIN term tag from a course name, or "" if none.
    const extractTerm = (name: string) =>
      (name || "").toUpperCase().match(/\b(FAL|SPR|SUM|WIN)\d{2}\b/)?.[0] ?? "";

    // Match REST courses against user's selected list.
    // ID is the most reliable key — it survives teacher renames and name-format variations.
    // Section-code fallback handles Canvas instances where the same course gets a new ID,
    // but we require the term tag to agree so we don't pull a different semester's section.
    const matchedCourses = syncAll
      ? restCourses
      : restCourses.filter((c: any) => {
          if (!c?.id && !c?.name) return false;
          if (selectedIdSet.has(String(c.id))) return true;
          if (!c?.name) return false;
          if (selectedNameSet.has(c.name)) return true;
          if (selectedNameLower.has((c.name as string).toLowerCase().trim())) return true;
          const code = extractCode(c.name);
          if (code === null) return false;
          if (selectedCodeSet.has(code)) {
            // Section code matches an active selection — verify term tags agree
            const candidateTerm = extractTerm(c.name);
            const matchingSc = currentSel.find((sc) => extractCode(sc.name) === code);
            if (!matchingSc) return false;
            const selectedTerm = extractTerm(matchingSc.name);
            return !candidateTerm || !selectedTerm || candidateTerm === selectedTerm;
          }
          // Check if this is the current-semester equivalent of a concluded selection.
          // e.g. SPR26 course with same section code as a FAL25 course the user previously selected.
          if (concludedCodeSet.has(code) && !isTermConcluded(c.name || "", now)) {
            return true;
          }
          return false;
        });

    console.log(`[run ${runId}] matched ${matchedCourses.length}/${restCourses.length} courses`);
    console.log(`[run ${runId}] matched: ${matchedCourses.map((c: any) => `"${c.name}"`).join(", ")}`);

    // Track selected courses that couldn't be found in Canvas at all
    const notFoundCourses: string[] = [];
    if (!syncAll) {
      for (const sc of activeSel) {
        const found = matchedCourses.some((c: any) => {
          if (c.name === sc.name) return true;
          const code = extractCode(sc.name);
          return code !== null && extractCode(c.name) === code;
        });
        if (!found) {
          console.warn(`[run ${runId}] NOT FOUND in REST: "${sc.name}"`);
          notFoundCourses.push(sc.name);
        }
      }
    }

    // Always drop concluded courses — their assignments belong to a past semester.
    // Current-semester equivalents are already included via the concludedCodeSet matching above.
    const activeCourses = matchedCourses.filter((c: any) => !isTermConcluded(c.name || "", now));
    if (activeCourses.length < matchedCourses.length) {
      const dropped = matchedCourses
        .filter((c: any) => isTermConcluded(c.name || "", now))
        .map((c: any) => `"${c.name}"`).join(", ");
      console.log(`[run ${runId}] skipping ${matchedCourses.length - activeCourses.length} concluded course(s): ${dropped}`);
    }
    console.log(`[run ${runId}] active courses: ${activeCourses.length}`);

    const allAssignments: any[] = [];
    const allGrades: any[] = [];
    let blockedCount = 0;

    // Cutoff for undated assignments: cover the whole school year (≈180 days).
    // A short cutoff (e.g. 30 days) silently drops semester-long assignments created in
    // August/January that have no due date but are still graded (e.g. participation courses).
    const undatedCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // ── STEP 2: Fetch assignments + submissions for each course in parallel ────
    await Promise.all(activeCourses.map(async (course: any) => {
      const courseId = String(course.id);

      let rawAssignments: any[] = [];
      try {
        rawAssignments = await fetchAllPages(
          `${canvasUrl}/api/v1/courses/${courseId}/assignments` +
            `?per_page=100&include[]=submission&order_by=due_at`,
          canvasAuth,
        );
      } catch (e: any) {
        console.warn(`[run ${runId}] assignments fetch failed for "${course.name}": ${e?.message}`);
        blockedCount++;
        return;
      }

      // Fetch submission status from the dedicated submissions endpoint.
      // student_ids[]=self resolves to the authenticated user — works for every user.
      // This is more reliable than include[]=submission for schools that restrict that data.
      const submittedMap = new Map<string, string | null>(); // assignment_id → submitted_at
      try {
        const subs = await fetchAllPages(
          `${canvasUrl}/api/v1/courses/${courseId}/students/submissions` +
            `?student_ids[]=self&per_page=100`,
          canvasAuth,
        );
        for (const s of subs) {
          // submitted_at is the reliable signal that a student actually turned something in.
          // "graded" without submitted_at is a teacher auto-zero — don't treat as completed.
          if (s.submitted_at || s.workflow_state === "submitted" || s.workflow_state === "pending_review") {
            submittedMap.set(String(s.assignment_id), s.submitted_at ?? null);
          }
        }
        console.log(`[run ${runId}] "${course.name}": ${submittedMap.size} submitted`);
      } catch (e: any) {
        console.warn(`[run ${runId}] submissions fetch failed for "${course.name}": ${e?.message}`);
      }

      let kept = 0;
      for (const a of rawAssignments) {
        const sub = a.submission;
        const wf = sub?.workflow_state;
        const assignmentId = String(a.id);

        // Combine both data sources to determine if the student completed this assignment.
        // "graded" without submitted_at = teacher auto-zero; keep it so the student sees missing work.
        const isCompleted =
          !!(sub?.submitted_at || wf === "submitted" || wf === "pending_review") ||
          submittedMap.has(assignmentId);
        const completedAt: string | null =
          sub?.submitted_at ?? submittedMap.get(assignmentId) ?? null;

        const types: string[] = a.submission_types ?? [];
        // Skip only assignments Canvas marks as non-graded or wiki pages — purely informational.
        // "none" is intentionally allowed: it covers in-person/performance grades (speeches,
        // debates, participation) that the student needs to see even though nothing is uploaded.
        const isNonWork = types.length > 0 &&
          types.every((t: string) => t === "not_graded" || t === "wiki_page");

        // Store Canvas's lock signal in the DB but do NOT use it to filter display —
        // locked_for_user is true for any past-due assignment whose window closed, including
        // overdue work the student still needs to see. The completed flag handles hiding done work.
        const isLocked = a.locked_for_user === true;

        if (a.due_at === null || a.due_at === undefined) {
          // Undated: skip informational items and assignments created more than 30 days ago
          if (isNonWork) continue;
          const createdAt = a.created_at ? new Date(a.created_at) : null;
          if (!createdAt || createdAt < undatedCutoff) continue;
        } else {
          if (isNonWork) continue;
        }

        allAssignments.push({
          user_id: userId,
          title: a.name,
          course: course.name,
          due_date: a.due_at ?? null,
          assignment_type: types[0] ?? "homework",
          points_possible: a.points_possible ?? null,
          completed: isCompleted,
          completed_at: completedAt,
          assignment_url: a.html_url ?? null,
          is_locked: isLocked,
        });
        kept++;
      }

      console.log(
        `[run ${runId}] "${course.name}": ${rawAssignments.length} raw → ${kept} kept`,
      );
    }));

    // ── STEP 3: Fetch grades for all enrolled courses in one call ─────────────
    console.log(`[run ${runId}] fetching grades...`);
    const courseIdToName = new Map(activeCourses.map((c: any) => [String(c.id), c.name as string]));

    try {
      const enrollments = await fetchAllPages(
        `${canvasUrl}/api/v1/users/self/enrollments` +
          `?type[]=StudentEnrollment&include[]=grades&include[]=course&per_page=100`,
        canvasAuth,
      );

      for (const e of enrollments) {
        const courseId = String(e.course_id);
        let courseName = courseIdToName.get(courseId);

        // Fallback: enrollment embeds the course object — match by section code or name.
        // This handles Canvas instances where the enrollment course_id differs from the
        // id returned by the /courses endpoint (seen on some district Canvas setups).
        if (!courseName && e.course?.name) {
          const eName = String(e.course.name);
          const eCode = extractCode(eName);
          if (eCode && selectedCodeSet.has(eCode)) {
            courseName = eName;
          } else if (selectedNameLower.has(eName.toLowerCase().trim())) {
            courseName = eName;
          }
        }

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
    if (syncAll && activeCourses.length > 0) {
      const discovered = activeCourses.map((c: any) => ({ id: String(c.id), name: c.name }));
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

    // Build per-course assignment summary for the response (active courses only)
    const effectiveCourses = syncAll
      ? activeCourses.map((c: any) => ({ id: String(c.id), name: c.name }))
      : activeSel;

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
        blocked_courses: blockedCount,
        not_found_courses: notFoundCourses,
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
