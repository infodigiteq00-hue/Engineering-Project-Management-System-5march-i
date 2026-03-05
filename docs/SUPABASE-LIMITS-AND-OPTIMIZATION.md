# Supabase Limits Analysis & Optimization Guide

This document explains **what limits you're hitting**, **why**, and **how to fix it** so the app stays fast for many users on the $25/month Pro plan.

---

## 1. What limits are you hitting?

Supabase shows messages like **"CPU usage exhausted"** and **"auth usage limits"**. Here’s what that means and how to confirm it in the dashboard.

### 1.1 CPU / compute

- **What it is:** Your project runs on a single database/compute instance. Every query, realtime message, and auth check uses CPU.
- **Pro $25 plan:** Includes **Micro compute** (2-core ARM **shared** CPU, 1 GB RAM). It’s the same small size as free tier; you mainly get more disk, egress, and support, not more CPU.
- **Where to check:**  
  **Dashboard → Your project → Reports (or Database / Observability) → CPU / Database health.**  
  You’ll see average CPU % and spikes. If it’s often near 100% or you see “high CPU” / “exhausted” messages, that’s the limit you’re hitting.

### 1.2 Auth usage

- **What it is:** Each **getSession**, **getUser**, **token refresh**, and **onAuthStateChange** (and similar) counts as auth usage. So does each **monthly active user (MAU)**.
- **Pro plan:** Typically **100,000 MAU** included; beyond that, usage-based billing.
- **Where to check:**  
  **Dashboard → Project Settings → Billing (or Usage).**  
  Look for **Auth** / **MAU** or “auth usage” to see if you’re near or over the included amount.

### 1.3 Other limits (good to be aware of)

- **Database size:** Pro often includes 8 GB.
- **Egress:** 250 GB database egress, 250 GB cached egress.
- **Realtime:** Concurrent connections and message volume can also stress CPU.

So when Supabase says you’re exhausting **CPU** or **auth** limits, it means:

- **CPU:** The Micro instance is too small for the current number and pattern of requests.
- **Auth:** You’re either close to or over the included MAU, or you’re making a lot of auth API calls (e.g. session checks / refreshes).

---

## 2. Why you’re hitting those limits (root cause)

Two things changed: you went from **free → Pro** (same Micro CPU) and the app is built for **many users** with patterns that multiply load.

### 2.1 Same compute size on Pro

- **Free tier:** 500 MB DB, shared CPU, 50K MAU, projects can pause after inactivity.
- **Pro $25:** Same **Micro** compute (2-core shared, 1 GB RAM). You get more disk, egress, backups, and support, but **not** more CPU.
- So if free tier was already near its limit, Pro doesn’t fix CPU — it only avoids pause and gives more room for storage/egress/auth.

So **“CPU exhausted”** can continue on Pro because the **machine size didn’t change**.

### 2.2 Frontend fetch loop (fixed)

The dashboard had a **double fetch** and **tab-focus refetch** pattern that burned IO:

- **Double fetch on load:** The projects `useEffect` depended on `[authLoading, isWindowVisible]`. When `authLoading` was true but localStorage had firmId, the effect ran and fetched (Fetch 1). When AuthContext then set `authLoading` to false, the effect ran again and fetched again (Fetch 2). So every dashboard load triggered **2× getProjectsByFirm**.
- **Refetch on every tab focus:** When the user switched browser tab away and back, `isWindowVisible` went false → true, so the effect ran again and did a full project fetch. Heavy tab-switching or multiple tabs multiplied requests.

**Fix applied in `Index.tsx`:** Fetch only when `authLoading === false` (wait for auth to be ready, then fetch once). Use a ref to skip running the fetch again when `authLoading` flips to false right after the first run. Use a 1-minute throttle so that when the user switches tab back, we don’t refetch if we already fetched in the last 60 seconds. Reset the “already fetched” flag when `authLoading` becomes true (e.g. logout) so the next login gets a fresh fetch.

### 2.3 Too many requests per user (N+1 and per-item calls)

The codebase does a lot of **per-item** API calls instead of **batched** ones. Every time a user opens a project with many equipment items, Supabase gets a burst of requests. That burns CPU and can trigger timeouts.

Examples from the app:

| Where | What happens | Effect |
|--------|----------------|--------|
| **EquipmentGrid** (on load) | `equipment.forEach(item => fetchEquipmentDocuments(item.id))` | **N** calls for document metadata (e.g. 50 equipment → 50 requests). |
| **EquipmentGrid** (activities) | `missingIds.map(id => getEquipmentActivities(id))` | **N** calls for activities (one per equipment). |
| **EquipmentGrid** (progress images) | `equipmentToFill.map(eq => getLatestProgressImageUrl(eq.id, ...))` | **8+** calls per page of cards (on-demand images). |
| **Standalone equipment** | Pre-fetch team for every equipment: `getStandaloneTeamPositions(eq.id)` per item | **N** calls. |
| **EquipmentGrid** (debug) | `fastAPI.getAllDocuments()` on every equipment load | Extra **1** heavy call every time the grid loads. |
| **AuthContext + api interceptor** | `getSession()` (cached 5 min) and `getUser()` on login/refresh | Multiple auth calls per user/session; token refresh counts as auth. |
| **Realtime** | AuthContext subscribes to `firms` table; DatabaseService has channels for projects, equipment, vdcr_records | More connections and CPU when many users are online. |

So for **one** user opening **one** project with **50 equipment** items, you can easily get:

- 1× getEquipmentByProject (batched in API)
- 50× document metadata
- 50× activities
- 50× team (standalone) or similar
- 8× progress image URLs for the first page
- 1× getAllDocuments (debug)
- Plus auth (getSession/getUser) and any realtime

That’s **hundreds of requests** for a single screen. With **many users** and **multiple tabs**, CPU and auth usage add up quickly. That’s the **root cause** of hitting limits.

### 2.4 Slow or unoptimized queries

- Long-running queries (>1 s) keep the CPU busy and can cause timeouts (e.g. 57014).
- Missing **indexes** on filters (e.g. `project_id`, `equipment_id`, `firm_id`) force full table scans and increase CPU.

So:

- **CPU:** Micro compute + many per-item requests + possible heavy queries/indexes.
- **Auth:** MAU growth + session/token refresh and repeated getSession/getUser.

---

## 3. What the $25 Pro plan covers and where you’re “missing out”

Rough summary:

| Item | Pro $25 typically includes | Where you might be “missing out” |
|------|----------------------------|-----------------------------------|
| **Compute** | Micro (2-core shared, 1 GB) | Same as free; no extra CPU. You need **compute add-on** (e.g. Small/Large) for more CPU. |
| **Database** | 8 GB | Usually enough unless you’re very large. |
| **Auth (MAU)** | 100,000 MAU | Only “missing” if you exceed MAU or do excessive auth API calls. |
| **Egress** | 250 GB DB + 250 GB cached | Fine unless you send huge payloads or have huge traffic. |
| **Backups / support** | 7-day backups, email support | You get these. |

So:

- **If the message is “CPU exhausted”:** The $25 plan does **not** include a bigger compute. You either **optimize usage** (fewer and lighter requests) or **add a Compute Add-on** (~$10+ for Micro is already included; next tier up is more $).
- **If the message is “auth usage limits”:** You’re either over MAU or doing too many auth calls; reducing redundant getSession/getUser and refreshes helps.

“Treading lightly” (fewer users or less usage) can keep you within limits for a while, but for a **platform for many users** you need to **reduce load per user** (fewer requests, batching, caching) so the same Pro plan can serve more people.

---

## 4. How to fix it (in order of impact)

### 4.1 Reduce N+1 and per-item API calls (highest impact)

- **Documents:**  
  Add a **batch** API that returns document metadata for **many** equipment IDs in one request (e.g. `getEquipmentDocumentsMetadata(equipmentIds: string[])`).  
  In EquipmentGrid, call it **once** with all IDs for the current project instead of `fetchEquipmentDocuments(item.id)` per item.

- **Activities:**  
  Add a **batch** API that returns activities for **many** equipment IDs (e.g. `getEquipmentActivitiesBatch(equipmentIds: string[])`).  
  In EquipmentGrid, call it **once** for `missingIds` instead of one call per ID.

- **Team positions (standalone):**  
  Add a batch `getStandaloneTeamPositionsForEquipment(equipmentIds: string[])` and use it instead of calling `getStandaloneTeamPositions(eq.id)` in a loop.

- **Progress image URLs:**  
  Keep on-demand loading for images, but where you need “latest image per equipment” for a list, add a **single** batch endpoint that returns a map `equipmentId → url` for a set of IDs, and call it once per page.

- **Remove or gate debug calls:**  
  Remove or guard `fastAPI.getAllDocuments()` so it never runs on every equipment load in production (e.g. only in dev or behind a flag).

These changes **directly reduce** the number of Supabase requests per page load and thus **CPU and egress**.

### 4.2 Auth: avoid redundant session/user calls

- **api.ts:** You already cache the session token for 5 minutes; keep that. Ensure no code path calls `getSession()` on every request when cache is valid.
- **AuthContext:** Call `getUser()` or `getSession()` only when necessary (e.g. initial load, after login, after 401). Avoid calling it on every tab focus or timer if you already have a valid session in memory/localStorage.
- **Token refresh:** Rely on Supabase’s `autoRefreshToken` once; don’t trigger extra auth calls unless needed.

That keeps **auth usage** and **MAU** from growing faster than necessary.

### 4.3 Database: indexes and query performance

- Add indexes on columns used in filters and joins, e.g.:
  - `equipment(project_id)`, `equipment(firm_id)` if used
  - `equipment_progress_images(equipment_id)`, `equipment_progress_entries(equipment_id)`
  - `project_documents` / document tables by `equipment_id` or whatever you filter on
  - `vdcr_records(project_id)`, `projects(firm_id)`
- Use **Supabase Dashboard → SQL Editor** or **Reports** to find slow queries (>1 s) and optimize them (simplify, add indexes, limit result size).

This lowers **CPU per request** and prevents timeouts.

### 4.4 Realtime: use only where needed

- Keep only subscriptions that are required for live updates (e.g. firm settings, current project’s equipment). Avoid subscribing to entire tables or every project for every user.
- If you don’t need live updates for a given view, don’t subscribe; use one-time fetch + refresh button or short-lived polling instead.

That reduces **realtime connections and message volume**, which also use CPU.

### 4.5 Caching and “tread lightly” behavior

- You already have a client-side cache (e.g. `cache.ts`). Use it for:
  - Project list, equipment list, document metadata, team members.
- Set reasonable TTLs (e.g. 2–5 minutes) so data stays fresh but you don’t refetch on every navigation.
- Avoid refetching the same data in multiple components; fetch once and pass down or use a shared cache key.

This further cuts redundant requests and helps the **same Pro plan** serve more users.

### 4.6 If you still need more CPU after optimizing

- In **Supabase Dashboard → Project Settings → Compute and disk**, add a **Compute Add-on** (e.g. Small or larger). That gives a **dedicated** or larger CPU and more RAM, which directly addresses “CPU exhausted” when optimization isn’t enough.
- Cost is typically on the order of tens of dollars per month on top of the $25 plan.

---

## 5. Summary

| Question | Answer |
|----------|--------|
| **What limits are we hitting?** | **CPU** (Micro instance saturated) and/or **auth usage** (MAU or too many auth API calls). Check Dashboard → Reports / Database health and Billing / Usage. |
| **Why?** | (1) Pro $25 keeps the **same Micro CPU** as free. (2) App does **many per-item requests** (documents, activities, team, images) instead of batched calls, so one user opening one project can trigger hundreds of requests. (3) Possible heavy queries or missing indexes. |
| **What does the $25 package cover?** | More disk, egress, backups, support, and higher MAU — **not** more CPU. To get more CPU you need a **Compute Add-on**. |
| **Will “treading lightly” suffice?** | It can delay hitting limits, but for a **multi-user platform** you need to **reduce load per user** (batching, caching, indexes). Then the same $25 plan can handle more users; if you still need more headroom, add a compute add-on. |
| **Root cause** | Too many Supabase requests per page (N+1 / per-item calls) and same small compute; fix by batching, caching, and indexing. |

Implementing **Section 4.1** (batch APIs and removing per-item calls) will have the biggest impact on Supabase speed and limits. If you want, we can next outline concrete code changes (which files and functions to add/change) for the batch APIs and EquipmentGrid.
