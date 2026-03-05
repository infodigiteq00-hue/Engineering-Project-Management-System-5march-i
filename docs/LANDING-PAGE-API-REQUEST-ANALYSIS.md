# Landing Page & Project Load – API Request Analysis

Goal: bring initial load from **100–150** (and **250–300** after opening project details) down to **~30–40** or lower.

---

## Where the requests come from

### 1. Landing (projects tab) – **~70–80** (after fixes: lower)

| Source | Requests | Notes |
|--------|----------|--------|
| **getProjectsByFirm** | 1 | RPC; single HTTP call. |
| **Pre-cache** (1 project, after 3s) | ~10 | One `getEquipmentByProject(firstProject)` only. |
| **CompanyHighlights** | **~20–50+** | Project IDs (1–2 unless passed from Index), then **Key Progress** tab: `getAllProgressImagesMetadata` = 1 equipment + 1 progress_images + N equipment batches (was 15/eq, now 50/eq) + 1 projects. With many equipment this was a major contributor. |
| Auth/session | 0–1 | Cached after first use. |

**Other tabs (Standalone, Recommendation letter, etc.)** do **not** run on landing; they only load when the user switches to those tabs. So the 70–80 requests are from: Index (getProjectsByFirm + pre-cache) + CompanyHighlights (project IDs + production Key Progress).

### 2. When user selects one project – **+70–80**

| Source | Requests | Notes |
|--------|----------|--------|
| **getEquipmentByProject(projectId)** | ~10 | Same as above for one project. |
| **Documents batch** | 1 | Already batched. |
| **Team positions batch** | 1 | Already batched. |
| **Activities** | **N (e.g. 50)** | One request per equipment – **not yet batched**. |
| **Latest progress image URL** | **~8** | One per visible card – could be batched. |

So **landing + open one project** ≈ 81 + 10 + 1 + 1 + 50 + 8 ≈ **151**. More interaction (e.g. open another project, change page) can push to **250–300**.

### 3. Standalone tab

- **getStandaloneEquipment()** – one call but again many internal requests (equipment + progress batches + users), similar order of magnitude per “load”.

---

## Is 250–300 normal?

No. For “landing + open one project + equipment list” a reasonable target is **~15–40** requests total. 250–300 means we’re doing a lot of redundant or pre-emptive work (e.g. pre-caching 8 full projects) and still have N-style calls (activities, latest image URLs) that can be batched.

---

## Target: ~30–40 (or lower)

| Change | Saves (approx) | Result |
|--------|-----------------|--------|
| **Don’t pre-cache 8 projects on load** (defer or limit) | **~70–80** | Landing: 1 + 0 = **1** instead of 81. |
| **Batch activities** (1 call for all equipment IDs) | **~49** when N=50 | Grid load: +1 instead of +50. |
| **Batch “latest progress image URL”** for visible page | **~7** | +1 instead of +8. |
| **Optional: pre-cache only 1 project** (e.g. first visible) or **on hover** | Tunes balance | Keeps “first click” fast without 8× full load. |

Rough outcome:

- **Landing:** 1 (getProjectsByFirm).
- **Open one project:** ~10 (getEquipmentByProject) + 1 (docs) + 1 (team) + 1 (activities batch) + 1 (latest images batch) = **14**.
- **Total: ~15** for “landing then open one project”. With optional single-project or on-hover pre-cache, you can stay in the **~20–40** range even with some pre-caching.

---

## Implemented / to do

- **Done:** Documents batch, team positions batch, progress image next/prev (no extra pre-cache trigger).
- **Done:** Pre-cache on landing limited to **1 project after 3s** (no 8× getEquipmentByProject on load).
- **Done (landing 70–80 fix):**  
  - **initialProjectIds** passed from Index to CompanyHighlights so it skips duplicate project-ID fetch (saves 1–2).  
  - **Defer CompanyHighlights production fetch by 2s** (`deferReady`) so the first 2s only do getProjectsByFirm (+ pre-cache after 3s); Key Progress loads after delay (reduces burst).  
  - **Equipment batch size** in `getAllProgressImagesMetadata` and `getAllProgressEntriesMetadata` increased from 15 to **50** (fewer HTTP calls when many equipment).
- **Done:** Activities batch (N → 1); latest progress image URL batch.
- **To do:** None for current target.

After these changes, landing should drop toward **~15–35** requests (depending on firm size). Standalone equipment, recommendation letter, and other tabs do not run on landing.
