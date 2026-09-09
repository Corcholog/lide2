import Image from 'next/image'
import { multisearchUrl, searchableCount, summonerUrl, type OpggAccount } from '@/lib/opgg'

/**
 * The op.gg mark, linking a team's whole roster to one multisearch.
 *
 * The rank, the champion pool and whether somebody is smurfing are the first
 * things anybody checking a team wants, and none of it is in the replays. The
 * site cannot show it, so it links to where it lives.
 *
 * WHAT THE COUNT IS FOR. Accounts with no `#TAG` cannot be resolved by op.gg
 * and stay out of the link - see `multisearchUrl`. When that happens the mark
 * would quietly search four of five, so the missing ones are said out loud.
 * When every account made it, the number adds nothing and is left in the
 * tooltip.
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
      {/* Sólo cuando el link quedó incompleto. Un "5 de 5" no dice nada; un
          "3 de 5" avisa que a dos les falta el #TAG y que op.gg no las puede
          buscar. */}
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
 * The same doorway, for one account: a player's own op.gg page.
 *
 * It is the same mark on purpose. A player's page and a team's answer the same
 * thing one level apart - the rank, the pool, the ranked games, none of which
 * is in a replay - so somebody who learned what the blue square does on one of
 * them should not have to learn it again on the other.
 *
 * Nothing is drawn for an account without its `#TAG`: op.gg cannot resolve one,
 * and a mark that leads to a search for somebody who is not there is worse than
 * no mark. See `summonerUrl`.
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
 * The mark itself, which both links draw.
 *
 * WHY THIS ONE IS A PNG AND THE OTHER MARKS ARE NOT. `components/icons/Brands`
 * draws Twitch and Discord by hand on `currentColor`, on purpose: those sit
 * inside buttons that turn `accent` on hover, and a mark pinned to its brand
 * colour would stay behind and read as though it were not part of the button.
 * This one is the opposite case. It is not chrome, it is a doorway out of the
 * site, and being recognisably op.gg blue is the whole reason somebody spots it
 * in a header full of grey text. So it keeps the brand's own file
 * (public/icons/opgg.png, an opaque blue square that needs no theme handling)
 * rather than being redrawn to match the palette.
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
        /* Cuadrado y sin redondear: el sitio tiene todos los --radius-* en 0.
           No lleva borde como los escudos de universidad porque el azul es
           opaco y fuerte, y no se funde con ninguno de los dos temas. 28px
           para que pese lo mismo que el boton que tiene al lado. */
        className="size-7"
      />
    </a>
  )
}
