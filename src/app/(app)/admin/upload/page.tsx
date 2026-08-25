import { requireUser } from '@/lib/auth'
import { UploadDropzone } from '@/components/upload/UploadDropzone'

export default async function UploadPage() {
  await requireUser()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subir replays</h1>
        <p className="mt-1 text-sm text-ink-400">
          El archivo se sube directo al storage y el servidor le lee sólo la metadata: de un .rofl de
          15 MB se leen ~118 KB. Si un archivo falla, el resto del lote sigue.
        </p>
      </div>

      <UploadDropzone />
    </div>
  )
}
