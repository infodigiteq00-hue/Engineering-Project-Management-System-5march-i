-- Add show_in_equipment_doc_tab to vdcr_records (default true: show in equipment doc tab)
ALTER TABLE public.vdcr_records
  ADD COLUMN IF NOT EXISTS show_in_equipment_doc_tab boolean DEFAULT true;

COMMENT ON COLUMN public.vdcr_records.show_in_equipment_doc_tab IS 'When true, this document is shown in the Docs tab of the respective equipment with code status and doc status.';

-- Add VDCR link and status columns to equipment_documents for display in equipment Docs tab
ALTER TABLE public.equipment_documents
  ADD COLUMN IF NOT EXISTS vdcr_record_id uuid REFERENCES public.vdcr_records(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS vdcr_code_status character varying,
  ADD COLUMN IF NOT EXISTS vdcr_document_status character varying;

COMMENT ON COLUMN public.equipment_documents.vdcr_record_id IS 'Links to VDCR record when this row was synced from documentation tab.';
COMMENT ON COLUMN public.equipment_documents.vdcr_code_status IS 'Code 1, Code 2, Code 3, or Code 4 for display in equipment doc tab.';
COMMENT ON COLUMN public.equipment_documents.vdcr_document_status IS 'pending, sent-for-approval, received-for-comment, approved, or rejected for display in equipment doc tab.';
