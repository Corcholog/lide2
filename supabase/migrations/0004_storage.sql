-- ===========================================================================
-- Replays bucket.
--
-- Private. Real .rofl files are 11-17 MB, above Vercel's 4.5 MB request body
-- limit, so the browser uploads directly to storage with a signed upload URL
-- issued by the server, and downloads also use signed URLs.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('replays', 'replays', false, 52428800)  -- 50 MB, the free plan limit
on conflict (id) do nothing;

-- Read access for authenticated users. No insert policy on purpose: uploads
-- require a signed upload URL token, issued server-side after checking the
-- session.
create policy "replays lectura autenticada"
  on storage.objects for select to authenticated
  using (bucket_id = 'replays');
