-- Fix Auth RLS Initialization Plan for ALL public schema policies.
-- Replaces auth.uid(), auth.jwt(), auth.role() with (select auth.uid()) etc.
-- so the planner evaluates once per query instead of per row.
-- Safe to run: only alters expression form; logic unchanged.
-- Complements 20250227110000 which fixed a subset manually.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

DO $$
DECLARE
  r RECORD;
  qual_text text;
  with_check_text text;
  new_qual text;
  new_with_check text;
  tbl_ident text;
  pol_cmd text;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      p.polname AS policy_name,
      p.polrelid,
      p.polcmd,
      p.polqual,
      p.polwithcheck
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    tbl_ident := quote_ident(r.schema_name) || '.' || quote_ident(r.table_name);

    -- Get USING expression as text (skip if INSERT-only and no qual)
    IF r.polqual IS NOT NULL THEN
      qual_text := pg_get_expr(r.polqual, r.polrelid);
      -- Avoid double-wrapping: replace already-wrapped first with placeholder
      new_qual := qual_text;
      new_qual := replace(new_qual, '(select auth.uid())', '__AUTH_UID_PLACEHOLDER__');
      new_qual := replace(new_qual, '(select auth.jwt())', '__AUTH_JWT_PLACEHOLDER__');
      new_qual := replace(new_qual, '(select auth.role())', '__AUTH_ROLE_PLACEHOLDER__');
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, 'auth.jwt()', '(select auth.jwt())');
      new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
      new_qual := replace(new_qual, '__AUTH_UID_PLACEHOLDER__', '(select auth.uid())');
      new_qual := replace(new_qual, '__AUTH_JWT_PLACEHOLDER__', '(select auth.jwt())');
      new_qual := replace(new_qual, '__AUTH_ROLE_PLACEHOLDER__', '(select auth.role())');

      IF new_qual IS DISTINCT FROM qual_text THEN
        EXECUTE format(
          'ALTER POLICY %I ON %s USING ( %s )',
          r.policy_name,
          tbl_ident,
          new_qual
        );
      END IF;
    END IF;

    -- Get WITH CHECK expression as text
    IF r.polwithcheck IS NOT NULL THEN
      with_check_text := pg_get_expr(r.polwithcheck, r.polrelid);
      new_with_check := with_check_text;
      new_with_check := replace(new_with_check, '(select auth.uid())', '__AUTH_UID_PLACEHOLDER__');
      new_with_check := replace(new_with_check, '(select auth.jwt())', '__AUTH_JWT_PLACEHOLDER__');
      new_with_check := replace(new_with_check, '(select auth.role())', '__AUTH_ROLE_PLACEHOLDER__');
      new_with_check := replace(new_with_check, 'auth.uid()', '(select auth.uid())');
      new_with_check := replace(new_with_check, 'auth.jwt()', '(select auth.jwt())');
      new_with_check := replace(new_with_check, 'auth.role()', '(select auth.role())');
      new_with_check := replace(new_with_check, '__AUTH_UID_PLACEHOLDER__', '(select auth.uid())');
      new_with_check := replace(new_with_check, '__AUTH_JWT_PLACEHOLDER__', '(select auth.jwt())');
      new_with_check := replace(new_with_check, '__AUTH_ROLE_PLACEHOLDER__', '(select auth.role())');

      IF new_with_check IS DISTINCT FROM with_check_text THEN
        EXECUTE format(
          'ALTER POLICY %I ON %s WITH CHECK ( %s )',
          r.policy_name,
          tbl_ident,
          new_with_check
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;
