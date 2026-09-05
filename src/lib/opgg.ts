/**
 * The team's accounts, all five open at once on op.gg.
 *
 * op.gg's multisearch takes the whole roster in one URL and shows every
 * account's rank and recent games side by side. It is what anybody checking a
 * team actually wants - the ranks, the champion pool, whether somebody is
 * smurfing - and none of it is in the replays, so the site cannot show it and
 * there is no point pretending otherwise. A link is the honest version.
 *
 * THE SHAPE OF THE URL. It is copied from what op.gg's own multisearch box
 * produces, down to the double comma:
 *
 *   https://op.gg/es/lol/multisearch/las?summoners=falling+forever%231101%2C%2CUNDAV+Natko%23CARP
 *                                                 └ falling forever#1101 ,, UNDAV Natko#CARP
 *
 * Splitting that value on `,` gives an empty string between every pair, which
 * op.gg drops. A single comma very likely works too, but the pair is what its
 * own UI emits and it is the one shape known to resolve, so it is the one built
 * here.
 *
 * Spaces go as `+` and not `%20` for the same reason: it is what op.gg writes.
 * Both are legal in a query string and `encodeURIComponent` gives `%20`, so the
 * replacement is deliberate rather than left to chance.
 */

/**
 * The region in the path. LIDE is an Argentine university league, so every
 * account is on LAS; `lan` accounts would need their own link and there are
 * none. It is a constant and not a parameter because there is nothing to decide
 * per team.
 */
const REGION = 'las'

/** op.gg in Spanish: the site is in Spanish and so are the people reading it. */
const LOCALE = 'es'

/** What op.gg puts between two accounts: a comma, an empty slot, a comma. */
const SEPARATOR = '%2C%2C'

export interface OpggAccount {
  gameName: string | null
  tagLine: string | null
}

/**
 * Builds the multisearch link for a set of accounts, or null when there is
 * nothing worth linking to.
 *
 * Accounts without a `#TAG` are left out. Riot IDs stopped being unique without
 * the tag, so op.gg cannot resolve `Corcho` on its own: including it would not
 * add that person to the search, it would put a dud in it. Dropping them is not
 * silent - the caller knows how many went in, and the page says so when some
 * were left behind.
 */
export function multisearchUrl(accounts: OpggAccount[]): string | null {
  const summoners = accounts
    .filter((account) => account.gameName?.trim() && account.tagLine?.trim())
    .map((account) => `${account.gameName!.trim()}#${account.tagLine!.trim()}`)
    // Dedupe: the same account can hold a starting slot and show up again on
    // the bench of a lineup being read mid-rebuild, and op.gg would search it
    // twice.
    .filter((riotId, index, all) => all.indexOf(riotId) === index)
    .map((riotId) => encodeURIComponent(riotId).replace(/%20/g, '+'))

  if (summoners.length === 0) return null

  return `https://op.gg/${LOCALE}/lol/multisearch/${REGION}?summoners=${summoners.join(SEPARATOR)}`
}

/** How many of those accounts op.gg can actually look up. */
export function searchableCount(accounts: OpggAccount[]): number {
  return accounts.filter((account) => account.gameName?.trim() && account.tagLine?.trim()).length
}
