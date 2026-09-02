import { open } from 'node:fs/promises'

/**
 * A source of .rofl bytes.
 *
 * All the metadata needed lives in the header (288 bytes) and in a block at the
 * end of the file, so the full 10-30 MB never has to be fetched. This interface
 * exists so the same parser serves both a local file (script and tests) and a
 * remote object read with Range requests.
 */
export interface RoflSource {
  /** Total file size in bytes. */
  readonly size: number
  /** Returns exactly `length` bytes starting at `start`. */
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

/** Reads from disk without loading the whole file into memory. For the CLI and the tests. */
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
 * Reads a remote object with `Range` requests. If the server ignores the header
 * and answers 200 with the whole body, it slices the requested stretch anyway.
 */
export function rangeUrlSource(url: string, size: number): RoflSource {
  return {
    size,
    async read(start, length) {
      const end = start + length - 1
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })

      if (!res.ok) {
        throw new Error(`Range request failed (${res.status} ${res.statusText})`)
      }

      const body = Buffer.from(await res.arrayBuffer())
      return res.status === 206 ? body : body.subarray(start, start + length)
    },
  }
}
