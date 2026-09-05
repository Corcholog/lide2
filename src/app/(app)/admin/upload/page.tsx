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
          The stage and the round used to be typed in here by hand. Not any
          more: the fixture is published and loaded, so instead of typing
          "Fecha 2" you pick the matchup, which also says which teams played.
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
