-- Single RPC for standalone equipment: list + progress + documents + activities + checklist + team.
-- Mirrors visibility rules from fastAPI.getStandaloneEquipment (SECURITY INVOKER = RLS + JWT).
-- Client merges rows in TypeScript to preserve the same shapes as existing REST batch helpers.

CREATE OR REPLACE FUNCTION public.get_standalone_equipment_bundle(
  p_firm_id uuid,
  p_progress_images_latest_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_email text;
  v_my_firm uuid;
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
  j_users jsonb;
  v_user_ids uuid[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
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
      'users', '[]'::jsonb
    );
  END IF;

  SELECT u.role, lower(trim(coalesce(u.email, ''))), u.firm_id
  INTO v_role, v_email, v_my_firm
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_role = 'super_admin' THEN
    SELECT coalesce(array_agg(x.id ORDER BY x.created_at DESC), '{}'::uuid[])
    INTO v_allowed_ids
    FROM public.standalone_equipment x;
  ELSIF v_role = 'firm_admin' THEN
    SELECT coalesce(array_agg(se.id ORDER BY se.created_at DESC), '{}'::uuid[])
    INTO v_allowed_ids
    FROM public.standalone_equipment se
    WHERE se.created_by IN (
      SELECT u2.id
      FROM public.users u2
      WHERE u2.firm_id = coalesce(v_my_firm, p_firm_id)
    );
  ELSE
    IF v_email IS NULL OR v_email = '' THEN
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
        'users', '[]'::jsonb
      );
    END IF;
    SELECT coalesce(array_agg(DISTINCT se.id), '{}'::uuid[])
    INTO v_allowed_ids
    FROM public.standalone_equipment se
    INNER JOIN public.standalone_equipment_team_positions tp ON tp.equipment_id = se.id
    WHERE lower(trim(coalesce(tp.email, ''))) = v_email;
  END IF;

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
      'users', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
  INTO j_equipment
  FROM (
    SELECT * FROM (
      SELECT se.*
      FROM public.standalone_equipment se
      WHERE se.id = any (v_allowed_ids)
      ORDER BY se.created_at DESC
    ) x
  ) sub;

  IF p_progress_images_latest_only THEN
    SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
    INTO j_progress_images
    FROM (
      SELECT pi.id, pi.equipment_id, pi.description, pi.uploaded_by, pi.upload_date, pi.created_at
      FROM (
        SELECT pi2.id, pi2.equipment_id, pi2.description, pi2.uploaded_by, pi2.upload_date, pi2.created_at
        FROM public.standalone_equipment_progress_images pi2
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
        FROM public.standalone_equipment_progress_images pi
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
      FROM public.standalone_equipment_progress_entries pe
      WHERE pe.equipment_id = any (v_allowed_ids)
      ORDER BY pe.created_at DESC
      LIMIT 250
    ) pe
  ) sub;

  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
  INTO j_documents
  FROM public.standalone_equipment_documents d
  WHERE d.equipment_id = any (v_allowed_ids);

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
  INTO j_activities
  FROM (
    SELECT * FROM (
      SELECT a.*
      FROM public.standalone_equipment_activities a
      WHERE a.equipment_id = any (v_allowed_ids)
      ORDER BY a.sort_order ASC NULLS LAST, a.sr_no ASC NULLS LAST
    ) x
  ) sub;

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  INTO j_activity_completions
  FROM public.standalone_equipment_activity_completions c
  WHERE c.activity_id IN (
    SELECT a.id FROM public.standalone_equipment_activities a WHERE a.equipment_id = any (v_allowed_ids)
  );

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
  INTO j_checklist_tasks
  FROM (
    SELECT * FROM (
      SELECT t.*
      FROM public.standalone_equipment_production_checklist_tasks t
      WHERE t.equipment_id = any (v_allowed_ids)
      ORDER BY t.sort_order ASC NULLS LAST, t.created_at ASC NULLS LAST
    ) x
  ) sub;

  SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  INTO j_checklist_completions
  FROM public.standalone_equipment_production_checklist_task_completions c
  INNER JOIN public.standalone_equipment_production_checklist_tasks t ON t.id = c.task_id
  WHERE t.equipment_id = any (v_allowed_ids);

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb)
  INTO j_team_positions
  FROM (
    SELECT * FROM (
      SELECT tp.*
      FROM public.standalone_equipment_team_positions tp
      WHERE tp.equipment_id = any (v_allowed_ids)
      ORDER BY tp.created_at DESC
    ) x
  ) sub;

  SELECT coalesce(array_agg(DISTINCT uid), '{}'::uuid[])
  INTO v_user_ids
  FROM (
    SELECT pe.created_by AS uid
    FROM public.standalone_equipment_progress_entries pe
    WHERE pe.equipment_id = any (v_allowed_ids) AND pe.created_by IS NOT NULL
    UNION ALL
    SELECT d.uploaded_by AS uid
    FROM public.standalone_equipment_documents d
    WHERE d.equipment_id = any (v_allowed_ids) AND d.uploaded_by IS NOT NULL
    UNION ALL
    SELECT t.created_by AS uid
    FROM public.standalone_equipment_production_checklist_tasks t
    WHERE t.equipment_id = any (v_allowed_ids) AND t.created_by IS NOT NULL
    UNION ALL
    SELECT c.updated_by AS uid
    FROM public.standalone_equipment_activity_completions c
    WHERE c.activity_id IN (
      SELECT a.id FROM public.standalone_equipment_activities a WHERE a.equipment_id = any (v_allowed_ids)
    ) AND c.updated_by IS NOT NULL
    UNION ALL
    SELECT cc.updated_by AS uid
    FROM public.standalone_equipment_production_checklist_task_completions cc
    INNER JOIN public.standalone_equipment_production_checklist_tasks t ON t.id = cc.task_id
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
    'users', j_users
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_standalone_equipment_bundle(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_standalone_equipment_bundle(uuid, boolean) TO service_role;
