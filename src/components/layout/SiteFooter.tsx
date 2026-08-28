import { TOURNAMENT } from '@/lib/lide2/tournament'

/**
 * El pie del sitio: de quien es esto, y de quien no.
 *
 * Va en el layout y no en la portada porque el problema que resuelve es
 * justamente el de las paginas internas. La aclaracion de que el sitio no es
 * oficial vivia en un solo lugar —el cartel del hero—, asi que alguien que
 * entraba directo a /equipos desde un link compartido no veia nada que se lo
 * dijera. Y la pagina muestra los escudos de trece universidades: sin esto es
 * facil leerla como algo institucional.
 *
 * El cartel del hero se queda igual. Este es el mismo mensaje dicho entero, en
 * el lugar donde se buscan estas cosas.
 */

const CONTACTO = 'loguerciogiorgioivan@gmail.com'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t-2 border-line bg-surface">
      {/* El mismo contenedor que el <main> del layout, para que el texto
          arranque donde arranca el resto de la pagina. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div className="max-w-prose">
            <p className="text-sm font-medium">Sitio no oficial</p>
            <p className="mt-1 text-xs leading-relaxed text-faint">
              No está afiliado ni avalado por la organización de la {TOURNAMENT.name} ni por las
              universidades que participan. La información sale de los anuncios y las planillas
              oficiales, pero la página la mantiene otra gente: si algo no coincide, mandan los
              canales del torneo.
            </p>
          </div>

          {/*
            El contacto enmarcado como "encontraste un error" y no como un mail
            suelto. A alguien que ve mal su propio KDA le da una razon concreta
            para escribir; un mail sin contexto no se usa nunca.
          */}
          <div className="shrink-0">
            <p className="text-sm font-medium">¿Encontraste un error?</p>
            <p className="mt-1 text-xs text-faint">
              Escribime a{' '}
              <a
                href={`mailto:${CONTACTO}`}
                className="text-muted underline underline-offset-2 transition-colors hover:text-accent"
              >
                {CONTACTO}
              </a>
            </p>
          </div>
        </div>

        {/*
          Letra chica, separada y mas apagada: no es informacion del torneo.
          Cubre las tres cosas que el sitio usa de Riot —el arte de la portada,
          los iconos de campeones y items que vienen de Data Dragon, y los
          nombres y datos que salen de los replays—, y es una de las condiciones
          que pide su politica de contenido de fans.
        */}
        <p className="border-t border-line pt-4 text-[11px] leading-relaxed text-dim">
          {TOURNAMENT.name} no está avalado por Riot Games y no refleja las opiniones de Riot Games
          ni de nadie involucrado oficialmente en la producción o gestión de League of Legends.
          League of Legends y Riot Games son marcas registradas de Riot Games, Inc.
        </p>
      </div>
    </footer>
  )
}
