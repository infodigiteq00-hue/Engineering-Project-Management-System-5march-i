-- Single RPC to return projects with equipment and documents (replaces N+1 REST calls).
-- Called with JWT; RLS applies (SECURITY INVOKER).
-- Returns JSON array: each element = project row + equipment[] + equipmentBreakdown + equipmentCount + 4 doc arrays.

CREATE OR REPLACE FUNCTION public.get_projects_by_firm(
  p_firm_id uuid,
  p_user_role text,
  p_user_email text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result json;
BEGIN
  WITH allowed AS (
    SELECT p.*
    FROM public.projects p
    WHERE (p_user_role = 'super_admin')
       OR (p_user_role = 'firm_admin' AND p.firm_id = p_firm_id)
       OR (p_user_role IS NOT NULL AND p_user_role <> 'super_admin' AND p_user_role <> 'firm_admin'
           AND p.firm_id = p_firm_id
           AND trim(coalesce(p_user_email, '')) <> ''
           AND p.id IN (
             SELECT pm.project_id
             FROM public.project_members pm
             WHERE lower(trim(pm.email)) = lower(trim(p_user_email))
           ))
    ORDER BY p.created_at DESC
  ),
  proj_equip AS (
    SELECT e.project_id,
           coalesce(json_agg(to_jsonb(e) ORDER BY e.created_at DESC), '[]'::json) AS equipment
    FROM public.equipment e
    WHERE e.project_id IN (SELECT id FROM allowed)
    GROUP BY e.project_id
  ),
  proj_breakdown AS (
    SELECT project_id,
           coalesce(json_object_agg(type, cnt), '{}'::json) AS equipment_breakdown
    FROM (
      SELECT e.project_id, coalesce(e.type, 'Unknown') AS type, count(*)::int AS cnt
      FROM public.equipment e
      WHERE e.project_id IN (SELECT id FROM allowed)
      GROUP BY e.project_id, e.type
    ) x
    GROUP BY project_id
  ),
  doc_unpriced AS (
    SELECT d.project_id,
           coalesce(json_agg(to_jsonb(d) ORDER BY d.created_at DESC), '[]'::json) AS docs
    FROM public.unpriced_po_documents d
    WHERE d.project_id IN (SELECT id FROM allowed)
    GROUP BY d.project_id
  ),
  doc_design AS (
    SELECT d.project_id,
           coalesce(json_agg(to_jsonb(d) ORDER BY d.created_at DESC), '[]'::json) AS docs
    FROM public.design_inputs_documents d
    WHERE d.project_id IN (SELECT id FROM allowed)
    GROUP BY d.project_id
  ),
  doc_client AS (
    SELECT d.project_id,
           coalesce(json_agg(to_jsonb(d) ORDER BY d.created_at DESC), '[]'::json) AS docs
    FROM public.client_reference_documents d
    WHERE d.project_id IN (SELECT id FROM allowed)
    GROUP BY d.project_id
  ),
  doc_other AS (
    SELECT d.project_id,
           coalesce(json_agg(to_jsonb(d) ORDER BY d.created_at DESC), '[]'::json) AS docs
    FROM public.other_documents d
    WHERE d.project_id IN (SELECT id FROM allowed)
    GROUP BY d.project_id
  )
  SELECT coalesce(
    json_agg(
      (to_jsonb(p) || jsonb_build_object(
        'equipment', coalesce(pe.equipment, '[]'::json),
        'equipmentBreakdown', coalesce(pb.equipment_breakdown, '{}'::json),
        'equipmentCount', json_array_length(coalesce(pe.equipment, '[]'::json)),
        'unpriced_po_documents', coalesce(d1.docs, '[]'::json),
        'design_inputs_documents', coalesce(d2.docs, '[]'::json),
        'client_reference_documents', coalesce(d3.docs, '[]'::json),
        'other_documents', coalesce(d4.docs, '[]'::json)
      )) ORDER BY p.created_at DESC
    ),
    '[]'::json
  ) INTO result
  FROM allowed p
  LEFT JOIN proj_equip pe ON pe.project_id = p.id
  LEFT JOIN proj_breakdown pb ON pb.project_id = p.id
  LEFT JOIN doc_unpriced d1 ON d1.project_id = p.id
  LEFT JOIN doc_design d2 ON d2.project_id = p.id
  LEFT JOIN doc_client d3 ON d3.project_id = p.id
  LEFT JOIN doc_other d4 ON d4.project_id = p.id;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_projects_by_firm(uuid, text, text) IS
  'Returns projects with equipment and document arrays in one call. Replaces N+1 REST pattern. RLS applies via SECURITY INVOKER.';
