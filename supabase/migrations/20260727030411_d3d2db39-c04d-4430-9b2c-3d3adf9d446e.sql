-- Remove broad SELECT policies on public buckets to prevent listing/enumeration.
-- Files remain accessible via public URL (bucket is public), but the storage API cannot list them.
DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for company logos" ON storage.objects;

-- Attachments: allow uploader to update/delete their own files.
CREATE POLICY "Uploaders can update their own attachments"
ON public.attachments
FOR UPDATE
TO authenticated
USING (auth.uid() = uploaded_by)
WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Uploaders can delete their own attachments"
ON public.attachments
FOR DELETE
TO authenticated
USING (auth.uid() = uploaded_by);