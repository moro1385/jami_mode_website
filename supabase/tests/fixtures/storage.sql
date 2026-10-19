-- Synthetic Storage metadata and RLS only; NOT the Supabase Storage HTTP service.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean NOT NULL DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text NOT NULL,owner_id text,UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name,'/') $$;
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
-- Hostile unrelated policy: restrictive guards must still isolate return objects.
CREATE POLICY fixture_broad_storage ON storage.objects FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
