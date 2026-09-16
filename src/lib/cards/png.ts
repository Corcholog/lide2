import { toPng } from 'html-to-image'

/**
 * Exports a DOM node as a PNG download, for the match card and the stat
 * posters. Client only.
 *
 * Waits for `document.fonts.ready` first: html-to-image draws whatever fonts
 * are loaded, and the title would otherwise silently fall back to another
 * typeface.
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
    // The node is already drawn at its final size (1080 wide); following the
    // screen's pixel ratio would make the output size vary between devices.
    pixelRatio: 1,
    cacheBust: true,
  })

  const link = document.createElement('a')
  link.download = fileName
  link.href = dataUrl
  link.click()
}
