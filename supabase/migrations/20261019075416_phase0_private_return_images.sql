-- Coordinated with the private-path frontend. Prepared only; not applied remotely.
BEGIN;
SET LOCAL lock_timeout='5s';
UPDATE storage.buckets SET public=false, file_size_limit=5242880,
 allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'] WHERE id='return-request-images';
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='return-request-images') THEN RAISE EXCEPTION 'Return bucket missing'; END IF; END $$;
DROP POLICY IF EXISTS "Return request images are viewable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload return request images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete return request images" ON storage.objects;
CREATE POLICY "Return images owner or admin read" ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='return-request-images' AND ((storage.foldername(name))[1]=(select auth.uid())::text
 OR public.has_role((select auth.uid()),'admin'::public.app_role)));
CREATE POLICY "Return images owned upload" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='return-request-images' AND name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$'));
CREATE POLICY "Return images orphan cleanup or admin" ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='return-request-images' AND (public.has_role((select auth.uid()),'admin'::public.app_role)
 OR ((storage.foldername(name))[1]=(select auth.uid())::text AND NOT EXISTS(
  SELECT 1 FROM public.return_requests r WHERE name=ANY(r.image_urls) OR EXISTS(
   SELECT 1 FROM unnest(r.image_urls) u WHERE u LIKE '%/return-request-images/'||name)))));
-- Restrictive guards prevent unrelated/broad permissive policies granting this bucket.
CREATE POLICY "Return image isolation" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING(bucket_id<>'return-request-images' OR ((select auth.uid()) IS NOT NULL AND
  ((storage.foldername(name))[1]=(select auth.uid())::text OR public.has_role((select auth.uid()),'admin'::public.app_role))))
 WITH CHECK(bucket_id<>'return-request-images' OR ((select auth.uid()) IS NOT NULL AND
  name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')));
CREATE POLICY "Return images linked delete guard" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'return-request-images' OR public.has_role((select auth.uid()),'admin'::public.app_role)
 OR NOT EXISTS(SELECT 1 FROM public.return_requests r WHERE name=ANY(r.image_urls) OR EXISTS(
 SELECT 1 FROM unnest(r.image_urls) u WHERE u LIKE '%/return-request-images/'||name)));
CREATE POLICY "Return images no client overwrite" ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
 USING(bucket_id<>'return-request-images') WITH CHECK(bucket_id<>'return-request-images');
CREATE POLICY "Return request insert boundaries" ON public.return_requests AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(user_id=(select auth.uid()) AND status='pending' AND admin_note IS NULL
 AND length(description) BETWEEN 1 AND 5000 AND cardinality(image_urls)<=5
 AND NOT EXISTS(SELECT 1 FROM unnest(image_urls) p WHERE p !~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$'))
 AND EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.user_id=(select auth.uid())));
CREATE POLICY "Return images anonymous denial" ON storage.objects AS RESTRICTIVE FOR ALL TO anon
 USING(bucket_id<>'return-request-images') WITH CHECK(bucket_id<>'return-request-images');
COMMIT;
