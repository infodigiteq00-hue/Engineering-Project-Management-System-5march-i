-- Consolidate multiple permissive RLS policies into one per (table, role, action).
-- For each (table, role, command) that has more than one permissive policy, merge
-- USING and WITH CHECK with OR, drop the originals, create one policy.
-- Behavior unchanged; fewer policies evaluated per query (better performance).
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
--
-- Process groups in deterministic order (by table OID, then cmd, then roles) to avoid
-- deadlocks. Advisory lock serializes concurrent runs.

DO $$
DECLARE
  grp RECORD;
  pol RECORD;
  schema_name text;
  table_name text;
  tbl_ident text;
  role_name text;
  cmd_str text;
  merged_qual text;
  merged_with_check text;
  first_qual boolean;
  first_check boolean;
  new_policy_name text;
  pol_name text;
BEGIN
  -- Serialize concurrent execution and ensure consistent lock order
  PERFORM pg_advisory_xact_lock(hashtext('rls_consolidate_multi_perm'));

  FOR grp IN
    SELECT p.polrelid, p.polroles, p.polcmd,
           array_agg(p.polname ORDER BY p.polname) AS polnames
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    GROUP BY p.polrelid, p.polroles, p.polcmd
    HAVING count(*) > 1
    ORDER BY p.polrelid, p.polcmd, p.polroles::text
  LOOP
    SELECT n.nspname, c.relname INTO schema_name, table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = grp.polrelid;
    tbl_ident := quote_ident(schema_name) || '.' || quote_ident(table_name);

    SELECT r.rolname INTO role_name
    FROM pg_roles r
    WHERE r.oid = grp.polroles[1]
    LIMIT 1;
    IF role_name IS NULL THEN
      CONTINUE;
    END IF;

    cmd_str := CASE grp.polcmd
      WHEN 'r' THEN 'select'
      WHEN 'a' THEN 'insert'
      WHEN 'w' THEN 'update'
      WHEN 'd' THEN 'delete'
      WHEN '*' THEN 'all'
      ELSE 'cmd'
    END;

    merged_qual := NULL;
    merged_with_check := NULL;
    first_qual := true;
    first_check := true;

    FOR pol IN
      SELECT p2.polname, p2.polqual, p2.polwithcheck
      FROM pg_policy p2
      WHERE p2.polrelid = grp.polrelid
        AND p2.polroles = grp.polroles
        AND p2.polcmd = grp.polcmd
    LOOP
      IF pol.polqual IS NOT NULL THEN
        IF first_qual THEN
          merged_qual := '(' || pg_get_expr(pol.polqual, grp.polrelid) || ')';
          first_qual := false;
        ELSE
          merged_qual := merged_qual || ' OR (' || pg_get_expr(pol.polqual, grp.polrelid) || ')';
        END IF;
      END IF;
      IF pol.polwithcheck IS NOT NULL THEN
        IF first_check THEN
          merged_with_check := '(' || pg_get_expr(pol.polwithcheck, grp.polrelid) || ')';
          first_check := false;
        ELSE
          merged_with_check := merged_with_check || ' OR (' || pg_get_expr(pol.polwithcheck, grp.polrelid) || ')';
        END IF;
      END IF;
    END LOOP;

    IF merged_qual IS NULL AND grp.polcmd <> 'a' THEN
      merged_qual := 'true';
    END IF;
    IF merged_with_check IS NULL AND grp.polcmd IN ('a','w','*') THEN
      merged_with_check := 'true';
    END IF;

    FOREACH pol_name IN ARRAY grp.polnames
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol_name, tbl_ident);
    END LOOP;

    new_policy_name := 'rls_merged_' || role_name || '_' || cmd_str;
    new_policy_name := left(new_policy_name, 63);

    IF grp.polcmd = 'r' THEN
      EXECUTE format('CREATE POLICY %I ON %s FOR SELECT TO %I USING ( %s )',
        new_policy_name, tbl_ident, role_name, merged_qual);
    ELSIF grp.polcmd = 'a' THEN
      EXECUTE format('CREATE POLICY %I ON %s FOR INSERT TO %I WITH CHECK ( %s )',
        new_policy_name, tbl_ident, role_name, merged_with_check);
    ELSIF grp.polcmd = 'w' THEN
      EXECUTE format('CREATE POLICY %I ON %s FOR UPDATE TO %I USING ( %s ) WITH CHECK ( %s )',
        new_policy_name, tbl_ident, role_name, merged_qual, merged_with_check);
    ELSIF grp.polcmd = 'd' THEN
      EXECUTE format('CREATE POLICY %I ON %s FOR DELETE TO %I USING ( %s )',
        new_policy_name, tbl_ident, role_name, merged_qual);
    ELSIF grp.polcmd = '*' THEN
      EXECUTE format('CREATE POLICY %I ON %s FOR ALL TO %I USING ( %s ) WITH CHECK ( %s )',
        new_policy_name, tbl_ident, role_name, merged_qual, merged_with_check);
    END IF;
  END LOOP;
END;
$$;
