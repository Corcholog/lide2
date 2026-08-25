import { open } from 'node:fs/promises'

/**
 * Fuente de bytes de un .rofl.
 *
 * Toda la metadata que necesitamos vive en el header (288 bytes) y en un bloque
 * al final del archivo, así que nunca hace falta traer los 10-30 MB completos.
 * Esta interfaz existe para que el mismo parser sirva para un archivo local
 * (script/tests) y para un objeto remoto leído con requests Range.
 */
export interface RoflSource {
  /** Tamaño total del archivo en bytes. */
  readonly size: number
  /** Devuelve exactamente `length` bytes a partir de `start`. */
  read(start: number, length: number): Promise<Buffer>
  close?(): Promise<void>
}

export function bufferSource(buf: Buffer): RoflSource {
  return {
    size: buf.length,
    async read(start, length) {
      return buf.subarray(start, start + length)
    },
  }
}

/** Lee de disco sin cargar el archivo entero en memoria. Para el CLI y los tests. */
export async function fileSource(path: string): Promise<RoflSource> {
  const handle = await open(path, 'r')
  const { size } = await handle.stat()

  return {
    size,
    async read(start, length) {
      const buf = Buffer.allocUnsafe(length)
      const { bytesRead } = await handle.read(buf, 0, length, start)
      return buf.subarray(0, bytesRead)
    },
    async close() {
      await handle.close()
    },
  }
}

/**
 * Lee un objeto remoto con requests `Range`. Si el server ignora el header y
 * responde 200 con el cuerpo completo, recorta el tramo pedido igual.
 */
export function rangeUrlSource(url: string, size: number): RoflSource {
  return {
    size,
    async read(start, length) {
      const end = start + length - 1
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })

      if (!res.ok) {
        throw new Error(`Range request falló (${res.status} ${res.statusText})`)
      }

      const body = Buffer.from(await res.arrayBuffer())
      return res.status === 206 ? body : body.subarray(start, start + length)
    },
  }
}
