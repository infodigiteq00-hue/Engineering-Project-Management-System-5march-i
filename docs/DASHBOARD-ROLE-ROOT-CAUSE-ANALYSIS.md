# Dashboard Role Root Cause Analysis

**Summary:** Firm Admin dashboard works; Viewers, Project Manager, Documentation Manager, and Editor dashboards show missing or incomplete data. This document explains why and compares behavior across roles.

---

## 1. Why Firm Admin Works

- **Project list:** `get_projects_by_firm` RPC treats `firm_admin` specially: it returns **all projects** for the firm when `p_user_role = 'firm_admin'` (no email needed).
- **Index** calls `fastAPI.getProjectsByFirm(firmId, userRole, userId)`. For firm_admin, the API does **not** need `userId` or `p_user_email`; it only sends `p_firm_id` and `p_user_role`.
- **CompanyHighlights** receives `initialProjectIds` from Index (the full project list), so it skips its own project-ID fetch and uses that list for all tabs (production, documentation, timeline, milestone).
- **RLS:** Firm admin policies typically allow SELECT on firm-scoped data (e.g. `firm_id = get_user_firm_id()`), so the RPC and any direct REST calls return data as expected.

---

## 2. Why Non–Firm Admin Roles See Missing/Incomplete Data

### 2.1 Backend: RPC requires email for non–firm_admin

The RPC `get_projects_by_firm` (see `supabase/migrations/20250227000000_get_projects_by_firm_rpc.sql`) returns projects for non–firm_admin only when **both** are true:

- `p_user_email` is non-empty: `trim(coalesce(p_user_email, '')) <> ''`
- The project is in `project_members` for that email:  
  `p.id IN (SELECT pm.project_id FROM public.project_members pm WHERE lower(trim(pm.email)) = lower(trim(p_user_email)))`

If `p_user_email` is **null or empty**, the third branch of the `WHERE` never matches, so the RPC returns **no projects** for project_manager / viewer / editor / vdcr_manager.

### 2.2 Frontend: How `p_user_email` is set in the API

In `src/lib/api.ts`, `getProjectsByFirm` only sends `p_user_email` when it can resolve the current user’s **email**:

- For non–firm_admin it uses:
  1. `userData.email` from `localStorage` (set at login or by AuthContext `fetchUserData`)
  2. `localStorage.getItem('userEmail')`
  3. Fallback: `GET /users?id=eq.${userId}&select=email` (only if `userId` is present)

If **any** of these fail, `userEmail` stays empty and the payload does **not** include `p_user_email`, so the RPC returns `[]`.

### 2.3 Root cause #1: Missing or wrong `userId` / `userData` when Index runs

- **Index** loads projects in a `useEffect` that depends on **`authLoading`** only. It reads `userId` from `localStorage.getItem('userId')` and passes it to `getProjectsByFirm`.
- **AuthContext** can set `loading = false` in two ways:
  1. **Cached path:** If `stored.firmId && stored.userRole` exist, it sets `setLoading(false)` **before** `getSession()` / `fetchUserData()`. So the first time the effect runs, `userId` and `userData` might still be from a **previous** session or **not yet** written for this session.
  2. **Fresh path:** After `getSession()` and `fetchUserData(session.user.id)`, it sets `userId` and `userData` in `localStorage`, then sets `loading = false`.

If Index runs when `userId` or `userData` is missing or stale (e.g. right after the “cached” early `setLoading(false)` before `fetchUserData` has run), then:

- `getProjectsByFirm` may not resolve email (e.g. no `userId` → no `/users` fallback; or `userData` not yet set).
- So `p_user_email` is not sent → RPC returns `[]` → Index has no projects.

### 2.4 Root cause #2: `initialProjectIds` is undefined when project list is empty

In `Index.tsx`:

```tsx
initialProjectIds={filteredProjects.length > 0 ? filteredProjects.map((p: any) => p.id) : undefined}
```

When `getProjectsByFirm` returns no projects, `filteredProjects` is empty, so **`initialProjectIds` is `undefined`**.

Then in **CompanyHighlights**:

- Because `initialProjectIds === undefined`, it does **not** use the “skip fetch” path.
- For non–firm_admin it runs `fetchAssignedProjects(userId)`.
- If `userId` is missing or `fetchAssignedProjects` fails (e.g. RLS, wrong email), `assignedProjectIds` stays empty.
- All tabs (production, documentation, timeline, milestone) that depend on `projectIds` then see an empty list and show no data or skip fetching (e.g. “If user has no visible projects, skip fetch”).

So a single failure at “project list for non–firm_admin” propagates: empty project list → no `initialProjectIds` → CompanyHighlights falls back to its own fetch → still no IDs → all sections empty or incomplete.

### 2.5 Root cause #3: RLS on `projects` / `project_members` (SECURITY INVOKER)

The RPC is **SECURITY INVOKER**, so it runs with the **caller’s JWT**. When a project_manager or viewer calls the RPC:

- The RPC reads from `public.projects` and `public.project_members`.
- **RLS** on those tables is applied: the user only sees rows allowed by their policies.

If RLS for non–firm_admin is defined in terms of:

- `auth.uid()` and `project_members.user_id`, but
- `project_members.user_id` is **null** or not set (membership stored by **email** only),

then the policy may allow **no** rows for that user, so the RPC returns no projects even when `p_user_email` is correct. So **RLS** can further reduce or zero out results for non–firm_admin.

### 2.6 Relation to recent changes (batching / RLS)

- **API batching / single RPC:** All roles now rely on one call to `get_projects_by_firm`. For firm_admin, no email is needed, so behavior is unchanged. For others, **correct and timely** `p_user_email` (and RLS allowing reads) is **critical**; if that was already fragile, the single-call design makes the failure more visible (empty list everywhere).
- **RLS / small RLS changes:** Any policy that restricts SELECT on `projects` or `project_members` by `auth.uid()` or by `user_id` in `project_members` will affect non–firm_admin when the RPC runs as INVOKER. So tightening or changing those policies can make “missing or incomplete” data appear or worsen for viewers / project managers / editors.

---

## 3. Tab and feature visibility by role

| Feature / tab              | Firm Admin | Project Manager | Documentation Manager (vdcr_manager) | Editor | Viewer |
|----------------------------|------------|------------------|----------------------------------------|--------|--------|
| **Projects list**          | ✅ All firm projects (RPC, no email) | ⚠️ Only if `p_user_email` set + RLS allows | ⚠️ Same | ⚠️ Same | ⚠️ Same |
| **CompanyHighlights tabs** | ✅ All (production, documentation, timeline, milestone) | ✅ All if project list loaded | ⚠️ Only **documentation** tab (`canSeeTab` restricts) | ✅ All if project list loaded | ✅ All if project list loaded |
| **initialProjectIds from Index** | ✅ Yes (non-empty list) | ❌ No when RPC returns [] | ❌ No when RPC returns [] | ❌ No when RPC returns [] | ❌ No when RPC returns [] |
| **CompanyHighlights fallback** | N/A (uses initialProjectIds) | `fetchAssignedProjects(userId)` | Same | Same | Same |
| **Certificates tab**       | ✅ Shown (`userRole === 'firm_admin'`) | ❌ Not rendered in Index | ❌ Not rendered | ❌ Not rendered | ❌ Not rendered |
| **Add New Project button** | ✅ Shown | ✅ Shown | ❌ Hidden | ❌ Hidden | ❌ Hidden |

So:

- **Firm admin** works because it never depends on email or project_members for the project list, and it gets a full `initialProjectIds` and sees all tabs and the Certificates tab.
- **Project Manager / Editor / Viewer** can see the same tabs as firm admin **only if** they get a non-empty project list (correct `p_user_email` + RLS). If the RPC returns [], they get no `initialProjectIds`, CompanyHighlights can’t recover a list, and everything looks missing or incomplete.
- **Documentation Manager (vdcr_manager)** is further restricted in the UI to the documentation tab only; they still depend on the same project list and RPC/RLS for any data.

---

## 4. Recommended next steps (no code changes in this doc)

1. **Ensure email is always available for non–firm_admin when loading projects**
   - Don’t set `authLoading = false` before `fetchUserData` has run (or ensure `userId` / `userData` are in `localStorage` before any component that calls `getProjectsByFirm` runs).
   - Or have Index (or a single “auth ready” gate) depend on “user + userData populated” for non–firm_admin, not only on `authLoading`.

2. **Make `getProjectsByFirm` robust when email is missing**
   - e.g. get email from Supabase auth user: `supabase.auth.getUser().then(u => u.user?.email)` and pass that into the RPC, so the frontend doesn’t depend only on `userId` and `/users` or `userData` being ready.

3. **Verify RLS on `projects` and `project_members`**
   - Ensure non–firm_admin can SELECT rows that the RPC needs (e.g. by `project_members.email` matching the authenticated user’s email, or by `user_id` if that column is consistently set and policies use it).

4. **Optional: Pass empty array instead of `undefined` for `initialProjectIds`**
   - When `filteredProjects.length === 0`, pass `initialProjectIds={[]}` and keep `isFirmAdmin` so CompanyHighlights still knows “we have a list, it’s empty” and doesn’t do a second fetch that can fail for the same reasons. This avoids double failure and makes behavior more predictable (empty state instead of “incomplete” due to fallback logic).

5. **Confirm `project_members` population**
   - Ensure every non–firm_admin user who should see projects has at least one row in `project_members` with matching `email` (and optionally `user_id` if RLS uses it).

Once project list loading and RLS are fixed for non–firm_admin, the same code paths that work for firm admin (Index → CompanyHighlights with `initialProjectIds`, and per-tab data fetches) should show complete data for Project Manager, Editor, and Viewer; Documentation Manager will still see only the documentation tab by design.

---

## 5. Partial data: images load but “update by”, notes, description don’t

**Symptom:** Equipment and standalone equipment load; progress/update **images** load; but **“update by”**, **notes**, and **description** are missing or show “Unknown User” / “Team Member”.

### 5.1 Why images load but metadata doesn’t

- **Images** come from:
  - Progress images: `equipment_progress_images` / `standalone_equipment_progress_images` (e.g. `image_url`).
  - Progress entries (updates tab): image loaded on click via `getProgressEntryImageUrl(entryId)` from the same tables.
- **“Update by” / uploaded by** and **description/notes** depend on:
  - **Progress entries (updates tab):** A separate batch request to **`/users?id=in.(...)`** to resolve `created_by` → full name. That response is stored in `usersMap` and attached as `entry.users` and `entry.created_by_user`.
  - **Progress images (carousel/modal):** The API returns raw rows with `uploaded_by` (UUID) and `description`. **No user lookup is done** for progress images in `getEquipmentByProject` / `getStandaloneEquipment` – so `progress_images_metadata` never gets `created_by_user` or a display name. The UI then shows `currentMetadata?.created_by_user?.full_name || currentMetadata?.uploaded_by` → so it shows the **UUID** or the fallback **“Team Member”**.

So you get:

1. **Images** → from progress image/entry tables (and on-demand URL fetch); no user lookup needed → they load.
2. **“Update by” for progress entries** → from `/users` batch; if that call fails or returns partial (e.g. RLS), `usersMap` is empty → “Unknown User”.
3. **“Uploaded by” for progress images** → never resolved in the API → UUID or “Team Member”.
4. **Notes/description** → `entry_text` and `image_description` are in the same progress-entry row and are selected; if they still don’t show, the most likely cause is the UI reading a different key (e.g. camelCase vs snake_case) or the `/users` failure causing a later code path to not render the block that shows description.

### 5.2 What’s triggering this

1. **RLS on `users` table**  
   If non–firm_admin can only SELECT their own row (e.g. `id = auth.uid()`), then:
   - `GET /users?id=in.(id1, id2, id3)` returns only the current user (or empty).
   - `usersMap` is empty or partial.
   - Every progress entry whose `created_by` is **not** the current user gets `users: null`, `created_by_user: null` → UI shows “Unknown User” and may not show description in the same block.

2. **Progress images never get user resolution**  
   In `api.ts`, `getEquipmentByProject` and `getStandaloneEquipment` only build `userIds` from **progress entries** (`entry.created_by`). They do **not** include `uploaded_by` from **progress images**. So:
   - Progress images metadata stays as raw rows: `description`, `uploaded_by` (UUID), no `created_by_user`.
   - UI shows “Team Member” or the raw UUID for “Uploaded by” in the progress image modal.

3. **Catch block hides user fetch failure**  
   The `/users` batch is in a `try/catch`; on failure it only logs and leaves `usersMap = {}`. So the app keeps running, images still load, but all “update by” and any description that’s rendered from the same block appear missing.

### 5.3 Summary

| Data | Source | Why it can be missing for non–firm_admin |
|------|--------|------------------------------------------|
| Progress/update **images** | Progress image/entry tables + on-demand URL | No user lookup; RLS on those tables often allows read for assigned equipment → **load**. |
| **“Update by”** (progress entries) | `/users?id=in.(...)` → `usersMap` → `entry.created_by_user` | RLS on `users` can block or restrict rows → **empty usersMap** → “Unknown User”. |
| **“Uploaded by”** (progress images) | Not resolved in API; UI uses `uploaded_by` (UUID) or fallback | No batch for progress image `uploaded_by` → **UUID or “Team Member”**. |
| **Notes / description** | Same row as entry (`entry_text`, `image_description`) | Should be present; if missing, often same UI path as “update by” (e.g. block not rendered when user is unknown) or wrong key (camelCase vs snake_case). |

**Recommended fixes:**  
- Allow same-firm user read for `users` (or resolve names via an RPC that bypasses RLS) so `/users?id=in.(...)` returns all needed users.  
- Include progress image `uploaded_by` UUIDs in the same user-id batch and attach `created_by_user` (or equivalent) to each item in `progress_images_metadata` so “Uploaded by” shows a name instead of UUID/“Team Member”.
