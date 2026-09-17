/**
 * Resolves typed text to a champion, for the bans form.
 *
 * The form is a text field with a `<datalist>`, and names are typed quickly and
 * without accents ("kaisa", "drmundo", "wukong"), so matching is forgiving.
 * Pure functions over a catalog loaded with `championCatalog`.
 */

/**
 * Lower case, no accents, letters and digits only: "Kai'Sa", "kaisa" and
 * "KAI SA" all become "kaisa"; "Dr. Mundo" becomes "drmundo".
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Lookup index from any spelling to the ddragon key. Indexes both the display
 * name ("Wukong") and the internal key ("MonkeyKing"), since either may be
 * typed.
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
 * The ddragon key for the typed text, or null when nothing matches, so the
 * form can report it instead of storing an unknown champion.
 */
export function resolveChampion(index: Map<string, string>, text: string): string | null {
  const key = normalize(text ?? '')
  if (!key) return null

  return index.get(key) ?? null
}
