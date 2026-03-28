/**
 * Parse Production & Pre-Dispatch checklist bulk upload Excel.
 * Columns: Task Title, Task Detail, Department.
 * Department: fuzzy match against known list (do not create new department if spelling is slightly off).
 */

export interface ChecklistParsedRow {
  task_title: string;
  task_detail: string;
  department: string; // resolved (matched or as-is)
  assigned_to: string;
}

export interface ParseChecklistExcelResult {
  rows: ChecklistParsedRow[];
  error?: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Match input department string to best known department (fuzzy). Returns matched from list or input as-is. */
export function matchDepartment(input: string, knownDepartments: string[]): string {
  const t = (input ?? '').trim();
  if (!t) return t;
  const n = normalize(t);
  const exact = knownDepartments.find((d) => normalize(d) === n);
  if (exact) return exact;
  const contains = knownDepartments.find((d) => n.includes(normalize(d)) || normalize(d).includes(n));
  if (contains) return contains;
  const minLen = Math.min(3, Math.floor(t.length / 2));
  const close = knownDepartments.find((d) => {
    const dn = normalize(d);
    if (Math.abs(dn.length - n.length) > 4) return false;
    let same = 0;
    for (let i = 0; i < Math.min(n.length, dn.length); i++) {
      if (n[i] === dn[i]) same++;
    }
    return same >= Math.min(n.length, dn.length) - 2;
  });
  if (close) return close;
  return t;
}

export function parseChecklistExcel(
  rows: unknown[][],
  knownDepartments: string[] = []
): ParseChecklistExcelResult {
  const result: ChecklistParsedRow[] = [];
  if (!Array.isArray(rows) || rows.length === 0) return { rows: result };

  let headerRowIndex = 0;
  let colTitle = 0;
  let colDetail = 1;
  let colDept = 2;
  let colAssignedTo = 3;

  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const headerLower = row.map((c: unknown) => String(c ?? '').toLowerCase().trim());
    const hasTitle = headerLower.some((h: string) => h.includes('task') && h.includes('title'));
    const hasDetail = headerLower.some((h: string) => h.includes('task') && h.includes('detail'));
    const hasDept = headerLower.some((h: string) => h.includes('department'));
    const hasAssignedTo = headerLower.some((h: string) => h.includes('assigned') && h.includes('to'));
    if (hasTitle || hasDetail || hasDept || hasAssignedTo) {
      headerRowIndex = r;
      colTitle = headerLower.findIndex((h: string) => (h.includes('task') && h.includes('title')) || h === 'title');
      if (colTitle < 0) colTitle = 0;
      colDetail = headerLower.findIndex((h: string) => (h.includes('task') && h.includes('detail')) || h === 'detail');
      if (colDetail < 0) colDetail = 1;
      colDept = headerLower.findIndex((h: string) => h.includes('department'));
      if (colDept < 0) colDept = 2;
      colAssignedTo = headerLower.findIndex((h: string) => h.includes('assigned') && h.includes('to'));
      if (colAssignedTo < 0) colAssignedTo = 3;
      break;
    }
  }

  const dataStart = headerRowIndex + 1;
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const title = row[colTitle] != null ? String(row[colTitle]).trim() : '';
    if (!title) continue;
    const detail = row[colDetail] != null ? String(row[colDetail]).trim() : '';
    const deptRaw = row[colDept] != null ? String(row[colDept]).trim() : '';
    const assignedTo = row[colAssignedTo] != null ? String(row[colAssignedTo]).trim() : '';
    const department = matchDepartment(deptRaw, knownDepartments);
    result.push({ task_title: title, task_detail: detail, department, assigned_to: assignedTo });
  }

  return { rows: result };
}
