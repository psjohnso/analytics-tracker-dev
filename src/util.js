// ─────────────────────────────────────────────────────────────────────
// util.js — pure utility functions
//
// Functions in this file have no dependency on application state:
// no Auth, no PROJECTS/TASKS/RESOURCES_DATA, no isFeatureOn, no DOM
// queries against app-specific elements. They take inputs and return
// outputs. Safe to load before everything else.
//
// If you find yourself adding a global reference here, the function
// belongs in a feature module instead.
// ─────────────────────────────────────────────────────────────────────

// HTML / attribute escaping
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeAttr(s) {
  if (!s) return '';
  return String(s).replace(/'/g,"\'").replace(/"/g,'\"');
}

// ── Date / time formatting ─────────────────────────────────────────
function epochToDateStr(val) {
  if (!val && val !== 0) return '';
  // If it's already a YYYY-MM-DD string, return as-is
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function formatTimeShort(epochMs) {
  if (!epochMs) return '—';
  const d = new Date(epochMs);
  let h = d.getHours(); const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

function toDatetimeLocal(epochMs) {
  if (!epochMs) return '';
  const d = new Date(epochMs);
  const pad = function(n) { return n < 10 ? '0' + n : n; };
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// Stopwatch-style HH:MM:SS formatter for the live header chip.
function formatTimerChip(ms) {
  if (ms < 0) ms = 0;
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  return pad(h) + ':' + pad(m) + ':' + pad(sec);
}

// ── Project Review date helpers ────────────────────────────────────
function prFmtDate(v) {
  if (v == null) return '';
  var d = (typeof v === 'number') ? new Date(v) : new Date(String(v));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function prFmtDateShort(v) {
  if (v == null) return '—';
  var d = (typeof v === 'number') ? new Date(v) : new Date(String(v));
  if (isNaN(d.getTime())) return '—';
  return (d.getMonth()+1) + '/' + d.getDate();
}
function prDaysSince(epoch) {
  if (epoch == null) return null;
  var ms = (typeof epoch === 'number') ? epoch : Date.parse(epoch);
  if (isNaN(ms)) return null;
  return Math.floor((Date.now() - ms) / 86400000);
}
function prDateToEpoch(yyyymmdd) {
  if (!yyyymmdd) return null;
  // Treat as a UTC date (DateOnly) at noon to avoid timezone shifts
  var parts = yyyymmdd.split('-');
  if (parts.length !== 3) return null;
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}
function prEpochToInputDate(epoch) {
  if (epoch == null) return '';
  var d = new Date(epoch);
  if (isNaN(d.getTime())) return '';
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth()+1).padStart(2,'0') + '-' +
    String(d.getUTCDate()).padStart(2,'0');
}

// ── UI label formatting ────────────────────────────────────────────
function hoursLabel(teamHrs, myHrs, label) {
  if (!teamHrs && !myHrs) return '';
  const tag = label || 'me';
  const parts = [];
  if (teamHrs) parts.push(teamHrs + 'h');
  if (myHrs && myHrs !== teamHrs) parts.push(tag + ': ' + myHrs + 'h');
  else if (myHrs && myHrs === teamHrs) return myHrs + 'h';
  return parts.join(' · ');
}

// ── Dependency reference parsing ───────────────────────────────────
// A reference of the form "P-001" is a project; "P-001-001" is a task.
function isProjectRef(ref) {
  return /^P-\d+$/.test(ref);
}

// ── CSV export ─────────────────────────────────────────────────────
function csvEscape(v) {
  if (v == null) return '';
  var s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function buildCsv(headers, rows) {
  var out = headers.map(csvEscape).join(',') + '\r\n';
  rows.forEach(function(r) {
    out += headers.map(function(h) { return csvEscape(r[h]); }).join(',') + '\r\n';
  });
  return out;
}

// Trigger a CSV download. UTF-8 BOM so Excel reads umlauts correctly.
function downloadCsv(filename, content) {
  var blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
