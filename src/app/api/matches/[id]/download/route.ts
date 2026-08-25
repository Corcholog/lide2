import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { getStorage } from '@/lib/storage'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * Descarga del .rofl original (la prueba del resultado).
 *
 * El bucket es privado: se genera una signed URL de corta duración y se redirige.
 * Si la partida tiene varios archivos (el de cada equipo), se sirve el primero.
 */
export async function GET(_request: Request, { params }: RouteContext<'/api/matches/[id]/download'>) {
  const user = await requireApiUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params

  const { data, error } = await createAdminClient()
    .from('match_files')
    .select('storage_path,file_name')
    .eq('match_id', id)
    .order('uploaded_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'No hay archivo para esta partida' }, { status: 404 })
  }

  const storage = await getStorage()
  const url = await storage.createDownloadUrl(data.storage_path as string)

  return NextResponse.redirect(url)
}
