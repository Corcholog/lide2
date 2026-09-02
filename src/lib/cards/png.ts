import { toPng } from 'html-to-image'

/**
 * Turning a node into a PNG and handing it to the browser.
 *
 * The two pieces the site exports - the match card of /partidas/[id]/card and
 * the stat posters of /admin/cards - used to carry a copy of this each, with
 * the same four options and the same synthetic-anchor trick. They had already
 * drifted: only the poster waited for the fonts, so the match card could come
 * out in the fallback typeface depending on the moment the button was pressed.
 *
 * `document.fonts.ready` before capturing is not redundant: html-to-image draws
 * whatever the browser has at that moment, and if Archivo Black has not
 * finished loading, the title comes out in the fallback. It is the quietest
 * failure this has, because the image is generated all the same.
 *
 * Client only: it touches `document`.
 */
export async function downloadNodeAsPng(
  node: HTMLElement,
  size: { width: number; height: number },
  fileName: string,
): Promise<void> {
  await document.fonts.ready

  const dataUrl = await toPng(node, {
    width: size.width,
    height: size.height,
    // pixelRatio 1 because the node is already drawn at its final size (1080
    // wide): letting it follow the screen would export a card twice as big on a
    // retina display and a different one on every machine.
    pixelRatio: 1,
    cacheBust: true,
  })

  const link = document.createElement('a')
  link.download = fileName
  link.href = dataUrl
  link.click()
}
