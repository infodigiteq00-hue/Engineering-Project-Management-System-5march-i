-- 1) Enable RLS on newly added tables
ALTER TABLE public.equipment_activity_completion_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_activity_completion_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_activity_completion_inspection_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_activity_completion_inspection_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_vdcr_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_vdcr_code_completion_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_equipment_weights ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.equipment_production_checklist_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_production_checklist_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_production_checklist_completion_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_production_checklist_completion_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.standalone_equipment_production_checklist_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_production_checklist_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_production_checklist_completion_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_production_checklist_completion_reports ENABLE ROW LEVEL SECURITY;


-- 2) Drop old same-name policies if rerun-safe
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'equipment_activity_completion_images',
    'standalone_equipment_activity_completion_images',
    'equipment_activity_completion_inspection_reports',
    'standalone_equipment_activity_completion_inspection_reports',
    'project_vdcr_weights',
    'project_vdcr_code_completion_weights',
    'project_equipment_weights',
    'equipment_production_checklist_tasks',
    'equipment_production_checklist_task_completions',
    'equipment_production_checklist_completion_images',
    'equipment_production_checklist_completion_reports',
    'standalone_equipment_production_checklist_tasks',
    'standalone_equipment_production_checklist_task_completions',
    'standalone_equipment_production_checklist_completion_images',
    'standalone_equipment_production_checklist_completion_reports'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_auth_all ON public.%I;', t);
  END LOOP;
END $$;


-- 3) Baseline policy (compat mode): authenticated can manage all rows
-- NOTE: this still blocks anon and keeps service_role unaffected.
CREATE POLICY rls_auth_all ON public.equipment_activity_completion_images
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.equipment_activity_completions c
      JOIN public.equipment_activities a ON a.id = c.activity_id
      JOIN public.equipment e ON e.id = a.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE c.id = equipment_activity_completion_images.completion_id
        AND p.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (c.department IS NULL OR tp.department = c.department)
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (c.department IS NULL OR pm.department = c.department)
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.equipment_activity_completions c
      JOIN public.equipment_activities a ON a.id = c.activity_id
      JOIN public.equipment e ON e.id = a.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE c.id = equipment_activity_completion_images.completion_id
        AND p.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (c.department IS NULL OR tp.department = c.department)
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (c.department IS NULL OR pm.department = c.department)
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.standalone_equipment_activity_completion_images
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_activity_completions c
      JOIN public.standalone_equipment_activities a ON a.id = c.activity_id
      JOIN public.standalone_equipment se ON se.id = a.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE c.id = standalone_equipment_activity_completion_images.completion_id
        AND su.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (c.department IS NULL OR tp.department = c.department)
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_activity_completions c
      JOIN public.standalone_equipment_activities a ON a.id = c.activity_id
      JOIN public.standalone_equipment se ON se.id = a.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE c.id = standalone_equipment_activity_completion_images.completion_id
        AND su.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (c.department IS NULL OR tp.department = c.department)
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.equipment_activity_completion_inspection_reports
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.equipment_activity_completions c
      JOIN public.equipment_activities a ON a.id = c.activity_id
      JOIN public.equipment e ON e.id = a.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE c.id = equipment_activity_completion_inspection_reports.completion_id
        AND p.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (c.department IS NULL OR tp.department = c.department)
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (c.department IS NULL OR pm.department = c.department)
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.equipment_activity_completions c
      JOIN public.equipment_activities a ON a.id = c.activity_id
      JOIN public.equipment e ON e.id = a.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE c.id = equipment_activity_completion_inspection_reports.completion_id
        AND p.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (c.department IS NULL OR tp.department = c.department)
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (c.department IS NULL OR pm.department = c.department)
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.standalone_equipment_activity_completion_inspection_reports
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_activity_completions c
      JOIN public.standalone_equipment_activities a ON a.id = c.activity_id
      JOIN public.standalone_equipment se ON se.id = a.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE c.id = standalone_equipment_activity_completion_inspection_reports.completion_id
        AND su.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (c.department IS NULL OR tp.department = c.department)
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_activity_completions c
      JOIN public.standalone_equipment_activities a ON a.id = c.activity_id
      JOIN public.standalone_equipment se ON se.id = a.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE c.id = standalone_equipment_activity_completion_inspection_reports.completion_id
        AND su.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (c.department IS NULL OR tp.department = c.department)
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.project_vdcr_weights
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_vdcr_weights.project_id
        AND p.firm_id = get_user_firm_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_vdcr_weights.project_id
        AND p.firm_id = get_user_firm_id()
    )
  );

CREATE POLICY rls_auth_all ON public.project_vdcr_code_completion_weights
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_vdcr_code_completion_weights.project_id
        AND p.firm_id = get_user_firm_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_vdcr_code_completion_weights.project_id
        AND p.firm_id = get_user_firm_id()
    )
  );

CREATE POLICY rls_auth_all ON public.project_equipment_weights
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_equipment_weights.project_id
        AND p.firm_id = get_user_firm_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_equipment_weights.project_id
        AND p.firm_id = get_user_firm_id()
    )
  );

CREATE POLICY rls_auth_all ON public.equipment_production_checklist_tasks
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.equipment e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.id = equipment_production_checklist_tasks.equipment_id
        AND p.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (
                equipment_production_checklist_tasks.department IS NULL
                OR tp.department = equipment_production_checklist_tasks.department
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (
                equipment_production_checklist_tasks.department IS NULL
                OR pm.department = equipment_production_checklist_tasks.department
              )
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.equipment e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.id = equipment_production_checklist_tasks.equipment_id
        AND p.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (
                equipment_production_checklist_tasks.department IS NULL
                OR tp.department = equipment_production_checklist_tasks.department
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (
                equipment_production_checklist_tasks.department IS NULL
                OR pm.department = equipment_production_checklist_tasks.department
              )
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.equipment_production_checklist_task_completions
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.equipment_production_checklist_tasks t
      JOIN public.equipment e ON e.id = t.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE t.id = equipment_production_checklist_task_completions.task_id
        AND p.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (
                COALESCE(
                  equipment_production_checklist_task_completions.department,
                  t.department
                ) IS NULL
                OR tp.department = COALESCE(
                  equipment_production_checklist_task_completions.department,
                  t.department
                )
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (
                COALESCE(
                  equipment_production_checklist_task_completions.department,
                  t.department
                ) IS NULL
                OR pm.department = COALESCE(
                  equipment_production_checklist_task_completions.department,
                  t.department
                )
              )
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.equipment_production_checklist_tasks t
      JOIN public.equipment e ON e.id = t.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE t.id = equipment_production_checklist_task_completions.task_id
        AND p.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (
                COALESCE(
                  equipment_production_checklist_task_completions.department,
                  t.department
                ) IS NULL
                OR tp.department = COALESCE(
                  equipment_production_checklist_task_completions.department,
                  t.department
                )
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (
                COALESCE(
                  equipment_production_checklist_task_completions.department,
                  t.department
                ) IS NULL
                OR pm.department = COALESCE(
                  equipment_production_checklist_task_completions.department,
                  t.department
                )
              )
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.equipment_production_checklist_completion_images
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.equipment_production_checklist_task_completions c
      JOIN public.equipment_production_checklist_tasks t ON t.id = c.task_id
      JOIN public.equipment e ON e.id = t.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE c.id = equipment_production_checklist_completion_images.completion_id
        AND p.firm_id = get_user_firm_id()
        AND (
          is_firm_admin()
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR tp.department = COALESCE(c.department, t.department)
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR pm.department = COALESCE(c.department, t.department)
              )
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.equipment_production_checklist_task_completions c
      JOIN public.equipment_production_checklist_tasks t ON t.id = c.task_id
      JOIN public.equipment e ON e.id = t.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE c.id = equipment_production_checklist_completion_images.completion_id
        AND p.firm_id = get_user_firm_id()
        AND (
          is_firm_admin()
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR tp.department = COALESCE(c.department, t.department)
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR pm.department = COALESCE(c.department, t.department)
              )
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.equipment_production_checklist_completion_reports
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.equipment_production_checklist_task_completions c
      JOIN public.equipment_production_checklist_tasks t ON t.id = c.task_id
      JOIN public.equipment e ON e.id = t.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE c.id = equipment_production_checklist_completion_reports.completion_id
        AND p.firm_id = get_user_firm_id()
        AND (
          is_firm_admin()
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR tp.department = COALESCE(c.department, t.department)
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR pm.department = COALESCE(c.department, t.department)
              )
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.equipment_production_checklist_task_completions c
      JOIN public.equipment_production_checklist_tasks t ON t.id = c.task_id
      JOIN public.equipment e ON e.id = t.equipment_id
      JOIN public.projects p ON p.id = e.project_id
      WHERE c.id = equipment_production_checklist_completion_reports.completion_id
        AND p.firm_id = get_user_firm_id()
        AND (
          is_firm_admin()
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = e.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR tp.department = COALESCE(c.department, t.department)
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.project_members pm
              ON LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND pm.project_id = p.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR pm.department = COALESCE(c.department, t.department)
              )
          )
        )
    )
  );
  

CREATE POLICY rls_auth_all ON public.standalone_equipment_production_checklist_tasks
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment se
      JOIN public.users su ON su.id = se.created_by
      WHERE se.id = standalone_equipment_production_checklist_tasks.equipment_id
        AND su.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (
                standalone_equipment_production_checklist_tasks.department IS NULL
                OR tp.department = standalone_equipment_production_checklist_tasks.department
              )
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment se
      JOIN public.users su ON su.id = se.created_by
      WHERE se.id = standalone_equipment_production_checklist_tasks.equipment_id
        AND su.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (
                standalone_equipment_production_checklist_tasks.department IS NULL
                OR tp.department = standalone_equipment_production_checklist_tasks.department
              )
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.standalone_equipment_production_checklist_task_completions
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_production_checklist_tasks t
      JOIN public.standalone_equipment se ON se.id = t.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE t.id = standalone_equipment_production_checklist_task_completions.task_id
        AND su.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (
                COALESCE(
                  standalone_equipment_production_checklist_task_completions.department,
                  t.department
                ) IS NULL
                OR tp.department = COALESCE(
                  standalone_equipment_production_checklist_task_completions.department,
                  t.department
                )
              )
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_production_checklist_tasks t
      JOIN public.standalone_equipment se ON se.id = t.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE t.id = standalone_equipment_production_checklist_task_completions.task_id
        AND su.firm_id = get_user_firm_id()
        AND (
          EXISTS (
            SELECT 1
            FROM public.users urole
            WHERE urole.id = auth.uid()
              AND urole.is_active = true
              AND urole.role IN ('firm_admin', 'project_manager', 'vdcr_manager')
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (
                COALESCE(
                  standalone_equipment_production_checklist_task_completions.department,
                  t.department
                ) IS NULL
                OR tp.department = COALESCE(
                  standalone_equipment_production_checklist_task_completions.department,
                  t.department
                )
              )
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.standalone_equipment_production_checklist_completion_images
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_production_checklist_task_completions c
      JOIN public.standalone_equipment_production_checklist_tasks t ON t.id = c.task_id
      JOIN public.standalone_equipment se ON se.id = t.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE c.id = standalone_equipment_production_checklist_completion_images.completion_id
        AND su.firm_id = get_user_firm_id()
        AND (
          is_firm_admin()
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR tp.department = COALESCE(c.department, t.department)
              )
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_production_checklist_task_completions c
      JOIN public.standalone_equipment_production_checklist_tasks t ON t.id = c.task_id
      JOIN public.standalone_equipment se ON se.id = t.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE c.id = standalone_equipment_production_checklist_completion_images.completion_id
        AND su.firm_id = get_user_firm_id()
        AND (
          is_firm_admin()
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR tp.department = COALESCE(c.department, t.department)
              )
          )
        )
    )
  );

CREATE POLICY rls_auth_all ON public.standalone_equipment_production_checklist_completion_reports
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_production_checklist_task_completions c
      JOIN public.standalone_equipment_production_checklist_tasks t ON t.id = c.task_id
      JOIN public.standalone_equipment se ON se.id = t.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE c.id = standalone_equipment_production_checklist_completion_reports.completion_id
        AND su.firm_id = get_user_firm_id()
        AND (
          is_firm_admin()
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR tp.department = COALESCE(c.department, t.department)
              )
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.standalone_equipment_production_checklist_task_completions c
      JOIN public.standalone_equipment_production_checklist_tasks t ON t.id = c.task_id
      JOIN public.standalone_equipment se ON se.id = t.equipment_id
      JOIN public.users su ON su.id = se.created_by
      WHERE c.id = standalone_equipment_production_checklist_completion_reports.completion_id
        AND su.firm_id = get_user_firm_id()
        AND (
          is_firm_admin()
          OR EXISTS (
            SELECT 1
            FROM public.users u
            JOIN public.standalone_equipment_team_positions tp
              ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
            WHERE u.id = auth.uid()
              AND tp.equipment_id = se.id
              AND (
                COALESCE(c.department, t.department) IS NULL
                OR tp.department = COALESCE(c.department, t.department)
              )
          )
        )
    )
  );