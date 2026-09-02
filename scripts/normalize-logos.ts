/**
 * Leaves the 13 university logos ready to use on the site.
 *
 *   npx tsx scripts/normalize-logos.ts          shows what it would do
 *   npx tsx scripts/normalize-logos.ts --write  generates public/universidades
 *
 * The originals arrive as each university sends them and look nothing like one
 * another: there is JPEG, PNG with transparency and PNG with a palette; they go
 * from 280px to 1146px; one is square and another landscape; and above all the
 * backgrounds point three different ways - white, transparent and dark blue.
 * Dropped into a table as they are, they look different sizes, and in the dark
 * theme the black-ink ones on transparent simply vanish.
 *
 * WHAT IT DOES AND WHY
 *
 * 1. Flattens onto white. It is the underlying decision and it deserves an
 *    explanation, because it throws the transparency away on purpose. The site
 *    has a light and a dark theme, and it also exports cards to PNG with
 *    html-to-image: if the logo depended on the background, a black crest on
 *    transparent would come out invisible in an image that then gets shared,
 *    with nobody finding out until they see it published. With the white inside
 *    the file, the logo looks the same in both themes and in the exported card.
 *    The trade-off is that they always have to be drawn on a light chip, which
 *    is exactly what <UniversityLogo> does.
 *
 * 2. Trims the margin. Each one carried a different amount of air (the opaque
 *    ones run from 19% to 100% of the image), which is what made some look
 *    large and others lost in the middle of the same box.
 *
 * 3. Squares them and takes them to 256x256, with 16px of air of their own.
 *    That way the component can trust they all have the same shape and none has
 *    to be corrected by hand.
 *
 * 4. One format and a lower-case name, equal to the `tag` in the `universities`
 *    table. The name is what ties the file to the database, so it has to be
 *    derivable: `/universidades/${tag.toLowerCase()}.png`.
 *
 * Along the way it fixes three traps that only show up in production: `uai.png`
 * is really a JPEG with its extension changed, both `.jfif` files use an
 * extension Next does not know (it does not appear once in its dist, so the
 * Content-Type is left to chance), and `UNLP.png` was the only upper-case one,
 * which works on Windows and is a 404 on Vercel's Linux.
 *
 * The originals stay untouched in assets/universidades/. If a new university
 * joins tomorrow, it gets copied there and this is run again.
 */

import sharp from 'sharp'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const SOURCE_DIR = 'assets/universidades'
const OUTPUT_DIR = 'public/universidades'
const SIDE = 256
/** The file's own air, so the logo does not touch the chip's edge. */
const PADDING = 16
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

const write = process.argv.includes('--write')

/**
 * The 13 `tag` values from the `universities` table, in lower case. They are
 * written here and not read from the database on purpose: the script has to run
 * without credentials, and if some day a file stops corresponding to a
 * university, it is better for it to fail loudly than to generate a PNG nobody
 * uses.
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

    // The trim runs against white because the previous step left everything
    // white. The two logos that carry a dark background edge to edge have no
    // white border at all, so this step does not touch them, which is right.
    let trimmed: Buffer
    try {
      trimmed = await sharp(flattened).trim({ background: WHITE, threshold: 12 }).toBuffer()
    } catch {
      // trim() throws when the image is a single colour; in that case there is
      // nothing to trim and it works as it is.
      trimmed = flattened
    }

    const buffer = await sharp(trimmed)
      .resize(SIDE - PADDING * 2, SIDE - PADDING * 2, { fit: 'contain', background: WHITE })
      .extend({ top: PADDING, bottom: PADDING, left: PADDING, right: PADDING, background: WHITE })
      // Palette: they are flat-colour logos, so 256 colours are enough and the
      // total of all 13 drops from 558kB to 206kB with no visible difference.
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer()

    const after = await sharp(buffer).metadata()
    const kb = (n: number) => `${(n / 1024).toFixed(0)}kB`
    console.log(
      `${file.padEnd(13)} ${String(before.format).padEnd(4)} ${before.width}x${before.height}` +
        ` ${kb(statSync(input).size)}`.padEnd(9) +
        ` ->  ${tag}.png  ${after.width}x${after.height} ${kb(buffer.length)}`,
    )

    // The buffer is written as it is. Passing it through sharp().toFile() would
    // decode it and re-encode it with the default options, throwing away the
    // palette that was just chosen.
    if (write) writeFileSync(output, buffer)
  }

  console.log(`\n${files.length} logos ${write ? `written to ${OUTPUT_DIR}/` : 'ready'}.`)
  if (!write) console.log('To generate them: npx tsx scripts/normalize-logos.ts --write')
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
