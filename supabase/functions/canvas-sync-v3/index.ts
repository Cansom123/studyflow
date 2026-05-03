const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function preserveIds(jsonText: string): string {
  return jsonText.replace(/:( *)(\d{16,})/g, ':$1"$2"');
}

function extractCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const m = name.match(/\|\s*(\S+)\s+--/);
  return m ? m[1] : null;
}

function isTermConcluded(courseName: string, now: Date): boolean {
  const match = courseName.toUpperCase().match(/\b(FAL|SPR|SUM|WIN)(\d{2})\b/);
  if (!match) return false;
  const termType = match[1];
  const termYear = 2000 + parseInt(match[2], 10);
  const endMonth: Record<string, number> = { FAL: 11, SPR: 4, SUM: 7, WIN: 1 };
  const termEnd = new Date(termYear, endMonth[termType] ?? 11, 28);
  return termEnd < now;
}

async function fetchAllPages(url: string, auth: string): Promise<any[] | null> {
  const results: any[] = [];
  let next: string | null = url;
  let firstRequest = true;
  while (next) {
    let resp: Response;
    try {
      resp = await fetch(next, { headers: { Authorization: auth } });
    } catch (e: any) {
      console.warn(`fetch error: ${e?.message}`);
      if (firstRequest) return null;
      break;
    }
    if (!resp.ok) {
      console.warn(`HTTP ${resp.status} for ${next}`);
      if (firstRequest) return null;
      break;
    }
    firstRequest = false;
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
    const fallYearSY = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const springYearSY = fallYearSY + 1;
    const fy2SY = String(fallYearSY).slice(-2);
    const sy2SY = String(springYearSY).slice(-2);

    const isCurrentYearCourse = (name: string): boolean => {
      const n = (name || '').toUpperCase();
      const hasTag = /\b(FAL|SPR|SUM|WIN)\d{2}\b/.test(n);
      if (!hasTag) return true;
      return n.includes(`FAL${fy2SY}`) || n.includes(`SPR${sy2SY}`) ||
        n.includes(`SUM${sy2SY}`) || n.includes(`WIN${sy2SY}`);
    };

    const activeSel = selectedCourses.filter((c) => isCurrentYearCourse(c.name || ""));
    const syncAll = activeSel.length === 0 && selectedCourses.length === 0;
    const currentSel = activeSel.filter((c) => !isTermConcluded(c.name || "", now));
    const concludedSel = activeSel.filter((c) => isTermConcluded(c.name || "", now));

    const selectedIdSet = new Set(currentSel.map((c) => String(c.id)));
    const selectedNameSet = new Set(currentSel.map((c) => c.name));
    const selectedNameLower = new Set(currentSel.map((c) => (c.name || '').toLowerCase().trim()));
    const selectedCodeSet = new Set(
      currentSel.map((c) => extractCode(c.name)).filter((x): x is string => x !== null)
    );
    const concludedCodeSet = new Set(
      concludedSel.map((c) => extractCode(c.name)).filter((x): x is string => x !== null)
    );

    console.log(`[run ${runId}] selected=${selectedCourses.length} current=${currentSel.length} concluded=${concludedSel.length} syncAll=${syncAll}`);

    const restCourses = await fetchAllPages(
      `${canvasUrl}/api/v1/courses?per_page=100&enrollment_type=student&state[]=available&state[]=completed&state[]=unpublished`,
      canvasAuth,
    ) ?? [];
    console.log(`[run ${runId}] REST courses: ${restCourses.length}`);

    const extractTerm = (name: string) =>
      (name || "").toUpperCase().match(/\b(FAL|SPR|SUM|WIN)\d{2}\b/)?.[0] ?? "";

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
            const candidateTerm = extractTerm(c.name);
            const matchingSc = currentSel.find((sc) => extractCode(sc.name) === code);
            if (!matchingSc) return false;
            const selectedTerm = extractTerm(matchingSc.name);
            return !candidateTerm || !selectedTerm || candidateTerm === selectedTerm;
          }
          if (concludedCodeSet.has(code) && !isTermConcluded(c.name || "", now)) return true;
          return false;
        });

    console.log(`[run ${runId}] matched ${matchedCourses.length}/${restCourses.length}`);
    console.log(`[run ${runId}] matched: ${matchedCourses.map((c: any) => `"${c.name}"`).join(", ")}`);

    if (!syncAll) {
      for (const sc of activeSel) {
        const found = matchedCourses.some((c: any) => {
          if (c.name === sc.name) return true;
          const code = extractCode(sc.name);
          return code !== null && extractCode(c.name) === code;
        });
        if (!found) console.warn(`[run ${runId}] NOT FOUND: "${sc.name}"`);
      }
    }

    const activeCourses = matchedCourses.filter((c: any) => !isTermConcluded(c.name || "", now));
    console.log(`[run ${runId}] active: ${activeCourses.length}`);

    const allAssignments: any[] = [];
    const allGrades: any[] = [];
    let blockedCourseCount = 0;

    // Undated assignments: keep anything created since school year start (Aug 1 of fall year).
    const undatedCutoff = new Date(fallYearSY, 7, 1);

    await Promise.all(activeCourses.map(async (course: any) => {
      const courseId = String(course.id);
      const rawAssignments = await fetchAllPages(
        `${canvasUrl}/api/v1/courses/${courseId}/assignments?per_page=100&order_by=due_at`,
        canvasAuth,
      );
      if (rawAssignments === null) {
        blockedCourseCount++;
        console.warn(`[run ${runId}] blocked: "${course.name}"`);
        return;
      }

      // Build map of submitted assignment IDs from Canvas submissions API
      const submittedMap = new Map<string, string | null>();
      const subs = await fetchAllPages(
        `${canvasUrl}/api/v1/courses/${courseId}/students/submissions?student_ids[]=self&per_page=100`,
        canvasAuth,
      );
      if (subs !== null) {
        for (const s of subs) {
          const state = s.workflow_state;
          // Mark completed for any state that means the student has acted on it
          if (s.submitted_at || state === "submitted" || state === "graded" ||
              state === "complete" || state === "pending_review") {
            submittedMap.set(String(s.assignment_id), s.submitted_at ?? null);
          }
        }
      } else {
        console.warn(`[run ${runId}] subs blocked: "${course.name}"`);
      }

      let kept = 0;
      for (const a of rawAssignments) {
        const types: string[] = a.submission_types ?? [];

        // Skip non-gradable assignment types
        if (types.includes("not_graded") || types.includes("none") || types.includes("wiki_page")) continue;

        // Skip assignments Canvas explicitly marks as locked — only when confirmed locked
        if (a.locked_for_user === true) continue;
        if (a.lock_at != null && new Date(a.lock_at) < now) continue;

        if (a.due_at === null || a.due_at === undefined) {
          const createdAt = a.created_at ? new Date(a.created_at) : null;
          if (!createdAt || createdAt < undatedCutoff) continue;
        }

        const assignmentId = String(a.id);
        const isSubmitted = submittedMap.has(assignmentId);
        allAssignments.push({
          user_id: userId,
          title: a.name,
          course: course.name,
          due_date: a.due_at ?? null,
          assignment_type: types[0] ?? "homework",
          points_possible: a.points_possible ?? null,
          completed: isSubmitted,
          completed_at: isSubmitted ? (submittedMap.get(assignmentId) ?? null) : null,
          assignment_url: a.html_url ?? null,
          is_locked: false,
        });
        kept++;
      }
      console.log(`[run ${runId}] "${course.name}": ${rawAssignments.length} raw -> ${kept} kept`);
    }));

    try {
      const courseIdToName = new Map(activeCourses.map((c: any) => [String(c.id), c.name as string]));
      const enrollments = await fetchAllPages(
        `${canvasUrl}/api/v1/users/self/enrollments?type[]=StudentEnrollment&include[]=grades&include[]=course&per_page=100`,
        canvasAuth,
      ) ?? [];
      for (const e of enrollments) {
        const courseId = String(e.course_id);
        let courseName = courseIdToName.get(courseId);
        if (!courseName && e.course?.name) {
          const eName = String(e.course.name);
          const eCode = extractCode(eName);
          if (eCode && selectedCodeSet.has(eCode)) courseName = eName;
          else if (selectedNameLower.has(eName.toLowerCase().trim())) courseName = eName;
        }
        if (!courseName || !e.grades) continue;
        const { current_score, final_score, current_grade, final_grade } = e.grades;
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
    } catch (e: any) {
      console.warn(`[run ${runId}] grades error: ${e?.message}`);
    }

    if (syncAll && activeCourses.length > 0) {
      const discovered = activeCourses.map((c: any) => ({ id: String(c.id), name: c.name }));
      await fetch(`${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify({ selected_courses: discovered }),
      });
    }

    const svcHdr = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" };
    await fetch(`${supabaseUrl}/rest/v1/assignments?user_id=eq.${userId}`, { method: "DELETE", headers: svcHdr });
    if (allAssignments.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/assignments`, {
        method: "POST",
        headers: { ...svcHdr, Prefer: "return=minimal" },
        body: JSON.stringify(allAssignments),
      });
    }
    await fetch(`${supabaseUrl}/rest/v1/grades?user_id=eq.${userId}`, { method: "DELETE", headers: svcHdr });
    if (allGrades.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/grades`, {
        method: "POST",
        headers: { ...svcHdr, Prefer: "return=minimal" },
        body: JSON.stringify(allGrades),
      });
    }

    const effectiveCourses = syncAll ? activeCourses.map((c: any) => ({ id: String(c.id), name: c.name })) : activeSel;
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

    const activeCount = allAssignments.filter((a) => !a.completed).length;
    console.log(`=== end (run ${runId}) a=${allAssignments.length} active=${activeCount} g=${allGrades.length} blocked=${blockedCourseCount} ===`);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        assignments: allAssignments.length,
        active_assignments: activeCount,
        grades: allGrades.length,
        blocked_courses: blockedCourseCount,
        courses: courseSummaries,
        sync_all: syncAll,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal error", run_id: runId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
