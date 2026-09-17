import Image from 'next/image'
import { multisearchUrl, searchableCount, summonerUrl, type OpggAccount } from '@/lib/opgg'

/**
 * The op.gg link for a team's whole roster (one multisearch).
 *
 * Accounts without a `#TAG` cannot be searched (see `multisearchUrl`), so when
 * some are missing the count is shown next to the mark; otherwise it is only in
 * the tooltip.
 */
export function OpggLink({
  accounts,
  className = '',
}: {
  accounts: OpggAccount[]
  className?: string
}) {
  const url = multisearchUrl(accounts)
  if (!url) return null

  const searchable = searchableCount(accounts)
  const missing = accounts.length - searchable
  const what = searchable === 1 ? 'la cuenta' : `las ${searchable} cuentas`

  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <Mark href={url} label={`Ver ${what} del plantel en op.gg`} />
      {/* Only when some accounts are missing: "3 de 5" says two have no #TAG. */}
      {missing > 0 && (
        <span
          className="text-xs text-dim"
          title="Las cuentas sin #TAG no se pueden buscar en op.gg"
        >
          {searchable} de {accounts.length}
        </span>
      )}
    </span>
  )
}

/**
 * The op.gg link for one account, with the same mark as the team link. Nothing
 * is drawn for an account without a `#TAG` (see `summonerUrl`).
 */
export function OpggPlayerLink({
  account,
  className = '',
}: {
  account: OpggAccount
  className?: string
}) {
  const url = summonerUrl(account)
  if (!url) return null

  return (
    <span className={`inline-flex ${className}`}>
      <Mark href={url} label="Ver esta cuenta en op.gg" />
    </span>
  )
}

/**
 * The op.gg mark used by both links.
 *
 * Unlike the Twitch and Discord marks (`components/icons/Brands`), drawn with
 * `currentColor` so they follow button hovers, this uses op.gg's own blue file
 * (public/icons/opgg.png): it is an external link and its brand color is what
 * makes it recognizable. It is opaque, so it works on both themes.
 */
function Mark({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      className="shrink-0 self-center opacity-80 transition-opacity hover:opacity-100"
    >
      <Image
        src="/icons/opgg.png"
        alt=""
        width={512}
        height={512}
        /* Square like the rest of the site; no border needed since the blue is
           opaque. 28px to match the adjacent button. */
        className="size-7"
      />
    </a>
  )
}
