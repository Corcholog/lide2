/* eslint-disable @next/next/no-img-element */

/**
 * Riot icons served through /api/ddragon. A plain <img> instead of next/image:
 * many small fixed-size icons gain nothing from optimization, and html-to-image
 * exports need plain markup.
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
