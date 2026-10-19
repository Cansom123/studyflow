// Run with: node --test tests/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assignmentKind, estimateMinutes, studiedMinutesByAssignment, estimateSourceText, fmtEstimate, pickToday3 } = require('../js/today-core.js');

const clean = s => String(s).replace(/\s+\d+\s+-\s+\d{4} Fall$/, ''); // "MUS 121 1001 - 2026 Fall" -> "MUS 121"
const sec = s => s.seconds_studied;
const session = (title, course, minutes) => ({ title, course, seconds_studied: minutes * 60 });

test('kinds come from the title first', () => {
  assert.equal(assignmentKind({ title: 'Chapter 46 InQuizitive: Multimedia Hits' }), 'quiz');
  assert.equal(assignmentKind({ title: 'Unit 2 Test' }), 'test');
  assert.equal(assignmentKind({ title: 'Essay Draft 1' }), 'essay');
  assert.equal(assignmentKind({ title: '"Major" Presentations' }), 'presentation');
  assert.equal(assignmentKind({ title: 'Week 8 Discussion' }), 'discussion');
  assert.equal(assignmentKind({ title: 'Chapter 6 Reading' }), 'reading');
  assert.equal(assignmentKind({ title: 'Budget Worksheet' }), 'homework');
  assert.equal(assignmentKind({ title: 'Something', assignment_type: 'online_quiz' }), 'quiz');
});

test('no history: a plain default for the kind', () => {
  const est = estimateMinutes({ title: 'Quiz 4', course: 'BIO 101 1001 - 2026 Fall' }, [], new Map(), clean);
  assert.deepEqual([est.minutes, est.source, est.left], [30, 'default', 30]);
  assert.match(estimateSourceText(est), /typical time for quizzes/);
});

test('learns from timed work in the same class', () => {
  const history = [
    { title: 'Quiz 1', course: 'BIO 101 1001 - 2026 Fall' },
    { title: 'Quiz 2', course: 'BIO 101 1001 - 2026 Fall' },
    { title: 'Quiz 3', course: 'BIO 101 1001 - 2026 Fall' },
  ];
  const studied = studiedMinutesByAssignment([
    session('Quiz 1', 'BIO 101', 50), session('Quiz 2', 'BIO 101', 70), session('Quiz 2', 'BIO 101', 10),
    session('Quiz 3', 'BIO 101', 3), // too short to count
  ], sec, clean);
  const est = estimateMinutes({ title: 'Quiz 4', course: 'BIO 101 1001 - 2026 Fall' }, history, studied, clean);
  assert.equal(est.source, 'class');
  assert.equal(est.samples, 2);
  assert.equal(est.minutes, 65); // median of 50 and 80
  assert.match(estimateSourceText(est), /2 quizzes you timed in this class/);
});

test('falls back to the same kind in any class with 3+ samples', () => {
  const history = [
    { title: 'Essay A', course: 'ENG 101 1 - 2026 Fall' },
    { title: 'Essay B', course: 'HIST 1 1 - 2026 Fall' },
    { title: 'Paper C', course: 'SOC 1 1 - 2026 Fall' },
  ];
  const studied = studiedMinutesByAssignment([
    session('Essay A', 'ENG 101', 100), session('Essay B', 'HIST 1', 150), session('Paper C', 'SOC 1', 130),
  ], sec, clean);
  const est = estimateMinutes({ title: 'Essay D', course: 'PHIL 1 1 - 2026 Fall' }, history, studied, clean);
  assert.deepEqual([est.source, est.minutes], ['kind', 130]);
});

test('time already spent comes off what is left', () => {
  const studied = studiedMinutesByAssignment([session('Essay Draft', 'ENG 101', 50)], sec, clean);
  const est = estimateMinutes({ title: 'Essay Draft', course: 'ENG 101 1 - 2026 Fall' }, [], studied, clean);
  assert.deepEqual([est.minutes, est.spent, est.left], [120, 50, 70]);
});

test('deep work sessions are not tied to an assignment', () => {
  const studied = studiedMinutesByAssignment([{ title: 'Quiz 1', course: 'BIO 101', seconds_studied: 3600, session_type: 'deep_work' }], sec, clean);
  assert.equal(studied.size, 0);
});

test('formats estimates', () => {
  assert.equal(fmtEstimate(45), '45 min');
  assert.equal(fmtEstimate(60), '1 h');
  assert.equal(fmtEstimate(135), '2 h 15 min');
});

test("today's picks stay put through the day and fill empty slots", () => {
  const A = { title: 'A', course: 'x' }, B = { title: 'B', course: 'x' }, C = { title: 'C', course: 'x' }, D = { title: 'D', course: 'x' };
  const key = a => `${a.title}||${a.course}`;
  const all = [A, B, C, D];
  // First pick of the day: top 3 of the ranking.
  assert.deepEqual(pickToday3([B, A, C, D], all, key, null, () => false).map(a => a.title), ['B', 'A', 'C']);
  // Later the ranking shuffles; the saved picks hold.
  assert.deepEqual(pickToday3([D, C, B, A], all, key, ['B||x', 'A||x', 'C||x'], () => false).map(a => a.title), ['B', 'A', 'C']);
  // A pick that left Canvas is replaced; a done pick stays (shown checked).
  assert.deepEqual(pickToday3([D, C], [A, C, D], key, ['B||x', 'A||x', 'C||x'], a => a === A).map(a => a.title), ['A', 'C', 'D']);
});
