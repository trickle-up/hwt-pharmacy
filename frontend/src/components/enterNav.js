// Enter moves to the next field, the way a data-entry clerk works a paper
// invoice left to right. Put `onKeyDown={(e) => enterToNext(e, opts)}` on a
// form's container. Text/number/date inputs and Select dropdowns take part;
// Enter on a closed dropdown still opens it, and Enter on a picked option
// (focus is back on the trigger) moves on. `onLastField` runs when Enter is
// pressed on the container's last field (e.g. to add a line).
const FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([disabled]):not([readonly]), .sel-trigger:not([disabled])';

export function focusField(el) {
  if (!el) return;
  el.focus();
  if (el.tagName === 'INPUT') { try { el.select(); } catch { /* date inputs can't select */ } }
}

export function enterToNext(e, { onLastField } = {}) {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target;
  let from;
  if (t.closest?.('.sel-menu')) {
    // The Select picked an option and handed focus back to its trigger; if
    // nothing matched the search, focus is still in the menu and we stay put.
    from = document.activeElement;
    if (!from || from.closest('.sel-menu')) return;
  } else if (t.classList?.contains('sel-trigger')) {
    // Short lists have no search box: the trigger keeps focus while open.
    if (t.getAttribute('aria-expanded') !== 'true') return; // Enter opens it
    from = t;
  } else if (t.tagName === 'INPUT' && t.matches(FIELDS)) {
    from = t;
  } else return;

  const fields = [...e.currentTarget.querySelectorAll(FIELDS)]
    .filter((el) => el.offsetParent !== null && !el.closest('.sel-menu'));
  const i = fields.indexOf(from);
  if (i < 0) return;
  e.preventDefault();
  if (i === fields.length - 1) { if (onLastField) onLastField(from); return; }
  // After a pick the Select re-renders; move on once that has settled.
  setTimeout(() => focusField(fields[i + 1]), 0);
}
