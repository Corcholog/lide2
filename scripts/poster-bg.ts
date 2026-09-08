/**
 * Cuts the background of the Instagram pieces out of the hero's artwork.
 *
 *   npm run poster:bg
 *
 * Generated once and committed as public/lide2-poster.jpg, the same deal as the
 * opengraph image: it depends on nothing, so generating it per request would be
 * paying at runtime for something that never changes, and this way the crop can
 * be looked at before it goes up.
 *
 * WHY NOT USE THE HERO'S FILE DIRECTLY. It is 4096 x 2405 and a megabyte, and
 * the export inlines the background as base64 inside the piece: a matchday's
 * batch is eight captures, so that is eight copies of it going through the
 * canvas. This is a fifth of the weight and already the right pixels.
 *
 * 1080 x 1920 IS THE TALLER OF THE TWO FORMATS. The 1350 post gets the same
 * file cropped by `object-cover`, which is why the crop is anchored at the top:
 * what the post loses is the bottom, and the artwork's faces are up.
 */
import sharp from 'sharp'

const SOURCE = 'public/lide2-hero.jpg'
const OUTPUT = 'public/lide2-poster.jpg'

const WIDTH = 1080
const HEIGHT = 1920

/**
 * Where the crop is centred, as a fraction of the width.
 *
 * The same 52% the hero reads the artwork by: it is where the figure in the
 * black cape stands, which is the piece everything else is arranged around. A
 * 9:16 window over a 16:9 painting keeps about a third of it, so which third is
 * the whole decision here.
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
    // mozjpeg for the same reason as everywhere else: a smaller file at the
    // same quality, and this one is embedded in every piece that gets exported.
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
