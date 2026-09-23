Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svcHdrs = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };

  const settingsResp = await fetch(
    `${supabaseUrl}/rest/v1/user_settings?calendar_token=eq.${encodeURIComponent(token)}&select=user_id`,
    { headers: svcHdrs }
  );
  const settings = await settingsResp.json();

  if (!Array.isArray(settings) || settings.length === 0) {
    return new Response("Invalid token", { status: 404 });
  }

  const userId = settings[0].user_id;

  const assignmentsResp = await fetch(
    `${supabaseUrl}/rest/v1/assignments?user_id=eq.${userId}&completed=eq.false&order=due_date.asc.nullslast&select=*`,
    { headers: svcHdrs }
  );
  const assignments = await assignmentsResp.json();

  const studyResp = await fetch(
    `${supabaseUrl}/rest/v1/study_sessions?user_id=eq.${userId}&order=session_date.asc&select=*`,
    { headers: svcHdrs }
  );
  const studySessions = await studyResp.json();

  const now = new Date();
  const dtstamp = formatDt(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyFlow//StudyFlow Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:StudyFlow Assignments",
    "X-WR-CALDESC:Your assignments synced from Canvas, plus your own study time",
    "X-WR-TIMEZONE:UTC",
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
  ];

  for (const a of (Array.isArray(assignments) ? assignments : [])) {
    if (!a.due_date) continue;

    const start = new Date(a.due_date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${a.id}@studyflow`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${formatDt(start)}`);
    lines.push(`DTEND:${formatDt(end)}`);
    lines.push(`SUMMARY:${esc(a.title || "Assignment")}`);

    const desc = [a.course, a.assignment_type].filter(Boolean).join(" · ");
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    if (a.assignment_url) lines.push(`URL:${a.assignment_url}`);

    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${esc(a.title || "Assignment")} due tomorrow`);
    lines.push("TRIGGER:-P1D");
    lines.push("END:VALARM");

    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${esc(a.title || "Assignment")} due in 1 hour`);
    lines.push("TRIGGER:-PT1H");
    lines.push("END:VALARM");

    lines.push("END:VEVENT");
  }

  for (const s of (Array.isArray(studySessions) ? studySessions : [])) {
    if (!s.session_date) continue;
    const datePart = String(s.session_date).replace(/-/g, "");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${s.id}@studyflow-study`);
    lines.push(`DTSTAMP:${dtstamp}`);

    if (s.start_time) {
      const startTime = String(s.start_time).slice(0, 5).replace(":", "") + "00";
      lines.push(`DTSTART:${datePart}T${startTime}`);
      if (s.end_time) {
        const endTime = String(s.end_time).slice(0, 5).replace(":", "") + "00";
        lines.push(`DTEND:${datePart}T${endTime}`);
      } else {
        lines.push(`DTEND:${datePart}T${startTime}`);
      }
    } else {
      lines.push(`DTSTART;VALUE=DATE:${datePart}`);
    }

    lines.push(`SUMMARY:${esc("Study: " + (s.title || "Study session"))}`);

    const desc = [s.course, s.notes].filter(Boolean).join(" · ");
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="studyflow.ics"',
      "Cache-Control": "no-cache",
    },
  });
});

function formatDt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
