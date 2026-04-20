Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  const auth = req.headers.get("Authorization") || "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY")!;

    const svcHeaders = {
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
      "Content-Type": "application/json",
    };

    // Tomorrow's date range (UTC)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const assignResp = await fetch(
      `${supabaseUrl}/rest/v1/assignments?due_date=gte.${tomorrow.toISOString()}&due_date=lt.${dayAfter.toISOString()}&select=user_id,title,course,due_date`,
      { headers: svcHeaders }
    );
    const assignments = await assignResp.json();

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "no assignments due tomorrow" }));
    }

    // Group by user_id
    const byUser: Record<string, any[]> = {};
    for (const a of assignments) {
      if (!byUser[a.user_id]) byUser[a.user_id] = [];
      byUser[a.user_id].push(a);
    }

    let sent = 0;
    for (const [userId, items] of Object.entries(byUser)) {
      const userResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, { headers: svcHeaders });
      if (!userResp.ok) continue;
      const user = await userResp.json();
      const email = user.email;
      if (!email) continue;

      const listHtml = items.map((a: any) =>
        `<li style="margin-bottom:8px;"><strong>${a.title}</strong><br><span style="color:#8e8e93;font-size:13px;">${a.course || ""}</span></li>`
      ).join("");

      const emailResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "StudyFlow <onboarding@resend.dev>",
          to: [email],
          subject: `📋 ${items.length} assignment${items.length > 1 ? "s" : ""} due tomorrow`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f2f2f7;border-radius:16px;">
              <div style="background:#fff;border-radius:12px;padding:24px;border:0.5px solid #e0e0e0;">
                <div style="font-size:22px;font-weight:700;color:#1c1c1e;margin-bottom:4px;">Due tomorrow</div>
                <div style="font-size:14px;color:#8e8e93;margin-bottom:20px;">Here's what needs your attention:</div>
                <ul style="list-style:none;padding:0;margin:0;color:#1c1c1e;line-height:1.6;">
                  ${listHtml}
                </ul>
                <div style="margin-top:24px;padding-top:16px;border-top:0.5px solid #e0e0e0;font-size:12px;color:#8e8e93;">
                  StudyFlow · stay ahead of your work.
                </div>
              </div>
            </div>
          `,
        }),
      });

      if (emailResp.ok) sent++;
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
