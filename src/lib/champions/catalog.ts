/**
 * From what somebody typed to the champion they meant.
 *
 * The bans panel is a text field with a `<datalist>`: you can pick from the
 * list, but you can also type. And whoever enters ten drafts in a row types
 * fast and without accents - "kaisa", "drmundo", "wukong" - so the comparison
 * has to be forgiving or the form turns into a fight.
 *
 * Pure functions on purpose: they ask the network for nothing, they take an
 * already-loaded catalogue (`championCatalog` from src/lib/ddragon.ts) and they
 * are tested without a database or a fetch.
 */

/**
 * The shape everything is compared in: no capitals, no accents and nothing that
 * is not a letter or a digit.
 *
 * With that, "Kai'Sa", "kaisa" and "KAI SA" are the same thing, and so are
 * "Dr. Mundo" and "drmundo", "Nunu y Willump" and "nunuywillump", "Cho'Gath"
 * and "chogath". The apostrophes and dots in these names are exactly what
 * nobody types.
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * The lookup index: from any spelling to the ddragon key.
 *
 * Both ends are indexed - the visible name ("Wukong") and the internal key
 * ("MonkeyKing") - because both circulate. The site shows the name, but the
 * database and the files hold the key, and whoever enters the bans while
 * looking at a scoreboard may type either one.
 */
export function championIndex(catalog: { key: string; name: string }[]): Map<string, string> {
  const index = new Map<string, string>()

  for (const champ of catalog) {
    index.set(normalize(champ.name), champ.key)
    index.set(normalize(champ.key), champ.key)
  }

  return index
}

/**
 * The ddragon key of the champion that was typed, or null when it is none of
 * them.
 *
 * Null and not "whatever came in": storing a made-up champion dirties the meta
 * with a ghost row nobody will be able to explain three weeks later. Better for
 * the form to say it could not find it.
 */
export function resolveChampion(index: Map<string, string>, text: string): string | null {
  const key = normalize(text ?? '')
  if (!key) return null

  return index.get(key) ?? null
}
