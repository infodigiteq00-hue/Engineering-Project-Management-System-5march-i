-- ============================================================================
-- HELPER FUNCTIONS BACKUP - ENGINEERING PROJECT MANAGEMENT SYSTEM
-- ============================================================================
-- RLS policies use these functions. Run this file BEFORE supabase_schema_RLS.sql
--
-- RESTORE ORDER:
--   1. supabase_schema_backup.sql (schema/tables)
--   2. supabase_schema_helper_function.sql (this file - helper functions)
--   3. supabase_schema_RLS.sql (RLS policies)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_firm_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result uuid;
BEGIN
  -- Use SECURITY DEFINER to bypass RLS
  SELECT firm_id INTO result
  FROM public.users
  WHERE id = auth.uid()
  AND is_active = true
  LIMIT 1;
  
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_project(project_id_param uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Use SECURITY DEFINER to bypass RLS when checking project_members
  -- This is necessary because this function is used in RLS policies for project_members itself
  RETURN EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_id_param
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND LOWER(TRIM(pm.email)) = LOWER(TRIM(u.email))
    )
    AND pm.status = 'active'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_firm_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Use SECURITY DEFINER to bypass RLS
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'firm_admin'
    AND is_active = true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Use SECURITY DEFINER to bypass RLS
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_user_assigned_to_standalone_equipment(equipment_id_param uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.standalone_equipment_team_positions tp
    JOIN public.users u ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
    WHERE tp.equipment_id = equipment_id_param
    AND u.id = auth.uid()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_user_assigned_to_standalone_equipment_for_insert(equipment_id_param uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.standalone_equipment_team_positions tp
    JOIN public.users u ON LOWER(TRIM(tp.email)) = LOWER(TRIM(u.email))
    WHERE tp.equipment_id = equipment_id_param
    AND u.id = auth.uid()
  );
END;
$function$;
