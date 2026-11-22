CREATE TABLE public.qa_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  recordings_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.qa_settings TO service_role;
ALTER TABLE public.qa_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.qa_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE public.qa_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  reporter_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('bug','performance','feature','general')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 140),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  expected text NOT NULL DEFAULT '' CHECK (char_length(expected) <= 2000),
  actual text NOT NULL DEFAULT '' CHECK (char_length(actual) <= 2000),
  steps text NOT NULL DEFAULT '' CHECK (char_length(steps) <= 4000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','investigating','fixed','ready_for_retest','verified')),
  severity text CHECK (severity IS NULL OR severity IN ('critical','high','medium','low')),
  assignee_id uuid,
  duplicate_of uuid REFERENCES public.qa_reports(id),
  page_path text NOT NULL DEFAULT '' CHECK (char_length(page_path) <= 300),
  app_version text NOT NULL DEFAULT '' CHECK (char_length(app_version) <= 80),
  browser text NOT NULL DEFAULT '' CHECK (char_length(browser) <= 80),
  os text NOT NULL DEFAULT '' CHECK (char_length(os) <= 80),
  viewport text NOT NULL DEFAULT '' CHECK (char_length(viewport) <= 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (duplicate_of IS NULL OR duplicate_of <> id)
);
CREATE INDEX qa_reports_reporter_idx ON public.qa_reports (reporter_id, created_at DESC);
CREATE INDEX qa_reports_status_idx ON public.qa_reports (status, created_at DESC);
CREATE INDEX qa_reports_dup_idx ON public.qa_reports (duplicate_of) WHERE duplicate_of IS NOT NULL;
GRANT SELECT ON public.qa_reports TO authenticated;
GRANT ALL ON public.qa_reports TO service_role;
ALTER TABLE public.qa_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Testers read their own reports" ON public.qa_reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid());

CREATE TABLE public.qa_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.qa_reports(id),
  kind text NOT NULL CHECK (kind IN ('screenshot','file','recording')),
  storage_path text NOT NULL UNIQUE CHECK (char_length(storage_path) <= 300),
  file_name text NOT NULL DEFAULT '' CHECK (char_length(file_name) <= 120),
  mime text NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','video/webm','video/mp4')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  redacted boolean NOT NULL DEFAULT false,
  uploaded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qa_attachments_report_idx ON public.qa_attachments (report_id);
GRANT SELECT ON public.qa_attachments TO authenticated;
GRANT ALL ON public.qa_attachments TO service_role;
ALTER TABLE public.qa_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Testers read attachments on their own reports" ON public.qa_attachments
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.qa_reports r WHERE r.id = report_id AND r.reporter_id = auth.uid()));

CREATE TABLE public.qa_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.qa_reports(id),
  author_id uuid NOT NULL,
  from_team boolean NOT NULL DEFAULT false,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qa_comments_report_idx ON public.qa_comments (report_id, created_at);
GRANT SELECT ON public.qa_comments TO authenticated;
GRANT ALL ON public.qa_comments TO service_role;
ALTER TABLE public.qa_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Testers read replies on their own reports" ON public.qa_comments
  FOR SELECT TO authenticated USING (internal = false AND EXISTS (SELECT 1 FROM public.qa_reports r WHERE r.id = report_id AND r.reporter_id = auth.uid()));

CREATE TABLE public.qa_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.qa_reports(id),
  actor_id uuid NOT NULL,
  field text NOT NULL CHECK (field IN ('status','severity','assignee','duplicate_of','retest')),
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qa_events_report_idx ON public.qa_events (report_id, created_at);
GRANT ALL ON public.qa_events TO service_role;
ALTER TABLE public.qa_events ENABLE ROW LEVEL SECURITY;

-- Reports, attachments, comments and history are permanent; history can never be edited.
CREATE OR REPLACE FUNCTION public.qa_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'QA records are permanent';
  END IF;
  IF TG_TABLE_NAME = 'qa_events' THEN
    RAISE EXCEPTION 'QA history can never change';
  END IF;
  IF TG_TABLE_NAME = 'qa_reports' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.reporter_id IS DISTINCT FROM OLD.reporter_id OR NEW.ref_no IS DISTINCT FROM OLD.ref_no
       OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.page_path IS DISTINCT FROM OLD.page_path
       OR NEW.browser IS DISTINCT FROM OLD.browser OR NEW.os IS DISTINCT FROM OLD.os OR NEW.viewport IS DISTINCT FROM OLD.viewport
       OR NEW.app_version IS DISTINCT FROM OLD.app_version THEN
      RAISE EXCEPTION 'Who reported this, and from where, can never change';
    END IF;
    -- One level of duplicates: a duplicate points at a root report that is not itself a duplicate.
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
  IF TG_TABLE_NAME = 'qa_comments' THEN
    RAISE EXCEPTION 'Comments can''t be edited';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER qa_reports_guard BEFORE UPDATE OR DELETE ON public.qa_reports FOR EACH ROW EXECUTE FUNCTION public.qa_guard();
CREATE TRIGGER qa_attachments_guard BEFORE UPDATE OR DELETE ON public.qa_attachments FOR EACH ROW EXECUTE FUNCTION public.qa_guard();
CREATE TRIGGER qa_comments_guard BEFORE UPDATE OR DELETE ON public.qa_comments FOR EACH ROW EXECUTE FUNCTION public.qa_guard();
CREATE TRIGGER qa_events_guard BEFORE UPDATE OR DELETE ON public.qa_events FOR EACH ROW EXECUTE FUNCTION public.qa_guard();

-- Private attachment files: a tester may read files in their own folder; uploads only through
-- server-issued signed upload links; admins view through server-made signed links. No updates or deletes.
CREATE POLICY "Testers read their own QA files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'qa-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
