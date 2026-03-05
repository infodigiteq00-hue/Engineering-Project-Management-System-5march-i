# Safe Changes – Default Behavior

**You don’t need to retest every file after every edit.** The project has a Cursor rule that makes it the **default** to only change what you asked for and to leave all other working code untouched. You do not have to say "don't touch X" or run a checklist every time.

---

## What’s the default?

- The AI is instructed to **only change the minimal set of code** required for your request.
- Other files and other flows (e.g. template upload if you only asked to fix template download) are **not** to be changed unless you explicitly ask.
- So you can stay in flow building new features; full retests are not required by default.

---

## When to use this doc

- **Something broke** after a change: see the table below to see which flows might be affected by the file that changed, then re-test only those (or ask the AI to revert everything except the specific change you wanted).
- **You want extra assurance** occasionally: run `npm run build` and `npm run lint`, and do a quick smoke test on the one feature you changed.

---

## “I changed this file → what might be affected?”

Use this only when debugging a regression or when you want to know what to spot-check.

| File / area | Flows that use it |
|-------------|-------------------|
| `src/lib/api.ts` | Projects, equipment, VDCR, team, docs, invites. |
| `src/components/forms/AddProjectForm.tsx` | Create/edit project, PM/VDCR manager selection, documents. |
| `src/components/forms/AddStandaloneEquipmentFormNew.tsx` | Add/edit standalone equipment, equipment manager, documents. |
| `src/components/dashboard/EquipmentGrid.tsx` | Standalone equipment list, details, team tab, settings, add/edit/delete equipment, docs. |
| `src/components/dashboard/ProjectsVDCR.tsx` | VDCR list, bulk upload (template download + upload), VDCR create/edit, revision events. |
| `src/components/dashboard/ProjectDetails.tsx` | Project details, project documents, delete document. |
| `src/pages/Index.tsx` | Project list, filters, opening project/equipment, document delete refresh. |
| `src/contexts/AuthContext.tsx` | Login, logout, permissions. |

---

## If the AI changed more than you asked

You can say:

- “Revert everything except [specific change].”
- “Only change X; leave Y and Z exactly as they were.”

The rule is there so you shouldn’t need this often; this is your fallback.
