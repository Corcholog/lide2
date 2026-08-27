import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { UploadDropzone } from '@/components/upload/UploadDropzone'

export default async function UploadPage() {
  await requireUser()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-tight">Subir replays</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          El archivo se sube directo al storage y el servidor le lee sólo la metadata: de un .rofl de
          15 MB se leen ~118 KB. Si un archivo falla, el resto del lote sigue.
        </p>
        {/*
          Antes acá se escribían a mano la etapa y la ronda. Ya no: el fixture
          está publicado y cargado, así que en vez de escribir "Fecha 2" se
          elige el cruce, que además dice qué equipos jugaron.
        */}
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Después hay que decir de qué cruce es cada una, en{' '}
          <Link href="/admin/asignar" className="text-accent underline-offset-2 hover:underline">
            Asignar partidas
          </Link>
          . Hasta entonces la partida no tiene equipos ni fecha y no aparece en la tabla ni en las
          estadísticas.
        </p>
      </div>

      <UploadDropzone />
    </div>
  )
}
