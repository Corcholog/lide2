/**
 * Crops the Instagram pieces' background from the hero artwork
 * (public/lide2-poster.jpg).
 *
 *   npm run poster:bg
 *
 * Generated once and committed, like the Open Graph image. The hero file is
 * 4096 x 2405 and about a megabyte, and exports inline the background as base64
 * in every piece, so a smaller crop is used instead. It is 1080 x 1920, the
 * taller format; the 1350 post uses it anchored at the top.
 */
import sharp from 'sharp'

const SOURCE = 'public/lide2-hero.jpg'
const OUTPUT = 'public/lide2-poster.jpg'

const WIDTH = 1080
const HEIGHT = 1920

/**
 * Horizontal center of the crop, as a fraction of the width. 52%, like the hero:
 * the central figure of the artwork.
 */
const FOCUS_X = 0.52

async function main(): Promise<void> {
  const image = sharp(SOURCE)
  const { width, height } = await image.metadata()

  if (!width || !height) throw new Error(`Could not read the size of ${SOURCE}`)

  const cropWidth = Math.round(height * (WIDTH / HEIGHT))
  const centred = Math.round(width * FOCUS_X - cropWidth / 2)
  const left = Math.min(Math.max(centred, 0), width - cropWidth)

  const info = await image
    .extract({ left, top: 0, width: cropWidth, height })
    .resize(WIDTH, HEIGHT)
    // mozjpeg: smaller file at the same quality, and it is embedded in every
    // exported piece.
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(OUTPUT)

  console.log(
    `${OUTPUT} · ${info.width}x${info.height} · ${Math.round(info.size / 1024)} KB ` +
      `(cut ${cropWidth}x${height} from x=${left})`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
