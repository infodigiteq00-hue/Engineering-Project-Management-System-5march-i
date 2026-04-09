-- ============================================================================
-- Bulk VDCR documentation upload (Documentation tab Excel bulk upload)
-- Replaces N× POST /vdcr_records + N× syncVDCRToEquipment HTTP calls with one RPC.
-- Apply in Supabase SQL Editor or: supabase db push
-- ============================================================================

-- Ensure columns exist (additive; safe if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vdcr_records' AND column_name = 'department'
  ) THEN
    ALTER TABLE public.vdcr_records ADD COLUMN department text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vdcr_records' AND column_name = 'show_in_equipment_doc_tab'
  ) THEN
    ALTER TABLE public.vdcr_records ADD COLUMN show_in_equipment_doc_tab boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_documents' AND column_name = 'vdcr_record_id'
  ) THEN
    ALTER TABLE public.equipment_documents ADD COLUMN vdcr_record_id uuid REFERENCES public.vdcr_records(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_documents' AND column_name = 'vdcr_code_status'
  ) THEN
    ALTER TABLE public.equipment_documents ADD COLUMN vdcr_code_status text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'equipment_documents' AND column_name = 'vdcr_document_status'
  ) THEN
    ALTER TABLE public.equipment_documents ADD COLUMN vdcr_document_status text;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_upload_vdcr_documentation(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_id uuid;
  v_project_id uuid;
  v_firm_id uuid;
  v_updated_by uuid;
  v_sr_no text;
  v_equipment_tags text[];
  v_mfg text[];
  v_job text[];
  v_client_doc text;
  v_internal_doc text;
  v_doc_name text;
  v_revision text;
  v_code_status text;
  v_status text;
  v_remarks text;
  v_department text;
  v_last_update timestamptz;
  v_show_equip boolean;
  v_document_url text;
  v_code_stat text;
  v_doc_stat text;
  v_tag text;
  v_equipment_id uuid;
  v_existing_id uuid;
  v_upload timestamptz;
  out_records jsonb := '[]'::jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('records', '[]'::jsonb, 'count', 0);
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    v_project_id := (r->>'project_id')::uuid;
    v_firm_id := (r->>'firm_id')::uuid;
    v_updated_by := NULLIF(r->>'updated_by', '')::uuid;
    v_sr_no := r->>'sr_no';
    v_equipment_tags := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'equipment_tag_numbers', '[]'::jsonb))),
      ARRAY[]::text[]
    );
    v_mfg := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'mfg_serial_numbers', '[]'::jsonb))),
      ARRAY[]::text[]
    );
    v_job := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'job_numbers', '[]'::jsonb))),
      ARRAY[]::text[]
    );
    v_client_doc := COALESCE(r->>'client_doc_no', '');
    v_internal_doc := COALESCE(r->>'internal_doc_no', '');
    v_doc_name := COALESCE(r->>'document_name', 'Document');
    v_revision := COALESCE(r->>'revision', 'Rev-00');
    v_code_status := COALESCE(r->>'code_status', 'Code 3');
    v_status := COALESCE(r->>'status', 'pending');
    v_remarks := NULLIF(r->>'remarks', '');
    v_department := NULLIF(r->>'department', '');
    v_last_update := COALESCE((r->>'last_update')::timestamptz, now());
    v_show_equip := CASE
      WHEN r ? 'show_in_equipment_doc_tab' THEN (r->>'show_in_equipment_doc_tab')::boolean
      ELSE TRUE
    END;
    v_document_url := NULLIF(r->>'document_url', '');

    INSERT INTO public.vdcr_records (
      project_id,
      firm_id,
      sr_no,
      equipment_tag_numbers,
      mfg_serial_numbers,
      job_numbers,
      client_doc_no,
      internal_doc_no,
      document_name,
      revision,
      code_status,
      status,
      remarks,
      department,
      updated_by,
      last_update,
      document_url,
      show_in_equipment_doc_tab
    ) VALUES (
      v_project_id,
      v_firm_id,
      v_sr_no,
      v_equipment_tags,
      v_mfg,
      v_job,
      v_client_doc,
      v_internal_doc,
      v_doc_name,
      v_revision,
      v_code_status,
      v_status,
      v_remarks,
      v_department,
      v_updated_by,
      v_last_update,
      v_document_url,
      v_show_equip
    )
    RETURNING id INTO v_id;

    out_records := out_records || jsonb_build_array(
      (SELECT to_jsonb(t) FROM (SELECT * FROM public.vdcr_records WHERE id = v_id) t)
    );

    -- Mirror syncVDCRToEquipment (api.ts): push to equipment_documents per tag / equipment
    IF v_show_equip IS DISTINCT FROM FALSE AND array_length(v_equipment_tags, 1) IS NOT NULL THEN
      v_upload := now();
      v_code_stat := v_code_status;
      v_doc_stat := v_status;
      FOREACH v_tag IN ARRAY v_equipment_tags
      LOOP
        IF v_tag IS NULL OR btrim(v_tag) = '' THEN
          CONTINUE;
        END IF;
        v_equipment_id := NULL;
        SELECT e.id INTO v_equipment_id
        FROM public.equipment e
        WHERE e.project_id = v_project_id
          AND e.tag_number = btrim(v_tag)
        LIMIT 1;
        IF v_equipment_id IS NULL THEN
          SELECT s.id INTO v_equipment_id
          FROM public.standalone_equipment s
          WHERE s.tag_number = btrim(v_tag)
          LIMIT 1;
        END IF;
        IF v_equipment_id IS NULL THEN
          CONTINUE;
        END IF;

        v_existing_id := NULL;
        SELECT ed.id INTO v_existing_id
        FROM public.equipment_documents ed
        WHERE ed.equipment_id = v_equipment_id
          AND ed.vdcr_record_id = v_id
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
          UPDATE public.equipment_documents
          SET
            document_name = v_doc_name,
            document_url = COALESCE(v_document_url, ''),
            upload_date = v_upload,
            uploaded_by = v_updated_by,
            vdcr_record_id = v_id,
            vdcr_code_status = v_code_stat,
            vdcr_document_status = v_doc_stat,
            updated_at = now()
          WHERE id = v_existing_id;
        ELSE
          INSERT INTO public.equipment_documents (
            equipment_id,
            document_name,
            document_url,
            document_type,
            uploaded_by,
            upload_date,
            vdcr_record_id,
            vdcr_code_status,
            vdcr_document_status
          ) VALUES (
            v_equipment_id,
            v_doc_name,
            COALESCE(v_document_url, ''),
            'VDCR Approved Document',
            v_updated_by,
            v_upload,
            v_id,
            v_code_stat,
            v_doc_stat
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'records', out_records,
    'count', jsonb_array_length(out_records)
  );
END;
$$;

COMMENT ON FUNCTION public.bulk_upload_vdcr_documentation(jsonb) IS
  'Documentation tab Excel bulk upload: inserts all vdcr_records and syncs equipment_documents in one transaction.';

GRANT EXECUTE ON FUNCTION public.bulk_upload_vdcr_documentation(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upload_vdcr_documentation(jsonb) TO service_role;
