/**
 * Normalizes the university logos for the site.
 *
 *   npm run logos                 shows what it would do
 *   npm run logos -- --write      writes public/universidades/
 *
 * The originals (in assets/universidades/, not committed) differ in format,
 * size, margins and background (white, transparent or dark). This:
 *
 * 1. Flattens onto white, so a logo looks the same in both themes and in cards
 *    exported with html-to-image (a black crest on transparent would vanish on
 *    dark). <UniversityLogo> draws them on a light chip accordingly.
 * 2. Trims the margin, so logos look the same size.
 * 3. Squares them to 256x256 with 16px of padding.
 * 4. Writes PNGs named after the lower-case `tag` in the `universities` table,
 *    which is how the site finds them: `/universidades/${tag.toLowerCase()}.png`.
 *
 * It also avoids production-only issues in the originals: a JPEG with a .png
 * extension, `.jfif` files Next does not serve with a known Content-Type, and
 * an upper-case file name that 404s on a case-sensitive file system.
 *
 * To add a university, copy its logo into assets/universidades/ and run this
 * again.
 */

import sharp from 'sharp'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const SOURCE_DIR = 'assets/universidades'
const OUTPUT_DIR = 'public/universidades'
const SIDE = 256
/** Padding inside the file, so the logo does not touch the chip's edge. */
const PADDING = 16
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

const write = process.argv.includes('--write')

/**
 * The 13 `tag` values of the `universities` table, lower case. Hardcoded so the
 * script runs without credentials, and fails loudly if a file matches no
 * university.
 */
const TAGS = new Set([
  'uade', 'uai', 'uap', 'unahur', 'unam', 'uncuyo', 'undav',
  'uner', 'unlam', 'unlp', 'unlu', 'unpaz', 'unrn',
])

async function main() {
  const files = readdirSync(SOURCE_DIR).filter((f) => statSync(join(SOURCE_DIR, f)).isFile())

  const tags = files.map((f) => basename(f, extname(f)).toLowerCase())
  const extra = tags.filter((t) => !TAGS.has(t))
  const missing = [...TAGS].filter((t) => !tags.includes(t))
  if (extra.length) throw new Error(`Do not match any university: ${extra.join(', ')}`)
  if (missing.length) throw new Error(`Missing logos for: ${missing.join(', ')}`)

  if (write) mkdirSync(OUTPUT_DIR, { recursive: true })

  for (const file of files) {
    const tag = basename(file, extname(file)).toLowerCase()
    const input = join(SOURCE_DIR, file)
    const output = join(OUTPUT_DIR, `${tag}.png`)
    const before = await sharp(input).metadata()

    const flattened = await sharp(input).flatten({ background: WHITE }).toBuffer()

    // Trim against white, since the previous step flattened onto white. Logos
    // with a full dark background have no white border and are left as they are.
    let trimmed: Buffer
    try {
      trimmed = await sharp(flattened).trim({ background: WHITE, threshold: 12 }).toBuffer()
    } catch {
      // trim() throws on single-color images; nothing to trim then.
      trimmed = flattened
    }

    const buffer = await sharp(trimmed)
      .resize(SIDE - PADDING * 2, SIDE - PADDING * 2, { fit: 'contain', background: WHITE })
      .extend({ top: PADDING, bottom: PADDING, left: PADDING, right: PADDING, background: WHITE })
      // 256-color palette: flat logos, much smaller files, no visible change.
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer()

    const after = await sharp(buffer).metadata()
    const kb = (n: number) => `${(n / 1024).toFixed(0)}kB`
    console.log(
      `${file.padEnd(13)} ${String(before.format).padEnd(4)} ${before.width}x${before.height}` +
        ` ${kb(statSync(input).size)}`.padEnd(9) +
        ` ->  ${tag}.png  ${after.width}x${after.height} ${kb(buffer.length)}`,
    )

    // Write the buffer as is: sharp().toFile() would re-encode it and drop the
    // palette.
    if (write) writeFileSync(output, buffer)
  }

  console.log(`\n${files.length} logos ${write ? `written to ${OUTPUT_DIR}/` : 'ready'}.`)
  if (!write) console.log('To generate them: npm run logos -- --write')
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
