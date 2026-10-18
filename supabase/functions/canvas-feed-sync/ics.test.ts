// Run with: node supabase/functions/canvas-feed-sync/ics.test.ts
// The sample follows what Canvas writes (app/models/calendar_event.rb, IcalEvent#to_ics).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFeedUrl, parseCanvasFeed } from "./ics.ts";

const SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Instructure//Canvas//EN",
  // A plain assignment, timed (UTC).
  "BEGIN:VEVENT",
  "DTEND:20261021T045900Z",
  "DTSTART:20261021T045900Z",
  "SUMMARY:Cell Respiration Lab [BIO-101-S1]",
  "UID:event-assignment-12345",
  "URL;VALUE=URI:https://school.instructure.com/calendar?include_contexts=course_678&month=10&year=2026#assignment_12345",
  "DESCRIPTION:Write up your results\\, then submit a PDF.\\nInclude graphs.",
  "X-ALT-DESC;FMTTYPE=text/html:<p>Write up your results\\, then submit a <b>PDF</b>.</p><p>Include g",
  " raphs.</p>",
  "END:VEVENT",
  // A whole-day item: VALUE=DATE and no DTEND.
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261024",
  "SUMMARY:Chapter 6 Reading [HIST-210]",
  "UID:event-assignment-222",
  "URL;VALUE=URI:https://school.instructure.com/calendar?include_contexts=course_900&month=10&year=2026#assignment_222",
  "END:VEVENT",
  // A section/personal due date: the UID has the override's id (77), the
  // link still names the assignment (333). Written with TZID=UTC.
  "BEGIN:VEVENT",
  "DTSTART;TZID=UTC:20261027T045900",
  "DTEND;TZID=UTC:20261027T045900",
  "SUMMARY:Problem Set 7 (Period 3) [MATH-AP]",
  "UID:event-assignment-override-77",
  "URL;VALUE=URI:https://school.instructure.com/calendar?include_contexts=course_55&month=10&year=2026#assignment_333",
  "END:VEVENT",
  // A discussion checkpoint.
  "BEGIN:VEVENT",
  "DTSTART:20261028T045900Z",
  "SUMMARY:Week 8 Discussion Reply to Topic [ENG-101]",
  "UID:event-sub-assignment-91",
  "URL;VALUE=URI:https://school.instructure.com/calendar?include_contexts=course_12&month=10&year=2026#assignment_4400",
  "END:VEVENT",
  // An ordinary calendar event: left out.
  "BEGIN:VEVENT",
  "DTSTART:20261022T150000Z",
  "SUMMARY:Field trip [BIO-101-S1]",
  "UID:event-calendar-event-999",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("reads assignments and skips ordinary events", () => {
  const list = parseCanvasFeed(SAMPLE, "America/New_York");
  assert.equal(list.length, 4);
  const [lab, reading, pset, disc] = list;

  assert.equal(lab.title, "Cell Respiration Lab");
  assert.equal(lab.course, "BIO-101-S1");
  assert.equal(lab.courseId, "678");
  assert.equal(lab.dueDate, "2026-10-21T04:59:00.000Z");
  assert.equal(lab.url, "https://school.instructure.com/courses/678/assignments/12345");
  assert.equal(lab.description, "Write up your results, then submit a PDF.\nInclude graphs.");

  // A whole-day due date is the end of that day in the student's time zone.
  assert.equal(reading.dueDate, "2026-10-25T03:59:00.000Z");
  assert.equal(reading.courseId, "900");

  // An override links to the assignment, not the override.
  assert.equal(pset.canvasAssignmentId, "333");
  assert.equal(pset.url, "https://school.instructure.com/courses/55/assignments/333");
  assert.equal(pset.dueDate, "2026-10-27T04:59:00.000Z");
  assert.equal(pset.course, "MATH-AP");

  assert.equal(disc.canvasAssignmentId, "4400");
  assert.equal(disc.course, "ENG-101");
});

test("refuses anything that isn't a calendar", () => {
  assert.throws(() => parseCanvasFeed("<html>login</html>"), /not_calendar/);
});

test("only accepts Canvas feed links", () => {
  assert.equal(normalizeFeedUrl("webcal://school.instructure.com/feeds/calendars/user_AbC123.ics"), "https://school.instructure.com/feeds/calendars/user_AbC123.ics");
  assert.equal(normalizeFeedUrl("  school.instructure.com/feeds/calendars/user_x9.ics?foo=1 "), "https://school.instructure.com/feeds/calendars/user_x9.ics");
  assert.equal(normalizeFeedUrl("https://school.instructure.com/courses/1"), null);
  assert.equal(normalizeFeedUrl("https://127.0.0.1/feeds/calendars/user_a.ics"), null);
  assert.equal(normalizeFeedUrl("https://localhost/feeds/calendars/user_a.ics"), null);
  assert.equal(normalizeFeedUrl("https://user:pw@school.com/feeds/calendars/user_a.ics"), null);
  assert.equal(normalizeFeedUrl("https://school.com:8443/feeds/calendars/user_a.ics"), null);
  assert.equal(normalizeFeedUrl(""), null);
});
