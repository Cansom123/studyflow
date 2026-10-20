// Run with: node --test   (from the project folder; runs every test file)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { examSignal, collectExams, undatedExams, planStudyDays, plannedSessionCount, examStudyTitle, examWhenText, examWorthText } = require('../js/exam-core.js');

test('real exams are recognised', () => {
  for (const title of ['Exam 2', 'Midterm', 'Midterm Exam', 'Final Exam', 'Unit 3 Test', 'Chapter 4-6 Test', 'FINAL']) {
    assert.equal(examSignal({ title }), 'title', title);
  }
});

test('things that only mention an exam are not exams (from real Canvas data)', () => {
  for (const title of [
    'Midterm Feedback Survey', 'Reviewing Your World Essay Final Draft',
    'Chapter 47 Tutorial: LG 38 Wagner: Die Walküre, Act III Finale', // "Finale" is not "final"
    'Exam 2 Review', 'Practice Test', 'Final Project', 'Final Paper', 'Final Presentation',
    'Test Your Knowledge', 'Exam Corrections', 'Placement Test', 'Chapter 46 InQuizitive', 'Quiz 4',
  ]) {
    assert.equal(examSignal({ title }), null, title);
  }
});

test("Full sync: the grade category decides, whatever it's named", () => {
  assert.equal(examSignal({ title: 'Chapter 5 Assessment', assignment_group: 'Exams' }), 'group');
  assert.equal(examSignal({ title: 'Week 6', assignment_group: 'Tests (40%)' }), 'group');
  assert.equal(examSignal({ title: 'Exam Review Sheet', assignment_group: 'Exams' }), null);
  assert.equal(examSignal({ title: 'Lab 4', assignment_group: 'Labs' }), null);
});

const NOW = new Date(2026, 9, 20, 10, 0); // Tue Oct 20 2026, 10am
const at = (days, h = 23, m = 59) => { const d = new Date(2026, 9, 20 + days, h, m); return d.toISOString(); };

test('collects upcoming exams from Canvas and ones added by hand, soonest first', () => {
  const list = collectExams({
    now: NOW,
    assignments: [
      { id: 'a1', title: 'Exam 2', course: 'MATH 132', due_date: at(6), points_possible: 100, assignment_group: 'Exams', group_weight: 40 },
      { id: 'a2', title: 'Quiz 5', course: 'MATH 132', due_date: at(2) },
      { id: 'a3', title: 'Midterm', course: 'BIO 101', due_date: at(-2) }, // already past
      { id: 'a4', title: 'Final Exam', course: 'BIO 101', due_date: at(40) }, // past the horizon
      { id: 'a5', title: 'Unit 3 Test', course: 'HIST 1', due_date: at(3), completed: true },
    ],
    manual: [{ id: 'm1', title: 'Chem midterm', course: 'CHEM 121', exam_date: '2026-10-22', exam_time: '13:00' }],
    hidden: [],
  });
  assert.deepEqual(list.map(e => [e.title, e.daysUntil, e.source]), [['Chem midterm', 2, 'manual'], ['Exam 2', 6, 'canvas']]);
  assert.equal(examWorthText(list[1]), '100 pts · about 40% of your grade'); // the only thing in a 40% category
  assert.equal(examWorthText(list[0]), '');
  assert.equal(examWhenText(list[0]), 'In 2 days');
});

test('"Not an exam" hides it', () => {
  const list = collectExams({ now: NOW, assignments: [{ title: 'Unit 3 Test', course: 'HIST 1', due_date: at(3) }], manual: [], hidden: ['a:Unit 3 Test||HIST 1'] });
  assert.equal(list.length, 0);
});

test('study days: spread before the exam, last one the day before, never before today', () => {
  const exam = d => ({ date: new Date(2026, 9, 20 + d, 9, 0) });
  assert.deepEqual(planStudyDays(exam(10), NOW), ['2026-10-20', '2026-10-23', '2026-10-26', '2026-10-29']);
  assert.deepEqual(planStudyDays(exam(5), NOW), ['2026-10-20', '2026-10-22', '2026-10-24']);
  assert.deepEqual(planStudyDays(exam(2), NOW), ['2026-10-20', '2026-10-21']);
  assert.deepEqual(planStudyDays(exam(1), NOW), ['2026-10-20']);
  assert.deepEqual(planStudyDays(exam(0), NOW), []);
});

test('knows how many sessions are already planned', () => {
  const e = { title: 'Exam 2' };
  assert.equal(examStudyTitle(e), 'Study for Exam 2');
  assert.equal(plannedSessionCount(e, [{ title: 'Study for Exam 2' }, { title: 'study for exam 2' }, { title: 'Exam 2' }]), 2);
});

// A real MATH 132 setup: exams are given in class, so Canvas has them with
// points and a category but no date; "Final Grade" is a 0% placeholder.
const MATH = 'MATH 132 1007 - 2026 Fall';
const math = [
  { title: 'Exam 1', course: MATH, due_date: null, points_possible: 70, score: 65, assignment_group: 'Exams', group_weight: 60 },
  { title: 'Exam 2', course: MATH, due_date: null, points_possible: 70, score: null, assignment_group: 'Exams', group_weight: 60 },
  { title: 'Exam 3', course: MATH, due_date: null, points_possible: 70, score: null, assignment_group: 'Exams', group_weight: 60 },
  { title: 'Final Exam', course: MATH, due_date: null, points_possible: 100, score: null, assignment_group: 'Final Exam', group_weight: 30 },
  { title: 'Final Grade', course: MATH, due_date: null, points_possible: 100, score: null, assignment_group: 'Final Grade', group_weight: 0 },
  { title: 'HW 5.2', course: MATH, due_date: at(1), points_possible: 10, assignment_group: 'Assignments', group_weight: 10 },
];

test('a 0% placeholder category is never an exam', () => {
  assert.equal(examSignal(math[4]), null);
});

test('exams Canvas has no date for are listed to be dated, with their real share of the grade', () => {
  const list = undatedExams({ assignments: math, manual: [], hidden: [] });
  assert.deepEqual(list.map(e => [e.title, e.share]), [['Exam 2', 20], ['Exam 3', 20], ['Final Exam', 30]]); // Exam 1 is already graded
  assert.equal(examWorthText(list[0]), '70 pts · about 20% of your grade');
});

test('once the student adds a date, the exam keeps its Canvas points and share', () => {
  const manual = [{ id: 'm9', title: 'Exam 2', course: MATH, exam_date: '2026-10-27' }];
  assert.deepEqual(undatedExams({ assignments: math, manual, hidden: [] }).map(e => e.title), ['Exam 3', 'Final Exam']);
  const [e] = collectExams({ now: NOW, assignments: math, manual, hidden: [] });
  assert.deepEqual([e.title, e.source, e.daysUntil, examWorthText(e)], ['Exam 2', 'manual', 7, '70 pts · about 20% of your grade']);
});
