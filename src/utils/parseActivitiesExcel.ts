/**
 * Parse activities Excel: first row = commencement date, then Sr. No., Activity Name, Activity Type, Target Date.
 * Activity type: "process update" / "regular update" -> regular_update; "milestone" / "important milestone" -> milestone.
 * Target column: if it's a date (dd-mm-yyyy or Excel serial), use it as target_date; otherwise treat as relative ("1st week") and compute from commencement_date.
 * Dates are parsed as dd-mm-yyyy and stored as yyyy-mm-dd (ISO) without timezone shift. Uploaded target dates are kept as-is (no auto-generation from commencement).
 */

export interface ParsedActivityRow {
  sr_no: number;
  activity_name: string;
  activity_type: 'regular_update' | 'milestone';
  target_relative: string;
  target_date: string | null; // YYYY-MM-DD
  sort_order: number;
}

export interface ParsedActivitiesResult {
  commencement_date: string | null; // YYYY-MM-DD
  activities: ParsedActivityRow[];
  error?: string;
}

function parseTargetRelativeToDays(text: string): number | null {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim().toLowerCase();
  // "1st day" = 0, "2nd day" = 1, "3rd day" = 2
  const dayMatch = t.match(/^(\d+)(?:st|nd|rd|th)?\s*day$/);
  if (dayMatch) return Math.max(0, parseInt(dayMatch[1], 10) - 1);
  // "1st week" = 7, "2nd week" = 14, "3rd week" = 21
  const weekMatch = t.match(/^(\d+)(?:st|nd|rd|th)?\s*week$/);
  if (weekMatch) return Math.max(0, parseInt(weekMatch[1], 10)) * 7;
  // "1st month" = 30, "2nd month" = 60
  const monthMatch = t.match(/^(\d+)(?:st|nd|rd|th)?\s*month$/);
  if (monthMatch) return Math.max(0, parseInt(monthMatch[1], 10)) * 30;
  // Plain number = days
  const num = parseInt(t, 10);
  if (!isNaN(num) && num >= 0) return num;
  return null;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, day] = isoDate.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}

/** Format a Date as yyyy-mm-dd using local date parts (no timezone shift). */
function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse a cell value as date. Excel uses dd-mm-yyyy or may return Excel serial (days since 1900-01-01).
 * Returns yyyy-mm-dd (ISO) using local date to prevent timezone shift.
 */
function parseDateCell(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // dd-mm-yyyy or d-m-yyyy (strict: day-month-year)
    const ddmmyyyy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1], 10);
      const month = parseInt(ddmmyyyy[2], 10) - 1;
      const year = parseInt(ddmmyyyy[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) return toISODateLocal(d);
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return toISODateLocal(parsed);
  }
  // Excel serial: number of days since 1900-01-01 (Excel epoch)
  if (typeof val === 'number' && !isNaN(val) && val >= 1 && val <= 2958465) {
    const excelEpoch = new Date(1900, 0, 1);
    const d = new Date(excelEpoch.getTime());
    d.setDate(d.getDate() + (Math.floor(val) - 1));
    if (!isNaN(d.getTime())) return toISODateLocal(d);
  }
  if (val instanceof Date && !isNaN(val.getTime())) return toISODateLocal(val);
  return null;
}

function normalizeActivityType(val: unknown): 'regular_update' | 'milestone' {
  if (val == null) return 'regular_update';
  const s = String(val).trim().toLowerCase();
  if (s.includes('milestone') || s === 'important milestone' || s === 'major milestone') return 'milestone';
  return 'regular_update';
}

export function parseActivitiesExcel(rows: unknown[][]): ParsedActivitiesResult {
  const result: ParsedActivitiesResult = { commencement_date: null, activities: [] };
  if (!Array.isArray(rows) || rows.length === 0) return result;

  let commencement_date: string | null = null;
  let dataStartRow = 0;

  // First row: optional "Commencement Date" label + date, or just date
  const row0 = rows[0];
  if (Array.isArray(row0)) {
    const firstCell = row0[0];
    const dateFromFirst = parseDateCell(firstCell);
    if (dateFromFirst) {
      commencement_date = dateFromFirst;
      dataStartRow = 1;
    } else if (firstCell != null && String(firstCell).toLowerCase().replace(/\s/g, '').includes('commencement')) {
      commencement_date = parseDateCell(row0[1]) || null;
      dataStartRow = 2;
    } else {
      dataStartRow = 0;
    }
  }

  // Find header row (contains "sr" or "activity" or "activity name")
  // Search from row 0 so we don't miss the header when it's on row 1 (commencement on row 0, headers on row 1, data from row 2)
  let headerRowIndex = dataStartRow;
  let colSr = 0, colName = 1, colType = 2, colTarget = 3;
  for (let r = 0; r < Math.min(dataStartRow + 3, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const headerLower = row.map((c: unknown) => String(c ?? '').toLowerCase());
    const hasSr = headerLower.some((h: string) => h.includes('sr') || h === 'sr no' || h === 'sr no.');
    const hasName = headerLower.some((h: string) => h.includes('activity') && h.includes('name'));
    const hasType = headerLower.some((h: string) => h.includes('type') || h.includes('activity type'));
    const hasTarget = headerLower.some((h: string) => h.includes('target'));
    if (hasName || hasSr) {
      headerRowIndex = r;
      colSr = headerLower.findIndex((h: string) => h.includes('sr') || h === 'sr no' || h === 'sr no.');
      if (colSr < 0) colSr = 0;
      colName = headerLower.findIndex((h: string) => (h.includes('activity') && h.includes('name')) || h === 'activity');
      if (colName < 0) colName = 1;
      colType = headerLower.findIndex((h: string) => h.includes('type'));
      if (colType < 0) colType = 2;
      colTarget = headerLower.findIndex((h: string) => h.includes('target'));
      if (colTarget < 0) colTarget = 3;
      break;
    }
  }

  const dataStart = headerRowIndex + 1;
  const activities: ParsedActivityRow[] = [];

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const srRaw = row[colSr];
    const nameRaw = row[colName];
    const typeRaw = row[colType];
    const targetRaw = row[colTarget];
    const name = nameRaw != null ? String(nameRaw).trim() : '';
    if (!name) continue; // skip empty rows
    const sr_no = typeof srRaw === 'number' && !isNaN(srRaw) ? Math.max(1, Math.floor(srRaw)) : i - dataStart + 1;
    const activity_type = normalizeActivityType(typeRaw);
    const target_relative = targetRaw != null ? String(targetRaw).trim() : '';
    // Prefer target column as explicit date (dd-mm-yyyy or Excel serial). Use as final target_date; do not recalculate from commencement.
    const parsedTargetDate = parseDateCell(targetRaw);
    const target_date = parsedTargetDate !== null
      ? parsedTargetDate
      : (commencement_date && target_relative ? (() => {
          const days = parseTargetRelativeToDays(target_relative);
          return commencement_date && days !== null ? addDays(commencement_date, days) : null;
        })() : null);
    activities.push({
      sr_no,
      activity_name: name,
      activity_type,
      target_relative: target_relative || (target_date || ''),
      target_date,
      sort_order: i - dataStart,
    });
  }

  result.commencement_date = commencement_date;
  result.activities = activities;
  return result;
}
