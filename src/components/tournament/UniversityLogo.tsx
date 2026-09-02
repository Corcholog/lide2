import Image from 'next/image'

/**
 * The university crests.
 *
 * The file comes from the `tag`: /universidades/<lower-case tag>.png. There is
 * no need to consult `universities.logo_url` to draw them, and that matters
 * because in the standings table and in the fixture the only thing that travels
 * is the tags (`team_university_tags`), not the ids.
 *
 * The 13 files are normalized by scripts/normalize-logos.ts: all 256x256, each
 * with its own margin and with the white background baked into the PNG. That
 * white background is deliberate and it is what makes this component so short:
 * the originals came with white, transparent and dark blue backgrounds
 * depending on the university, so over the dark theme some looked like a white
 * box and others - the black-ink crests on transparent, like UNLP's - simply
 * could not be seen. With the white inside the file, all thirteen look the same
 * in both themes and in the cards exported to PNG.
 *
 * The border is not decorative: over a light background, a white-backed logo
 * would blend into the page and float there shapeless.
 */

/** Squares, because the site has every --radius-* at 0. */
const SIZES = {
  xs: 'size-4', //  16px  each signup, on the team page
  sm: 'size-6', //  24px  the fixture, which is the tightest grid
  md: 'size-8', //  32px  the standings table
  lg: 'size-9', //  36px  the strip on the home page
  card: 'size-12', // 48px  the card column on /equipos
  xl: 'size-16', // 64px  the team page header
  // The only one that changes with width. The fixture has room for the crests
  // of a mixed team's three universities, but only in the two-column layout:
  // on a phone, with one, three would eat the name. See FixtureTeam.
  fixture: 'size-7 sm:size-10', // 28 -> 40px
} as const

export type LogoSize = keyof typeof SIZES

export function universityLogoPath(tag: string): string {
  return `/universidades/${tag.toLowerCase()}.png`
}

export function UniversityLogo({
  tag,
  size = 'sm',
  className = '',
}: {
  tag: string
  size?: LogoSize
  className?: string
}) {
  return (
    <Image
      src={universityLogoPath(tag)}
      alt={tag}
      title={tag}
      width={256}
      height={256}
      className={`${SIZES[size]} shrink-0 border border-line object-contain ${className}`}
    />
  )
}

/**
 * A team's crests. Most have just one; four LIDE 2 teams were built out of
 * loose signups and represent up to three universities at once (Team 15 is
 * UNER + UADE + UNLP).
 *
 * They sit side by side and not stacked: they are white squares, so stacking
 * them would not read as a fan of crests but as one white block with borders
 * through the middle.
 *
 * `max` cuts the list where there is no room - a table row fits one - and adds
 * "+2". Since the order comes from `team_university_tags` with the main one
 * first, whoever survives the cut is always the one that represents the team
 * most, not just anybody.
 */
export function UniversityLogos({
  tags,
  size = 'sm',
  max = 3,
  className = '',
}: {
  tags: string[] | null | undefined
  size?: LogoSize
  max?: number
  className?: string
}) {
  const all = tags ?? []
  if (all.length === 0) return null

  const visible = all.slice(0, max)
  const hidden = all.length - visible.length

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`} title={all.join(' · ')}>
      {visible.map((tag) => (
        <UniversityLogo key={tag} tag={tag} size={size} />
      ))}
      {hidden > 0 && <span className="text-[10px] leading-none text-faint">+{hidden}</span>}
    </span>
  )
}
