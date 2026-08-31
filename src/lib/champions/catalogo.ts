/**
 * De lo que alguien escribió al campeón que quiso decir.
 *
 * El panel de bans es un campo de texto con un `<datalist>`: se puede elegir de
 * la lista, pero también escribir. Y quien carga diez drafts seguidos escribe
 * rápido y sin acentos —"kaisa", "drmundo", "wukong"—, así que la comparación
 * tiene que ser tolerante o el formulario se vuelve una pelea.
 *
 * Funciones puras a propósito: no piden nada a la red, reciben el catálogo ya
 * cargado (`championCatalog` de src/lib/ddragon.ts) y se testean sin base ni
 * fetch.
 */

/**
 * La forma con la que se compara: sin mayúsculas, sin acentos y sin nada que
 * no sea una letra o un número.
 *
 * Con eso "Kai'Sa", "kaisa" y "KAI SA" son la misma cosa, y también "Dr. Mundo"
 * con "drmundo", "Nunu y Willump" con "nunuywillump" y "Cho'Gath" con
 * "chogath". Los apóstrofes y los puntos de estos nombres son exactamente lo
 * que nadie escribe.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * El índice para buscar: de cualquier grafía a la clave de ddragon.
 *
 * Se indexan las dos puntas —el nombre visible ("Wukong") y la clave interna
 * ("MonkeyKing")— porque las dos circulan. En el sitio se ve el nombre, pero en
 * la base y en los archivos está la clave, y quien carga los bans mirando un
 * scoreboard puede escribir cualquiera de las dos.
 */
export function championIndex(catalogo: { key: string; name: string }[]): Map<string, string> {
  const index = new Map<string, string>()

  for (const champ of catalogo) {
    index.set(normalizar(champ.name), champ.key)
    index.set(normalizar(champ.key), champ.key)
  }

  return index
}

/**
 * La clave de ddragon del campeón que se escribió, o null si no es ninguno.
 *
 * Null y no "lo que vino": guardar un campeón inventado ensucia el meta con una
 * fila fantasma que nadie va a poder explicar tres semanas después. Es mejor
 * que el formulario diga que no lo encontró.
 */
export function resolveChampion(index: Map<string, string>, texto: string): string | null {
  const clave = normalizar(texto ?? '')
  if (!clave) return null

  return index.get(clave) ?? null
}
