import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.jsx';
import { isTouch } from './touch.js';

// Recursively extract the plain-text label from an <option>'s children
// (handles strings, numbers and interpolated expressions like `a · b · c`).
function textOf(node) {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node.props && node.props.children != null) return textOf(node.props.children);
  return '';
}

// Flatten <option> children (including arrays from .map / <optgroup>) into a list.
function collectOptions(children) {
  const out = [];
  React.Children.forEach(children, (child) => {
    if (!child || typeof child !== 'object') return;
    if (Array.isArray(child)) { out.push(...collectOptions(child)); return; }
    if (child.type === 'option') {
      const label = textOf(child.props.children);
      const value = child.props.value !== undefined ? child.props.value : label;
      out.push({ value: String(value), label, disabled: !!child.props.disabled });
    } else if (child.props && child.props.children) {
      out.push(...collectOptions(child.props.children));
    }
  });
  return out;
}

// True while any Select menu is open. Modals that close on Escape from a
// window capture listener ask this first, so Escape shuts the menu, not the modal.
export const selectIsOpen = () => typeof document !== 'undefined' && !!document.querySelector('.sel-menu');

// Lists at least this long get a search box at the top of the open menu.
const SEARCH_MIN = 6;

// Wrap the first case-insensitive match of `q` in <mark> so the eye finds it.
function highlight(label, q) {
  if (!q) return label;
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return label;
  return <>{label.slice(0, i)}<mark className="sel-hit">{label.slice(i, i + q.length)}</mark>{label.slice(i + q.length)}</>;
}

// A styled, accessible drop-in replacement for a native <select>. Keeps the
// same API: `value`, `onChange` (receives a synthetic { target: { value } }),
// and <option> children. Fully stylable open list, keyboard + click-outside,
// and a type-to-filter search box on longer lists (`searchable` forces it on
// or off).
export function Select({ value, onChange, children, disabled, id, className = '', style, required, title, placeholder, searchable, 'aria-label': ariaLabel }) {
  const all = collectOptions(children);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  const withSearch = searchable ?? all.length >= SEARCH_MIN;
  const q = query.trim().toLowerCase();
  const options = q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all;

  const sval = value == null ? '' : String(value);
  const current = all.find((o) => o.value === sval);
  const label = current ? current.label : (placeholder || '');

  const close = useCallback((refocus) => {
    setOpen(false); setActive(-1); setQuery('');
    if (refocus && triggerRef.current) triggerRef.current.focus();
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

  // The open menu is portalled to <body> and placed with fixed coordinates,
  // so a scrolling table or an overflow:hidden card can never clip it. It
  // opens downward, or upward when the space below the trigger is short.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const vh = window.innerHeight, gap = 4, margin = 8;
      if (r.bottom < 0 || r.top > vh) { close(); return; }
      // Outside .admin-content the menu would lose the frame's control sizes.
      const cs = getComputedStyle(t);
      const vars = { '--ctl-fs': cs.getPropertyValue('--ctl-fs') || undefined, '--ctl-opt-py': cs.getPropertyValue('--ctl-opt-py') || undefined };
      const below = vh - r.bottom - gap - margin, above = r.top - gap - margin;
      const up = below < 220 && above > below;
      const maxHeight = Math.max(120, Math.min(320, up ? above : below));
      // At least 260px wide so long medicine names read in a narrow table column.
      const width = Math.min(Math.max(r.width, 260), window.innerWidth - 2 * margin);
      const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
      setPos({ ...vars, left, width, maxHeight, ...(up ? { bottom: vh - r.top + gap } : { top: r.bottom + gap }) });
    };
    place();
    // Capture phase catches scrolls of any ancestor, not just the window.
    const onScroll = (e) => { if (menuRef.current?.contains(e.target)) return; place(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', place); };
  }, [open, close]);

  // On open, highlight the currently-selected option and focus the search box.
  useEffect(() => {
    if (open) {
      const i = options.findIndex((o) => o.value === sval);
      setActive(i >= 0 ? i : 0);
      // Not on touch: the on-screen keyboard would cover the list.
      if (withSearch && !isTouch() && searchRef.current) searchRef.current.focus({ preventScroll: true });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing re-filters the list: highlight the first enabled match.
  useEffect(() => {
    if (open && q) setActive(options.findIndex((o) => !o.disabled));
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (open && listRef.current && active >= 0) {
      const el = listRef.current.children[active];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
  }, [active, open]);

  function pick(opt) {
    if (!opt || opt.disabled) return;
    if (onChange) onChange({ target: { value: opt.value } });
    close(true);
  }

  function move(dir) {
    if (!options.length) return;
    setActive((a) => {
      let i = a;
      for (let step = 0; step < options.length; step++) {
        i = (i + dir + options.length) % options.length;
        if (!options[i].disabled) return i;
      }
      return a;
    });
  }

  function onKey(e) {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setOpen(true); }
      // Typing on a focused dropdown opens it with the search already started.
      else if (withSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setQuery(e.key); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' || (e.key === ' ' && e.target === triggerRef.current)) { e.preventDefault(); pick(options[active]); }
  }

  return (
    <div ref={rootRef} className={`sel ${disabled ? 'is-disabled' : ''} ${className}`.trim()} style={style}>
      <button
        ref={triggerRef} type="button" id={id} title={title} disabled={disabled} aria-label={ariaLabel}
        className={`sel-trigger ${open ? 'open' : ''}`}
        aria-haspopup="listbox" aria-expanded={open} aria-required={required || undefined}
        onClick={() => !disabled && setOpen((o) => !o)} onKeyDown={onKey}
      >
        <span className={`sel-value ${!current ? 'is-placeholder' : ''}`}>{label || ' '}</span>
        <span className="sel-arrow"><Icon name="chevrondown" size={18} /></span>
      </button>
      {open && createPortal(
        <div ref={menuRef} className="sel-menu" style={pos || { top: -9999, left: 0, opacity: 0 }}>
          {withSearch && (
            <div className="sel-search">
              <Icon name="search" size={15} />
              <input
                ref={searchRef} type="text" value={query} placeholder="Search…" aria-label="Search options"
                autoComplete="off" spellCheck={false}
                onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
              />
              {query && (
                <button type="button" className="sel-clear" aria-label="Clear search"
                  onMouseDown={(e) => { e.preventDefault(); setQuery(''); searchRef.current?.focus(); }}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          )}
        <ul ref={listRef} className="sel-list" role="listbox">
          {options.map((o, i) => (
            <li
              key={o.value + '::' + i} role="option" title={o.label} aria-selected={o.value === sval}
              className={`sel-opt ${o.value === sval ? 'selected' : ''} ${i === active ? 'active' : ''} ${o.disabled ? 'disabled' : ''}`.trim()}
              onMouseEnter={() => !o.disabled && setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
            >
              <span className="sel-opt-label">{highlight(o.label, q)}</span>
              {o.value === sval && <Icon name="check" size={16} />}
            </li>
          ))}
          {options.length === 0 && <li className="sel-opt disabled">{q ? `No match for “${query.trim()}”` : 'No options'}</li>}
        </ul>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Select;
