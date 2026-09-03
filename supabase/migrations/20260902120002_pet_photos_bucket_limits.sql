-- Security: cap what the pet-photos bucket will accept.
--
-- 20260603130000_pets_generalization.sql created the bucket with no size or
-- type limit, and the owner insert policy only checks that the first path
-- segment is the caller's uid. A signed-in client could therefore upload an
-- unbounded number of arbitrarily large files of any content type into their
-- own folder, and the app then serves those objects back through service-role
-- signed URLs.
--
-- Storage enforces both fields server-side, so this holds even if a caller
-- skips the app and uploads straight to the storage API. The app-side upload
-- validation is a fast, friendlier duplicate of this floor, not a replacement.
--
-- 5 MiB and the three raster formats cover the cropper output (image/jpeg) with
-- room for a straight-through PNG or WebP original.

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'pet-photos';
