const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function preserveIds(jsonText: string): string {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < jsonText.length) {
    const ch = jsonText[i];
    if (inString) {
      result += ch;
      if (ch === '\\') {
        i++;
        if (i < jsonText.length) result += jsonText[i];
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }
    if (ch === '"') { inString = true; result += ch; i++; continue; }
    if (ch === ':') {
      result += ch; i++;
      let spaces = '';
      while (i < jsonText.length && jsonText[i] === ' ') { spaces += jsonText[i++]; }
      let digits = '';
      while (i < jsonText.length && jsonText[i] >= '0' && jsonText[i] <= '9') { digits += jsonText[i++]; }
      result += digits.length >= 16 ? spaces + '"' + digits + '"' : spaces + digits;
      continue;
    }
    result += ch; i++;
  }
  return result;
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

// A tag ends at the first ">" that is NOT inside a quoted attribute. Text
// pasted into Canvas from chat apps carries attributes like
// class="[&>*]:pointer-events-auto ..."; cutting at the first ">" leaked the
// rest of the attribute into the description as visible text.
const TAG_ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", bull: "•",
};

function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  let text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(new RegExp(`<br\\b${TAG_ATTRS}>`, "gi"), "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(new RegExp(`<li\\b${TAG_ATTRS}>`, "gi"), "• ")
    .replace(new RegExp(`<[a-zA-Z!/]${TAG_ATTRS}>`, "g"), "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "") // anything left with an unbalanced quote
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&") // last, so "&amp;lt;" stays "&lt;" instead of becoming "<"
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  if (text.length > 4000) text = text.slice(0, 4000).trim() + "…";
  return text;
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

    // Only a signed-in student can sync, and only their own account. (A
    // user_id in the request body used to be accepted when sign-in failed,
    // which let anyone trigger a sync of anyone's account.)
    let userId: string | null = null;
    if (token && token !== supabaseKey) {
      const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
      });
      if (r.ok) {
        const u = await r.json();
        userId = u.id;
      } else {
        console.warn(`[run ${runId}] token auth failed ${r.status}`);
      }
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Please sign in again, then sync." }), { status: 401, headers: corsHeaders });
    }

    console.log(`[run ${runId}] user=${userId}`);

    const sHdrs = { Authorization: `Bearer ${token}`, apikey: supabaseKey };

    const settingsResp = await fetch(
      `${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}&select=canvas_url,selected_courses`,
      { headers: sHdrs },
    );
    const settings = await settingsResp.json();

    // The Canvas token is kept encrypted (Supabase Vault); only this
    // server-side function can read it, through get_canvas_token.
    const tokenResp = await fetch(`${supabaseUrl}/rest/v1/rpc/get_canvas_token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId }),
    });
    const canvasToken: string | null = tokenResp.ok ? await tokenResp.json() : null;

    if (!settings?.length || !canvasToken) {
      return new Response(JSON.stringify({ error: "No Canvas token found" }), { status: 400, headers: corsHeaders });
    }

    const canvasUrl = `https://${settings[0].canvas_url}`;
    const canvasAuth = `Bearer ${canvasToken}`;
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
            if (!candidateTerm || !selectedTerm || candidateTerm === selectedTerm) return true;
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
    const debugStates: Record<string, number> = {};

    const undatedCutoff = new Date(fallYearSY, 7, 1);

    await Promise.all(activeCourses.map(async (course: any) => {
      const courseId = String(course.id);
      const rawAssignments = await fetchAllPages(
        `${canvasUrl}/api/v1/courses/${courseId}/assignments?per_page=100&order_by=due_at&include[]=submission`,
        canvasAuth,
      );
      if (rawAssignments === null) {
        blockedCourseCount++;
        console.warn(`[run ${runId}] blocked: "${course.name}"`);
        return;
      }

      let kept = 0;
      let completedCount = 0;
      for (const a of rawAssignments) {
        const types: string[] = a.submission_types ?? [];

        if (types.includes("not_graded") || types.includes("none") || types.includes("wiki_page")) continue;

        const dueCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        if (a.due_at != null && new Date(a.due_at) < dueCutoff) continue;

        if (a.due_at === null || a.due_at === undefined) {
          const createdAt = a.created_at ? new Date(a.created_at) : null;
          if (!createdAt || createdAt < undatedCutoff) continue;
        }

        const sub = a.submission;
        const state = String(sub?.workflow_state ?? "null");
        debugStates[state] = (debugStates[state] ?? 0) + 1;
        const isSubmitted = !!(sub?.submitted_at || state === "submitted" ||
          state === "complete" || state === "pending_review");

        const lockAtPassed = a.lock_at != null && new Date(a.lock_at) < now;
        const isLocked = a.locked_for_user === true || lockAtPassed;
        const lockReason = !isLocked ? null : (lockAtPassed ? "closed" : "unavailable");

        if (isSubmitted) completedCount++;
        allAssignments.push({
          user_id: userId,
          title: a.name,
          course: course.name,
          due_date: a.due_at ?? null,
          assignment_type: types[0] ?? "homework",
          points_possible: a.points_possible ?? null,
          completed: isSubmitted,
          completed_at: isSubmitted ? (sub?.submitted_at ?? null) : null,
          assignment_url: a.html_url ?? null,
          is_locked: isLocked,
          lock_reason: lockReason,
          description: htmlToText(a.description),
          score: sub?.score ?? null,
          is_missing: !!sub?.missing,
          is_excused: !!sub?.excused,
        });
        kept++;
      }
      console.log(`[run ${runId}] "${course.name}": ${rawAssignments.length} raw -> ${kept} kept (${completedCount} completed) states:${JSON.stringify(debugStates)}`);
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

    // Teacher feedback -- comments left directly on a submission, fetched
    // via the bulk "submissions for multiple assignments" endpoint so this
    // is one request per course instead of one per assignment. A
    // submission's own `user_id` is the student who owns it, so any comment
    // whose author isn't that id is someone else replying (a teacher or
    // grader), not the student's own note-to-self.
    const allFeedback: any[] = [];
    try {
      await Promise.all(activeCourses.map(async (course: any) => {
        const courseId = String(course.id);
        const submissions = await fetchAllPages(
          `${canvasUrl}/api/v1/courses/${courseId}/students/submissions` +
            `?student_ids[]=self&include[]=submission_comments&include[]=assignment&per_page=100`,
          canvasAuth,
        ) ?? [];
        for (const sub of submissions) {
          const comments = sub.submission_comments;
          if (!Array.isArray(comments) || comments.length === 0) continue;
          const assignmentTitle = sub.assignment?.name;
          if (!assignmentTitle || !sub.assignment_id) continue;
          for (const c of comments) {
            if (!c.id || !c.comment) continue;
            if (String(c.author_id) === String(sub.user_id)) continue; // the student's own comment, not a reply
            allFeedback.push({
              user_id: userId,
              canvas_comment_id: String(c.id),
              canvas_assignment_id: String(sub.assignment_id),
              assignment_title: assignmentTitle,
              course_name: course.name,
              author_name: c.author_name ?? null,
              comment_text: c.comment,
              posted_at: c.created_at ?? null,
            });
          }
        }
      }));
      console.log(`[run ${runId}] feedback: ${allFeedback.length}`);
    } catch (e: any) {
      console.warn(`[run ${runId}] feedback error: ${e?.message}`);
    }

    // Announcements -- one call across all active courses (Canvas's
    // /announcements endpoint takes a context_codes[] list) rather than a
    // per-course request. Upserted (not delete-then-reinsert like
    // assignments/grades above) so a student's read/unread state survives
    // the next sync instead of resetting every time.
    const allAnnouncements: any[] = [];
    try {
      if (activeCourses.length > 0) {
        const announceCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const contextParams = activeCourses
          .map((c: any) => `context_codes[]=course_${c.id}`)
          .join("&");
        const rawAnnouncements = await fetchAllPages(
          `${canvasUrl}/api/v1/announcements?${contextParams}&per_page=50&start_date=${announceCutoff.toISOString()}`,
          canvasAuth,
        ) ?? [];
        const courseIdToName = new Map(activeCourses.map((c: any) => [String(c.id), c.name as string]));
        for (const an of rawAnnouncements) {
          const courseId = String(an.context_code ?? "").replace(/^course_/, "");
          const courseName = courseIdToName.get(courseId);
          if (!courseName || !an.id || !an.title) continue;
          allAnnouncements.push({
            user_id: userId,
            canvas_announcement_id: String(an.id),
            course_name: courseName,
            title: an.title,
            message: htmlToText(an.message),
            author_name: an.author?.display_name ?? null,
            posted_at: an.posted_at ?? an.delayed_post_at ?? null,
            announcement_url: an.html_url ?? null,
          });
        }
        console.log(`[run ${runId}] announcements: ${allAnnouncements.length}`);
      }
    } catch (e: any) {
      console.warn(`[run ${runId}] announcements error: ${e?.message}`);
    }

    // Canvas Inbox/Conversations -- a separate feature from announcements
    // (private messages, not course-wide posts), not gated on selected
    // courses since a conversation isn't necessarily tied to one. `read` is
    // deliberately NOT set here (see the canvas_messages migration): it's
    // tracked as StudyFlow's own app state, upserted-around the same way
    // announcements.read already is, so marking it read in the app doesn't
    // get overwritten by Canvas's own workflow_state on the next sync.
    const allMessages: any[] = [];
    try {
      const rawConversations = await fetchAllPages(
        `${canvasUrl}/api/v1/conversations?scope=inbox&per_page=50`,
        canvasAuth,
      ) ?? [];
      for (const c of rawConversations) {
        if (!c.id) continue;
        const participantNames = Array.isArray(c.participants)
          ? c.participants.map((p: any) => p.name).filter(Boolean)
          : [];
        allMessages.push({
          user_id: userId,
          canvas_conversation_id: String(c.id),
          subject: c.subject || "(no subject)",
          last_message: htmlToText(c.last_message) ?? c.last_message ?? null,
          participants: participantNames.length > 0 ? participantNames.join(", ") : null,
          message_count: c.message_count ?? 1,
          last_message_at: c.last_message_at ?? null,
          conversation_url: `${canvasUrl}/conversations/${c.id}`,
        });
      }
      console.log(`[run ${runId}] messages: ${allMessages.length}`);
    } catch (e: any) {
      console.warn(`[run ${runId}] messages error: ${e?.message}`);
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

    // Upsert (not delete-then-reinsert) so a previously-read announcement
    // doesn't flip back to unread just because it came back in this sync.
    if (allAnnouncements.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/announcements?on_conflict=user_id,canvas_announcement_id`, {
        method: "POST",
        headers: { ...svcHdr, Prefer: "return=minimal,resolution=merge-duplicates" },
        body: JSON.stringify(allAnnouncements),
      });
    }
    // Prune announcements Canvas no longer returns for this user's active
    // window (unposted/deleted upstream, or older than the 30-day fetch cutoff).
    const keepIds = allAnnouncements.map((a) => a.canvas_announcement_id);
    const keepList = keepIds.length > 0 ? `(${keepIds.map((id) => `"${id}"`).join(",")})` : "()";
    await fetch(
      `${supabaseUrl}/rest/v1/announcements?user_id=eq.${userId}&canvas_announcement_id=not.in.${keepList}`,
      { method: "DELETE", headers: svcHdr },
    );

    // Upsert (not delete-then-reinsert) so `read` -- StudyFlow's own state,
    // not part of this payload -- survives the next sync the same way
    // announcements.read does.
    if (allMessages.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/canvas_messages?on_conflict=user_id,canvas_conversation_id`, {
        method: "POST",
        headers: { ...svcHdr, Prefer: "return=minimal,resolution=merge-duplicates" },
        body: JSON.stringify(allMessages),
      });
    }
    // Prune conversations Canvas's inbox no longer returns (archived, deleted,
    // or otherwise fallen out of scope).
    const keepMsgIds = allMessages.map((m) => m.canvas_conversation_id);
    const keepMsgList = keepMsgIds.length > 0 ? `(${keepMsgIds.map((id) => `"${id}"`).join(",")})` : "()";
    await fetch(
      `${supabaseUrl}/rest/v1/canvas_messages?user_id=eq.${userId}&canvas_conversation_id=not.in.${keepMsgList}`,
      { method: "DELETE", headers: svcHdr },
    );

    // Upsert (not delete-then-reinsert) so `read` survives the next sync,
    // same reasoning as canvas_messages above.
    if (allFeedback.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/assignment_feedback?on_conflict=user_id,canvas_comment_id`, {
        method: "POST",
        headers: { ...svcHdr, Prefer: "return=minimal,resolution=merge-duplicates" },
        body: JSON.stringify(allFeedback),
      });
    }
    // Prune comments no longer returned (assignment deleted, comment removed).
    const keepFeedbackIds = allFeedback.map((f) => f.canvas_comment_id);
    const keepFeedbackList = keepFeedbackIds.length > 0 ? `(${keepFeedbackIds.map((id) => `"${id}"`).join(",")})` : "()";
    await fetch(
      `${supabaseUrl}/rest/v1/assignment_feedback?user_id=eq.${userId}&canvas_comment_id=not.in.${keepFeedbackList}`,
      { method: "DELETE", headers: svcHdr },
    );

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
        announcements: allAnnouncements.length,
        messages: allMessages.length,
        feedback: allFeedback.length,
        blocked_courses: blockedCourseCount,
        courses: courseSummaries,
        sync_all: syncAll,
        debug_states: debugStates,
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
