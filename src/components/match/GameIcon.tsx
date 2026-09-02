/* eslint-disable @next/next/no-img-element */

/**
 * Riot icons served through /api/ddragon.
 *
 * It uses <img> and not next/image on purpose: they are hundreds of small
 * fixed-size sprites, optimization adds nothing, and flat markup is what
 * html-to-image needs to export the Instagram card.
 */
export function GameIcon({
  src,
  alt,
  size = 32,
  className = '',
}: {
  src: string | null
  alt: string
  size?: number
  className?: string
}) {
  if (!src) {
    return (
      <span
        style={{ width: size, height: size }}
        className={`inline-block shrink-0 rounded bg-raised ${className}`}
        aria-hidden
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size }}
      className={`shrink-0 rounded bg-raised ${className}`}
    />
  )
}
