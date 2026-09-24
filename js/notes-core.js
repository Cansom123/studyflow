import { escapeHtml, cleanCourseName } from './format-utils.js';

// Card list for the notes course picker: one card per course, with a
// note-count badge and a preview of the most recent note. cachedClassNotes
// is passed in explicitly rather than filtered via a global lookup per
// course.
export function notesCourseListHTML(notesCourses, cachedClassNotes) {
  return notesCourses.map(c => {
    const name = cleanCourseName(c.name);
    const notes = cachedClassNotes.filter(n => String(n.course_id) === String(c.id));
    const badge = notes.length ? `${notes.length} note${notes.length !== 1 ? 's' : ''}` : 'No notes yet';
    const badgeClass = notes.length ? 'badge-hw' : 'badge-test';
    const sub = notes.length
      ? escapeHtml(notes[0].content).slice(0, 110) + (notes[0].content.length > 110 ? '…' : '')
      : 'Tap to add your first note';
    return `<div class="card syllabus-card" onclick="openClassNotes('${c.id}')">
      <div class="card-row"><div class="card-title">${escapeHtml(name)}</div><span class="badge ${badgeClass}">${badge}</span></div>
      <div class="card-sub syllabus-preview">${sub}</div>
    </div>`;
  }).join('');
}

// Body HTML for one course's note list: newest first, grouped by topic tag
// (untagged notes get their own group, shown last -- only labeled
// "Untagged" when there's more than one group, since a single untagged
// group needs no heading). notes should already be filtered to the course
// being viewed.
export function noteEntriesHTML(notes) {
  const sorted = notes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sorted.length === 0) return { empty: true, html: '' };

  const groups = new Map();
  sorted.forEach(n => {
    const key = n.topic ? n.topic.trim() : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  });
  const orderedKeys = [...groups.keys()].filter(k => k).sort();
  if (groups.has('')) orderedKeys.push('');

  const html = orderedKeys.map(key => {
    const items = groups.get(key);
    const heading = key ? `<div class="section-label" style="margin-top:16px;">${escapeHtml(key)}</div>` : (orderedKeys.length > 1 ? `<div class="section-label" style="margin-top:16px;">Untagged</div>` : '');
    const cards = items.map(n => {
      const dateStr = new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<div class="card" style="margin-bottom:10px;">
        <div class="card-row">
          <div class="card-title">${escapeHtml(n.title || 'Untitled note')}</div>
          <span class="card-sub">${dateStr}</span>
        </div>
        <div class="card-sub" style="margin-top:8px;white-space:pre-wrap;line-height:1.5;">${escapeHtml(n.content)}</div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="sync-btn" style="width:auto;flex:1;margin-bottom:0;" onclick="editNote('${n.id}')">Edit</button>
          <button class="study-session-del" onclick="deleteNote('${n.id}')" title="Delete">✕</button>
        </div>
      </div>`;
    }).join('');
    return heading + cards;
  }).join('');

  return { empty: false, html };
}
