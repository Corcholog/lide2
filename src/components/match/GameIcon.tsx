/* eslint-disable @next/next/no-img-element */

/**
 * Íconos de Riot servidos por /api/ddragon.
 *
 * Va con <img> y no con next/image a propósito: son cientos de sprites chicos y
 * de tamaño fijo, la optimización no aporta nada, y el markup plano es lo que
 * necesita html-to-image para exportar la card de Instagram.
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
        className={`inline-block shrink-0 rounded bg-ink-800 ${className}`}
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
      className={`shrink-0 rounded bg-ink-800 ${className}`}
    />
  )
}
