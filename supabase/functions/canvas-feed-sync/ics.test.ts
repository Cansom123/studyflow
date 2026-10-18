// Run with: node supabase/functions/canvas-feed-sync/ics.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFeedUrl, parseCanvasFeed } from "./ics.ts";

const SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Instructure//Canvas//EN",
  "BEGIN:VEVENT",
  "DTEND:20261021T045900Z",
  "DTSTART:20261021T045900Z",
  "SUMMARY:Cell Respiration Lab [Biology 101]",
  "UID:event-assignment-12345",
  "URL;VALUE=URI:https://school.instructure.com/calendar?include_contexts=course_678&month=10&year=2026#assignment_12345",
  "DESCRIPTION:Write up your results\\, then submit a PDF.\\nInclude graphs.",
  "X-ALT-DESC;FMTTYPE=text/html:<p>Write up your results\\, then submit a <b>PDF</b>.</p><p>Include g",
  " raphs.</p>",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261024",
  "DTEND;VALUE=DATE:20261025",
  "SUMMARY:Chapter 6 Reading [US History]",
  "UID:event-assignment-222",
  "URL;VALUE=URI:https://school.instructure.com/courses/900/assignments/222",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Chicago:20261026T235900",
  "SUMMARY:Problem Set 7 [AP Calculus]",
  "UID:event-assignment-override-333",
  "URL;VALUE=URI:https://school.instructure.com/calendar?include_contexts=course_55#assignment_333",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261022T150000Z",
  "SUMMARY:Field trip [Biology 101]",
  "UID:event-calendar-event-999",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("reads assignments and skips ordinary events", () => {
  const list = parseCanvasFeed(SAMPLE, "America/New_York");
  assert.equal(list.length, 3);
  const [lab, reading, pset] = list;

  assert.equal(lab.title, "Cell Respiration Lab");
  assert.equal(lab.course, "Biology 101");
  assert.equal(lab.courseId, "678");
  assert.equal(lab.dueDate, "2026-10-21T04:59:00.000Z");
  assert.equal(lab.url, "https://school.instructure.com/courses/678/assignments/12345");
  assert.equal(lab.description, "Write up your results, then submit a PDF.\nInclude graphs.");

  // A whole-day due date is the end of that day in the student's time zone.
  assert.equal(reading.dueDate, "2026-10-25T03:59:00.000Z");
  assert.equal(reading.courseId, "900");

  // TZID times are local to that zone (CDT is UTC-5 on Oct 26).
  assert.equal(pset.dueDate, "2026-10-27T04:59:00.000Z");
  assert.equal(pset.canvasAssignmentId, "333");
  assert.equal(pset.url, "https://school.instructure.com/courses/55/assignments/333");
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
