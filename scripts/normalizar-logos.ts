/**
 * Deja los 13 logos de universidad listos para usar en el sitio.
 *
 *   npx tsx scripts/normalizar-logos.ts            muestra que haria
 *   npx tsx scripts/normalizar-logos.ts --escribir genera public/universidades
 *
 * Los originales vienen como los manda cada universidad y no se parecen en
 * nada entre si: hay JPEG, PNG con transparencia y PNG con paleta; van de 280px
 * a 1146px; uno es cuadrado y otro apaisado; y sobre todo los fondos apuntan
 * para tres lados distintos —blanco, transparente y azul oscuro—. Puestos tal
 * cual en una tabla se ven de tamanos distintos, y en tema oscuro los de tinta
 * negra sobre transparente directamente desaparecen.
 *
 * QUE HACE Y POR QUE
 *
 * 1. Aplana sobre blanco. Es la decision de fondo y merece explicacion, porque
 *    tira la transparencia a propositoi. El sitio tiene tema claro y oscuro, y
 *    ademas exporta cards a PNG con html-to-image: si el logo dependiera del
 *    fondo, un escudo negro sobre transparente saldria invisible en una imagen
 *    que despues se comparte, sin que nadie se entere hasta verla publicada.
 *    Con el blanco adentro del archivo, el logo se ve igual en los dos temas y
 *    en la card exportada. La contrapartida es que siempre hay que dibujarlos
 *    sobre un chip claro, que es justo lo que hace <LogoUniversidad>.
 *
 * 2. Recorta el margen. Cada uno traia una cantidad de aire distinta (los
 *    opacos van del 19% al 100% de la imagen), que es lo que hacia que en una
 *    misma caja unos se vieran grandes y otros perdidos en el medio.
 *
 * 3. Cuadra y lleva a 256x256, con 16px de aire propio. Asi el componente puede
 *    confiar en que todos tienen la misma forma y no hay que corregir ninguno a
 *    mano.
 *
 * 4. Un solo formato y el nombre en minusculas, igual al `tag` de la tabla
 *    `universities`. El nombre es el que ata el archivo con la base, asi que
 *    tiene que ser deducible: `/universidades/${tag.toLowerCase()}.png`.
 *
 * De paso arregla tres trampas que solo se notan en produccion: `uai.png` es en
 * realidad un JPEG con la extension cambiada, los dos `.jfif` usan una extension
 * que Next no conoce (no aparece una sola vez en su dist, asi que el
 * Content-Type queda al azar), y `UNLP.png` era el unico en mayusculas, que en
 * Windows funciona y en el Linux de Vercel es un 404.
 *
 * Los originales quedan intactos en assets/universidades/. Si manana entra una
 * universidad nueva, se copia ahi y se vuelve a correr esto.
 */

import sharp from 'sharp'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const ORIGEN = 'assets/universidades'
const DESTINO = 'public/universidades'
const LADO = 256
/** Aire propio del archivo, para que el logo no toque el borde del chip. */
const AIRE = 16
const BLANCO = { r: 255, g: 255, b: 255, alpha: 1 }

const escribir = process.argv.includes('--escribir')

/**
 * Los 13 `tag` de la tabla `universities`, en minuscula. Estan aca escritos y
 * no leidos de la base a proposito: el script tiene que poder correr sin
 * credenciales, y si algun dia un archivo deja de corresponderse con una
 * universidad, es mejor que falle ruidoso que generar un PNG que nadie usa.
 */
const TAGS = new Set([
  'uade', 'uai', 'uap', 'unahur', 'unam', 'uncuyo', 'undav',
  'uner', 'unlam', 'unlp', 'unlu', 'unpaz', 'unrn',
])

async function main() {
  const archivos = readdirSync(ORIGEN).filter((f) => statSync(join(ORIGEN, f)).isFile())

  const tags = archivos.map((f) => basename(f, extname(f)).toLowerCase())
  const sobran = tags.filter((t) => !TAGS.has(t))
  const faltan = [...TAGS].filter((t) => !tags.includes(t))
  if (sobran.length) throw new Error(`No corresponden a ninguna universidad: ${sobran.join(', ')}`)
  if (faltan.length) throw new Error(`Faltan logos para: ${faltan.join(', ')}`)

  if (escribir) mkdirSync(DESTINO, { recursive: true })

  for (const archivo of archivos) {
    const tag = basename(archivo, extname(archivo)).toLowerCase()
    const entrada = join(ORIGEN, archivo)
    const salida = join(DESTINO, `${tag}.png`)
    const antes = await sharp(entrada).metadata()

    const plano = await sharp(entrada).flatten({ background: BLANCO }).toBuffer()

    // El recorte se hace contra blanco porque el paso anterior dejo todo
    // blanco. Los dos logos que traen fondo oscuro de punta a punta no tienen
    // ningun borde blanco, asi que este paso no los toca, que es lo correcto.
    let recortado: Buffer
    try {
      recortado = await sharp(plano).trim({ background: BLANCO, threshold: 12 }).toBuffer()
    } catch {
      // trim() tira si la imagen es de un solo color; en ese caso no hay nada
      // que recortar y sirve tal cual.
      recortado = plano
    }

    const buffer = await sharp(recortado)
      .resize(LADO - AIRE * 2, LADO - AIRE * 2, { fit: 'contain', background: BLANCO })
      .extend({ top: AIRE, bottom: AIRE, left: AIRE, right: AIRE, background: BLANCO })
      // Paleta: son logos de color plano, asi que 256 colores alcanzan y el
      // total de los 13 baja de 558kB a 206kB sin diferencia visible.
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toBuffer()

    const despues = await sharp(buffer).metadata()
    const kb = (n: number) => `${(n / 1024).toFixed(0)}kB`
    console.log(
      `${archivo.padEnd(13)} ${String(antes.format).padEnd(4)} ${antes.width}x${antes.height}` +
        ` ${kb(statSync(entrada).size)}`.padEnd(9) +
        ` ->  ${tag}.png  ${despues.width}x${despues.height} ${kb(buffer.length)}`,
    )

    // Se escribe el buffer tal cual. Pasarlo por sharp().toFile() lo
    // decodificaria y volveria a codificar con las opciones por defecto,
    // tirando la paleta que se acaba de elegir.
    if (escribir) writeFileSync(salida, buffer)
  }

  console.log(`\n${archivos.length} logos ${escribir ? `escritos en ${DESTINO}/` : 'listos'}.`)
  if (!escribir) console.log('Para generarlos: npx tsx scripts/normalizar-logos.ts --escribir')
}

main().catch((error) => {
  console.error(`\n  ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
})
