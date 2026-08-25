-- ===========================================================================
-- Bucket de replays.
--
-- Privado. Los .rofl reales pesan 11-17 MB, muy por encima del limite de 4.5 MB
-- que Vercel impone al cuerpo de un request, asi que el browser sube directo al
-- storage con una signed upload URL que emite el servidor, y la descarga sale
-- por signed URL tambien.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('replays', 'replays', false, 52428800)  -- 50 MB, el techo del plan free
on conflict (id) do nothing;

-- Lectura para usuarios autenticados. No hay politica de insert a proposito:
-- las subidas solo son posibles con un token de signed upload URL, que se emite
-- server-side despues de verificar la sesion.
create policy "replays lectura autenticada"
  on storage.objects for select to authenticated
  using (bucket_id = 'replays');
