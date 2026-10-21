const test = require('node:test');
const assert = require('node:assert/strict');
const { displayLetter, letterGradeClass, averageGrade } = require('../js/format-utils.js');

test('uses the letter Canvas sends', () => {
  assert.deepEqual(displayLetter({ current_score: 91.4, current_grade: 'A-' }), { letter: 'A-', estimated: false });
  assert.deepEqual(displayLetter({ current_score: null, final_score: 70, final_grade: 'C-' }), { letter: 'C-', estimated: false });
});

test('estimates a letter from the percentage when Canvas sends none', () => {
  // real data: MUS 121 at 100%, MATH 132 at 93.2%, BUS 103 at 88.5% came with no letter
  assert.deepEqual(displayLetter({ current_score: 100 }), { letter: 'A', estimated: true });
  assert.deepEqual(displayLetter({ current_score: 93.2 }), { letter: 'A', estimated: true });
  assert.deepEqual(displayLetter({ current_score: 88.5 }), { letter: 'B+', estimated: true });
  assert.deepEqual(displayLetter({ current_score: '75.4' }), { letter: 'C', estimated: true });
  assert.deepEqual(displayLetter({ current_score: 59.9 }), { letter: 'F', estimated: true });
});

test('cut-offs land on the right side of each boundary', () => {
  assert.equal(displayLetter({ current_score: 90 }).letter, 'A-');
  assert.equal(displayLetter({ current_score: 89.99 }).letter, 'B+');
  assert.equal(displayLetter({ current_score: 60 }).letter, 'D-');
});

test('a 0% or missing score with no letter shows no letter, not an F', () => {
  assert.deepEqual(displayLetter({ current_score: 0 }), { letter: '', estimated: false });
  assert.deepEqual(displayLetter({ current_score: null, final_score: null }), { letter: '', estimated: false });
  assert.deepEqual(displayLetter(null), { letter: '', estimated: false });
});

test('no letter gets the neutral color, not the failing one', () => {
  assert.equal(letterGradeClass(''), 'grade-none');
  assert.equal(letterGradeClass('B+'), 'grade-b');
  assert.equal(letterGradeClass('F'), 'grade-df');
});

test('the average leaves out 0% courses with no letter', () => {
  // real data: placement test and FYE at 0% with no letter pulled 89.8% down to 64.1%
  const grades = [
    { current_score: 0 }, { current_score: 88.5 }, { current_score: 91.8, current_grade: 'A-' },
    { current_score: 75.4, current_grade: 'C+' }, { current_score: 0 }, { current_score: 93.2 }, { current_score: 100 },
  ];
  const { avg, count } = averageGrade(grades);
  assert.equal(count, 5);
  assert.equal(avg.toFixed(1), '89.8');
});

test('a real 0% that comes with a letter still counts', () => {
  assert.deepEqual(averageGrade([{ current_score: 0, current_grade: 'F' }, { current_score: 80 }]), { avg: 40, count: 2 });
  assert.deepEqual(averageGrade([]), { avg: null, count: 0 });
});
