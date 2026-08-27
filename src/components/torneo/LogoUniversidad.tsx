import Image from 'next/image'

/**
 * Los logos de las universidades.
 *
 * El archivo sale del `tag`: /universidades/<tag en minuscula>.png. No hace
 * falta consultar `universities.logo_url` para dibujarlos, y eso importa porque
 * en la tabla de posiciones y en el fixture lo unico que viaja son las siglas
 * (`team_university_tags`), no los ids.
 *
 * Los 13 archivos estan normalizados por scripts/normalizar-logos.ts: todos
 * 256x256, con su propio margen y con el fondo blanco adentro del PNG. Ese
 * fondo blanco es a proposito y es lo que hace que este componente sea tan
 * corto: los originales venian con fondo blanco, transparente y azul oscuro
 * segun la universidad, asi que sobre el tema oscuro unos se veian como un
 * recuadro blanco y otros —los escudos de tinta negra sobre transparente, como
 * el de la UNLP— directamente no se veian. Metiendo el blanco en el archivo,
 * los trece se ven igual en los dos temas y en las cards exportadas a PNG.
 *
 * El borde no es decorativo: sobre fondo claro, el logo de fondo blanco se
 * fusionaria con la pagina y quedaria flotando sin forma.
 */

/** Cuadrados, porque el sitio tiene --radius-* en 0. */
const TAMANOS = {
  xs: 'size-4', //  16px  cada inscripto, en la ficha del equipo
  sm: 'size-6', //  24px  el fixture, que es la grilla mas apretada
  md: 'size-8', //  32px  la tabla de posiciones
  lg: 'size-9', //  36px  la tira de la portada
  xl: 'size-16', // 64px  el encabezado de la ficha del equipo
  // El unico que cambia con el ancho. En el fixture entran los escudos de las
  // tres universidades de un equipo mixto, pero solo cuando hay dos columnas:
  // en un telefono, con una sola, tres se comerian el nombre. Ver FixtureTeam.
  fixture: 'size-7 sm:size-10', // 28 -> 40px
} as const

export type TamanoLogo = keyof typeof TAMANOS

export function rutaLogo(tag: string): string {
  return `/universidades/${tag.toLowerCase()}.png`
}

export function LogoUniversidad({
  tag,
  size = 'sm',
  className = '',
}: {
  tag: string
  size?: TamanoLogo
  className?: string
}) {
  return (
    <Image
      src={rutaLogo(tag)}
      alt={tag}
      title={tag}
      width={256}
      height={256}
      className={`${TAMANOS[size]} shrink-0 border border-line object-contain ${className}`}
    />
  )
}

/**
 * Los logos de un equipo. La mayoria tiene uno solo; cuatro equipos de la LIDE
 * 2 se armaron con inscripciones sueltas y representan hasta tres universidades
 * a la vez (el Equipo 15 es UNER + UADE + UNLP).
 *
 * Van uno al lado del otro y no encimados: son cuadrados blancos, asi que
 * encimarlos no se leeria como un mazo de escudos sino como un solo bloque
 * blanco con bordes en el medio.
 *
 * `max` corta la lista donde no hay lugar —en una fila de tabla entra uno— y
 * agrega "+2". Como el orden viene de `team_university_tags` con la principal
 * primero, el que sobrevive al corte es siempre el que mas representa al
 * equipo, no uno cualquiera.
 */
export function LogosUniversidad({
  tags,
  size = 'sm',
  max = 3,
  className = '',
}: {
  tags: string[] | null | undefined
  size?: TamanoLogo
  max?: number
  className?: string
}) {
  const lista = tags ?? []
  if (lista.length === 0) return null

  const visibles = lista.slice(0, max)
  const ocultos = lista.length - visibles.length

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`} title={lista.join(' · ')}>
      {visibles.map((tag) => (
        <LogoUniversidad key={tag} tag={tag} size={size} />
      ))}
      {ocultos > 0 && <span className="text-[10px] leading-none text-faint">+{ocultos}</span>}
    </span>
  )
}
