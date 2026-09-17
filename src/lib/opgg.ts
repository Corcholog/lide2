/**
 * Links to op.gg, which shows what the replays do not: rank, recent games and
 * champion pool.
 *
 * The multisearch URL copies what op.gg's own search box produces, including
 * the double comma between accounts and `+` for spaces:
 *
 *   https://op.gg/es/lol/multisearch/las?summoners=Player+One%231234%2C%2CPlayer+Two%23LAS
 *
 * `encodeURIComponent` produces `%20`, so spaces are replaced on purpose.
 */

/** Every account in the tournament plays on LAS. */
const REGION = 'las'

/** op.gg in Spanish, like the site. */
const LOCALE = 'es'

/** op.gg's separator between accounts: comma, empty slot, comma. */
const SEPARATOR = '%2C%2C'

export interface OpggAccount {
  gameName: string | null
  tagLine: string | null
}

/**
 * The multisearch link for a set of accounts, or null if none can be searched.
 *
 * Accounts without a `#TAG` are skipped: a Riot ID is not unique without it,
 * so op.gg cannot resolve it. Callers use `searchableCount` to say how many
 * accounts made it in.
 */
export function multisearchUrl(accounts: OpggAccount[]): string | null {
  const summoners = accounts
    .filter((account) => account.gameName?.trim() && account.tagLine?.trim())
    .map((account) => `${account.gameName!.trim()}#${account.tagLine!.trim()}`)
    // The same account can appear twice while a lineup is being rebuilt.
    .filter((riotId, index, all) => all.indexOf(riotId) === index)
    .map((riotId) => encodeURIComponent(riotId).replace(/%20/g, '+'))

  if (summoners.length === 0) return null

  return `https://op.gg/${LOCALE}/lol/multisearch/${REGION}?summoners=${summoners.join(SEPARATOR)}`
}

/**
 * One account's own page.
 *
 * Here the Riot ID is part of the path, so spaces are `%20` (a `+` would be a
 * literal plus) and the `#` becomes a hyphen:
 *
 *   https://op.gg/es/lol/summoners/las/Player%20One-1234
 *
 * Name and tag are joined before encoding, since `encodeURIComponent` leaves
 * hyphens alone. op.gg reads the tag after the last hyphen, so names that
 * contain hyphens still work. Returns null without a tag.
 */
export function summonerUrl(account: OpggAccount): string | null {
  const gameName = account.gameName?.trim()
  const tagLine = account.tagLine?.trim()

  if (!gameName || !tagLine) return null

  return `https://op.gg/${LOCALE}/lol/summoners/${REGION}/${encodeURIComponent(`${gameName}-${tagLine}`)}`
}

/** How many of those accounts op.gg can actually look up. */
export function searchableCount(accounts: OpggAccount[]): number {
  return accounts.filter((account) => account.gameName?.trim() && account.tagLine?.trim()).length
}
