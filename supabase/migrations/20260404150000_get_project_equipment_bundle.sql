-- Single RPC for project equipment grid: equipment rows + progress + documents + activities + checklist + team + VDCR rows.
-- Matches fastAPI.getEquipmentByProject + batch metadata loads; SECURITY INVOKER applies RLS.

CREATE OR REPLACE FUNCTION public.get_project_equipment_bundle(
  p_project_id uuid,
  p_progress_images_latest_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_allowed_ids uuid[];
  j_equipment jsonb;
  j_progress_images jsonb;
  j_progress_entries jsonb;
  j_documents jsonb;
  j_activities jsonb;
  j_activity_completions jsonb;
  j_checklist_tasks jsonb;
  j_checklist_completions jsonb;
  j_team_positions jsonb;
  j_vdcr jsonb;
  j_users jsonb;
  v_user_ids uuid[];
BEGIN
  IF p_project_id IS NULL THEN
    RETURN jsonb_build_object(
      'equipment', '[]'::jsonb,
      'progress_images', '[]'::jsonb,
      'progress_entries', '[]'::jsonb,
      'documents', '[]'::jsonb,
      'activities', '[]'::jsonb,
      'activity_completions', '[]'::jsonb,
      'checklist_tasks', '[]'::jsonb,
      'checklist_completions', '[]'::jsonb,
      'team_positions', '[]'::jsonb,
      'vdcr_records', '[]'::jsonb,
      'users', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(array_agg(e.id ORDER BY e.created_at DESC), '{}'::uuid[])
  INTO v_allowed_ids
  FROM public.equipment e
  WHERE e.project_id = p_project_id;

  IF v_allowed_ids IS NULL OR cardinality(v_allowed_ids) = 0 THEN
    RETURN jsonb_build_object(
      'equipment', '[]'::jsonb,
      'progress_images', '[]'::jsonb,
      'progress_entries', '[]'::jsonb,
      'documents', '[]'::jsonb,
      'activities', '[]'::jsonb,
      'activity_completions', '[]'::jsonb,
      'checklist_tasks', '[]'::jsonb,
      'checklist_completions', '[]'::jsonb,
      'team_positions', '[]'::jsonb,
      'vdcr_records', '[]'::jsonb,
      'users', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
  INTO j_equipment
  FROM (
    SELECT * FROM (
      SELECT e.*
      FROM public.equipment e
      WHERE e.project_id = p_project_id
      ORDER BY e.created_at DESC
    ) x
  ) sub;

  IF p_progress_images_latest_only THEN
    SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
    INTO j_progress_images
    FROM (
      SELECT pi.id, pi.equipment_id, pi.description, pi.uploaded_by, pi.upload_date, pi.created_at
      FROM (
        SELECT pi2.id, pi2.equipment_id, pi2.description, pi2.uploaded_by, pi2.upload_date, pi2.created_at
        FROM public.equipment_progress_images pi2
        WHERE pi2.equipment_id = any (v_allowed_ids)
        ORDER BY pi2.created_at DESC
        LIMIT 250
      ) pi
    ) sub;
  ELSE
    SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
    INTO j_progress_images
    FROM (
      SELECT * FROM (
        SELECT pi.*
        FROM public.equipment_progress_images pi
        WHERE pi.equipment_id = any (v_allowed_ids)
        ORDER BY pi.created_at DESC
        LIMIT 250
      ) pi
    ) sub;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
  INTO j_progress_entries
  FROM (
    SELECT * FROM (
      SELECT pe.*
      FROM public.equipment_progress_entries pe
      WHERE pe.equipment_id = any (v_allowed_ids)
      ORDER BY pe.created_at DESC
      LIMIT 250
    ) pe
  ) sub;

  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
  INTO j_documents
  FROM public.equipment_documents d
  WHERE d.equipment_id = any (v_allowed_ids);

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
  INTO j_activities
  FROM (
    SELECT * FROM (
      SELECT a.*
      FROM public.equipment_activities a
      WHERE a.equipment_id = any (v_allowed_ids)
      ORDER BY a.sort_order ASC NULLS LAST, a.sr_no ASC NULLS LAST
    ) x
  ) sub;

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  INTO j_activity_completions
  FROM public.equipment_activity_completions c
  WHERE c.activity_id IN (
    SELECT a.id FROM public.equipment_activities a WHERE a.equipment_id = any (v_allowed_ids)
  );

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
  INTO j_checklist_tasks
  FROM (
    SELECT * FROM (
      SELECT t.*
      FROM public.equipment_production_checklist_tasks t
      WHERE t.equipment_id = any (v_allowed_ids)
      ORDER BY t.sort_order ASC NULLS LAST, t.created_at ASC NULLS LAST
    ) x
  ) sub;

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  INTO j_checklist_completions
  FROM public.equipment_production_checklist_task_completions c
  INNER JOIN public.equipment_production_checklist_tasks t ON t.id = c.task_id
  WHERE t.equipment_id = any (v_allowed_ids);

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
  INTO j_team_positions
  FROM (
    SELECT * FROM (
      SELECT tp.*
      FROM public.equipment_team_positions tp
      WHERE tp.equipment_id = any (v_allowed_ids)
      ORDER BY tp.created_at DESC
    ) x
  ) sub;

  SELECT coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
  INTO j_vdcr
  FROM public.vdcr_records v
  WHERE v.project_id = p_project_id;

  SELECT coalesce(array_agg(DISTINCT uid), '{}'::uuid[])
  INTO v_user_ids
  FROM (
    SELECT pe.created_by AS uid
    FROM public.equipment_progress_entries pe
    WHERE pe.equipment_id = any (v_allowed_ids) AND pe.created_by IS NOT NULL
    UNION ALL
    SELECT d.uploaded_by AS uid
    FROM public.equipment_documents d
    WHERE d.equipment_id = any (v_allowed_ids) AND d.uploaded_by IS NOT NULL
    UNION ALL
    SELECT t.created_by AS uid
    FROM public.equipment_production_checklist_tasks t
    WHERE t.equipment_id = any (v_allowed_ids) AND t.created_by IS NOT NULL
    UNION ALL
    SELECT c.updated_by AS uid
    FROM public.equipment_activity_completions c
    WHERE c.activity_id IN (
      SELECT a.id FROM public.equipment_activities a WHERE a.equipment_id = any (v_allowed_ids)
    ) AND c.updated_by IS NOT NULL
    UNION ALL
    SELECT cc.updated_by AS uid
    FROM public.equipment_production_checklist_task_completions cc
    INNER JOIN public.equipment_production_checklist_tasks t ON t.id = cc.task_id
    WHERE t.equipment_id = any (v_allowed_ids) AND cc.updated_by IS NOT NULL
  ) s(uid)
  WHERE uid IS NOT NULL;

  IF v_user_ids IS NOT NULL AND cardinality(v_user_ids) > 0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
    INTO j_users
    FROM (
      SELECT usr.id, usr.full_name, usr.email
      FROM public.users usr
      WHERE usr.id = any (v_user_ids)
    ) u;
  ELSE
    j_users := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'equipment', j_equipment,
    'progress_images', j_progress_images,
    'progress_entries', j_progress_entries,
    'documents', j_documents,
    'activities', j_activities,
    'activity_completions', j_activity_completions,
    'checklist_tasks', j_checklist_tasks,
    'checklist_completions', j_checklist_completions,
    'team_positions', j_team_positions,
    'vdcr_records', j_vdcr,
    'users', j_users
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_equipment_bundle(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_equipment_bundle(uuid, boolean) TO service_role;
