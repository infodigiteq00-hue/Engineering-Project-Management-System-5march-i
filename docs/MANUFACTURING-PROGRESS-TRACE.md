# Manufacturing progress – trace (UI → DB)

## What manufacturing %

- **Per equipment:** 0–100% (the “how much % work was done” you set when marking QAP steps complete).
- **Project card:** Average of all equipments’ progress for that project (equal weight per equipment).

---

## Flow when you set progress in the app

1. **UI – Mark complete modal**  
   - You mark a QAP step complete and set the “percentage completed” slider.  
   - `EquipmentGrid.tsx` (around 3858–3871): when that % is different from current equipment progress, it calls:
     - **Project equipment:** `fastAPI.updateEquipment(equipmentId, { progress: pct }, currentUserId)`
     - **Standalone:** `fastAPI.updateStandaloneEquipment(equipmentId, { progress: pct }, currentUserId)`
   - So the payload is `{ progress: <number> }` (e.g. 88).

2. **API – updateEquipment**  
   - `src/lib/api.ts` ~1954–1990:  
     - Builds `updateData = { ...equipmentData, updated_at, updated_by }` → includes `progress`.  
     - Sends `PATCH /rest/v1/equipment?id=eq.<id>` with body `{ "progress": 88, "updated_at": "...", "updated_by": "..." }`.  
   - No interceptors change the body; only the `Authorization` header is set.  
   - So the backend receives `progress` as sent.

3. **Supabase**  
   - PostgREST updates the `equipment` row.  
   - The column it writes to must be named **`progress`** (lowercase).  
   - If that column **does not exist**, PATCH can return 400 (“column does not exist”) and the catch in step 1 shows the toast: *“Activity marked complete, but progress percentage could not be updated.”*

4. **Project card metrics**  
   - `get_project_card_metrics` RPC reads `avg(coalesce(e.progress, 0))` from `public.equipment` for the project.  
   - If `progress` was never stored (column missing or update failing), every row is 0/NULL → manufacturing shows 0%.

---

## Why you were seeing 0%

- Most likely the **`progress` column did not exist** on `equipment` (and possibly `standalone_equipment`) in your DB.  
- The table may have been created from a schema that didn’t include `progress`, while the app and RPC assume it exists.  
- So:
  - Either the PATCH failed (you may have seen the “progress percentage could not be updated” toast), or  
  - The column existed but was never updated for other reasons (e.g. RLS blocking the update).

---

## What was changed

1. **Migration `20250313205000_equipment_progress_column.sql`**  
   - Adds `progress` to `public.equipment` and `public.standalone_equipment` with `ADD COLUMN IF NOT EXISTS progress numeric DEFAULT 0`.  
   - Run this migration so that:
     - PATCH from the app can persist `progress`.
     - The RPC can read `e.progress` and manufacturing % can be non-zero.

2. **RPC (already in place)**  
   - Manufacturing = `avg(coalesce(e.progress, 0))` over all equipments for the project (NULL counts as 0).

---

## What you should do

1. Run migrations (so `20250313205000_equipment_progress_column.sql` is applied).  
2. Reload the app and, for a few equipments, open “Mark complete” and set the percentage again (so a PATCH is sent with the new column in place).  
3. Refresh the dashboard; manufacturing % should then reflect the stored progress values.

If you ever see the toast *“Activity marked complete, but progress percentage could not be updated”*, check the browser Network tab for the PATCH to `equipment` and the response (e.g. 400 and “column … does not exist” or an RLS error).
