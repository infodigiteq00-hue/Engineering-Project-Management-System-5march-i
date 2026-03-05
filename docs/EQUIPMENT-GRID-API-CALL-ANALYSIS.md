# EquipmentGrid API Call Analysis

This doc lists which sections trigger **many** API calls vs **light** (few or none), so you know where batching will help most.

---

## Summary table

| Section | When it runs | # of API calls | Severity | Notes |
|--------|----------------|-----------------|----------|--------|
| **Document metadata** | On equipment load | **2N** (duplicate paths) | 🔴 Heavy | Two code paths both fetch docs per equipment |
| **Activities** | When grid has equipment | **N** | 🔴 Heavy | One request per equipment |
| **Team positions (project)** | When grid has equipment (project) | **N** | 🔴 Heavy | One request per equipment |
| **Team positions (standalone)** | When grid has equipment (standalone) | **N** | 🔴 Heavy | One request per equipment |
| **Progress images (latest URL)** | Per visible page | **~8 (or itemsPerPage)** | 🟠 Moderate | Bounded per page; can add up on pagination |
| **Pre-cache next page** | When user has next page | **1** full equipment fetch | 🟠 Moderate | Refetches full list for cache |
| **Technical sections** | — | **0** | 🟢 Light | Comes with main equipment fetch |
| **Custom fields** | — | **0** | 🟢 Light | Comes with main equipment fetch |
| **Progress entries (list)** | — | **0** | 🟢 Light | Batched in getEquipmentByProject |
| **Progress image by index** | On user click (prev/next) | **1** per click | 🟢 Light | On-demand only |

*N = number of equipment items in the current project/standalone list.*

---

## Batching: page-wise (all equipment) not per-equipment

Documents, team positions (and when added: activities) are batched **page-wise**:
- **One batch request** is made for **all** equipment IDs in the current list (e.g. `equipment_id=in.(id1,id2,...,id50)`).
- The server returns all rows; the client groups them by `equipment_id` and updates state.
- So we do **not** do “one batch per equipment” — we do **one batch for the whole list**, which replaces N separate requests.

---

## 🔴 Heavy: Document metadata (2N calls)

**What:** Loading document metadata (name, date, etc.) for the Docs tab and card badges.

**Where:**
1. **`loadDocumentsForEquipment(transformedEquipment)`** – called from the main sync effect when `equipment` changes. It does a **for loop** over `equipmentList` and calls **`getEquipmentDocumentsMetadata(eq.id)`** (or standalone variant) **per item** → **N requests**.
2. **useEffect with `equipment.forEach(item => fetchEquipmentDocuments(item.id))`** – runs when `equipment` changes and calls **`fetchEquipmentDocuments(item.id)`** for each item. Each call uses **`getEquipmentDocumentsMetadata`** (or standalone) → **another N requests**.

So on every equipment load you do **2N** document-metadata requests (same data, two code paths). Batching here (one batch API + single call) would cut this to **1** request and remove the duplicate path.

---

## 🔴 Heavy: Activities

**What:** Activity lists for the progress bar / updates per equipment.

**Where:**  
useEffect that runs when `localEquipment` has items. It builds `missingIds` (equipment with no activities in state) and does:

```ts
const results = await Promise.allSettled(missingIds.map((id: string) => apiCall(id)));
```

So **one request per equipment** (`getEquipmentActivities(id)` or standalone equivalent) → **N requests**.

**Batching:** Add something like `getEquipmentActivitiesBatch(equipmentIds)` and call it once with all `missingIds`.

---

## 🔴 Heavy: Team positions (project)

**What:** Team members assigned per equipment (project equipment, not standalone).

**Where:**  
`fetchAllProjectEquipmentTeamMembers(equipmentList)` is called from a useEffect when `equipment` and `projectId` are set. It does:

```ts
for (const eq of equipmentList) {
  const teamData = await fastAPI.getProjectEquipmentTeamPositions(eq.id);
  // ...
}
```

So **one request per equipment** → **N requests**.

**Batching:** Add `getProjectEquipmentTeamPositionsBatch(equipmentIds)` and call once.

---

## 🔴 Heavy: Team positions (standalone)

**What:** Team members per standalone equipment.

**Where:**  
In the main sync effect, when `projectId === 'standalone'` and there is `transformedEquipment`, it runs:

```ts
Promise.allSettled(
  transformedEquipment.map(async (eq: Equipment) => {
    const teamData = await DatabaseService.getStandaloneTeamPositions(eq.id);
    // ...
  })
);
```

So **one request per equipment** → **N requests**.

**Batching:** Add `getStandaloneTeamPositionsBatch(equipmentIds)` (or similar) and call once.

---

## 🟠 Moderate: Progress images (latest URL)

**What:** Thumbnail / first image for each equipment card on the current page.

**Where:**
1. **`fillLatestProgressImagesForPage`** – when the visible page is set, it does  
   `Promise.all(equipmentToFill.map(eq => fastAPI.getLatestProgressImageUrl(eq.id, isStandalone)))`  
   → **one request per visible card** (e.g. 8 if itemsPerPage is 8).
2. Another **useEffect** that filters `needLatest` and does  
   `needLatest.forEach(eq => fastAPI.getLatestProgressImageUrl(...))`  
   → again **one per visible equipment** that needs the latest image.

So you get on the order of **itemsPerPage** (e.g. 8) `getLatestProgressImageUrl` calls per page view. Not N for the whole list, but still multiple calls per page. A batch “latest image URL per equipment” for a set of IDs would reduce this to **1** request per page.

---

## 🟠 Moderate: Pre-cache next page

**What:** Pre-caching the next page of equipment for smoother pagination.

**Where:**  
useEffect that calls `fastAPI.getStandaloneEquipment(...)` or `fastAPI.getEquipmentByProject(projectId, ...)` **once** to refetch the full (or sliced) list and cache it.

So **1** full equipment fetch per “pre-cache next page” run. Impact is moderate (one big request) and could be tuned (e.g. only when next page is likely to be opened, or less often).

---

## 🟢 Light: Technical sections

**What:** Technical sections and their custom fields per equipment.

**Where:**  
They come from the **main equipment fetch**: `getEquipmentByProject` / `getStandaloneEquipment` already returns `technical_sections` (and `custom_fields`, `team_custom_fields`) on each equipment row from the DB. No extra API calls in EquipmentGrid for technical sections.

**Conclusion:** No per-item or extra calls; **light**.

---

## 🟢 Light: Custom fields / team custom fields

**What:** Custom fields and team custom fields on the equipment card and forms.

**Where:**  
Same as technical sections: part of the equipment row from **getEquipmentByProject** / **getStandaloneEquipment**. No extra requests.

**Conclusion:** **Light**.

---

## 🟢 Light: Progress entries (list) and progress image metadata

**What:** List of progress entries and progress image metadata (count, dates) for the grid.

**Where:**  
Already **batched** in `api.ts`: `getEquipmentByProject` / `getStandaloneEquipment` fetch progress_entries and progress_images (or metadata only when using `progressImagesLatestOnly`) in batches by equipment IDs. So the grid gets them in the **same 1 (+ batched) request(s)** as the equipment list. No N extra calls from EquipmentGrid.

**Conclusion:** **Light** (handled in existing batch logic).

---

## 🟢 Light: Progress image by index (prev/next)

**What:** Loading a specific image when the user clicks prev/next on the carousel.

**Where:**  
`fetchProgressImageForIndex(equipmentId, index)` → **one** `getProgressImageByEquipmentAndIndex(...)` call per user action. On-demand only.

**Conclusion:** **Light**.

---

## Recommended order for batching

1. **Documents** – Remove duplicate path and add batch document metadata API → biggest win (2N → 1).
2. **Activities** – Batch API for activities by equipment IDs → N → 1.
3. **Team positions (standalone)** – Batch API for standalone team positions → N → 1.
4. **Team positions (project)** – Batch API for project equipment team positions → N → 1.
5. **Progress image latest URL** – Optional: batch “latest image URL” for a set of IDs to turn ~8 calls per page into 1.

Technical sections, custom fields, and progress entries/list are already light; no batching needed there.
