CREATE OR REPLACE FUNCTION public.qa_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('qa.admin_delete', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'QA records are permanent';
  END IF;
  IF TG_TABLE_NAME = 'qa_events' THEN RAISE EXCEPTION 'QA history can never change'; END IF;
  IF TG_TABLE_NAME = 'qa_reports' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.reporter_id IS DISTINCT FROM OLD.reporter_id OR NEW.ref_no IS DISTINCT FROM OLD.ref_no
       OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.page_path IS DISTINCT FROM OLD.page_path
       OR NEW.browser IS DISTINCT FROM OLD.browser OR NEW.os IS DISTINCT FROM OLD.os OR NEW.viewport IS DISTINCT FROM OLD.viewport
       OR NEW.app_version IS DISTINCT FROM OLD.app_version THEN
      RAISE EXCEPTION 'Who reported this, and from where, can never change';
    END IF;
    IF NEW.duplicate_of IS NOT NULL AND NEW.duplicate_of IS DISTINCT FROM OLD.duplicate_of THEN
      IF EXISTS (SELECT 1 FROM public.qa_reports WHERE id = NEW.duplicate_of AND duplicate_of IS NOT NULL) THEN
        RAISE EXCEPTION 'Mark it a duplicate of the original report, not of another duplicate';
      END IF;
      IF EXISTS (SELECT 1 FROM public.qa_reports WHERE duplicate_of = NEW.id) THEN
        RAISE EXCEPTION 'Other reports are duplicates of this one; it can''t become a duplicate itself';
      END IF;
    END IF;
    NEW.updated_at := now();
  END IF;
  IF TG_TABLE_NAME = 'qa_attachments' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.report_id IS DISTINCT FROM OLD.report_id OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.mime IS DISTINCT FROM OLD.mime OR NEW.kind IS DISTINCT FROM OLD.kind OR (OLD.uploaded AND NOT NEW.uploaded) THEN
      RAISE EXCEPTION 'An attachment record can never change';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'qa_comments' THEN RAISE EXCEPTION 'Comments can''t be edited'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.qa_admin_delete_report(_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE paths text[];
BEGIN
  SELECT coalesce(array_agg(storage_path), '{}') INTO paths FROM public.qa_attachments WHERE report_id = _id;
  UPDATE public.qa_reports SET duplicate_of = NULL WHERE duplicate_of = _id;
  PERFORM set_config('qa.admin_delete', 'on', true);
  DELETE FROM public.qa_events WHERE report_id = _id;
  DELETE FROM public.qa_comments WHERE report_id = _id;
  DELETE FROM public.qa_attachments WHERE report_id = _id;
  DELETE FROM public.qa_reports WHERE id = _id;
  PERFORM set_config('qa.admin_delete', 'off', true);
  RETURN paths;
END; $$;
REVOKE ALL ON FUNCTION public.qa_admin_delete_report(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_admin_delete_report(uuid) TO service_role;