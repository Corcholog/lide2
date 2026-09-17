import { TOURNAMENT } from '@/lib/lide2/tournament'

/**
 * The site footer, in the layout so it appears on every page: the site notice,
 * a contact for reporting errors, and Riot's legal notice.
 */

const CONTACT_EMAIL = 'loguerciogiorgioivan@gmail.com'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t-2 border-line bg-surface">
      {/* Same container as the layout's <main>, so text lines up. */}
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

          {/* Contact framed as reporting an error, which gives people a reason to write. */}
          <div className="shrink-0">
            <p className="text-sm font-medium">¿Encontraste un error?</p>
            <p className="mt-1 text-xs text-faint">
              Escribime a{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-muted underline underline-offset-2 transition-colors hover:text-accent"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>

        {/*
          Riot's legal notice, required by their fan content policy. It covers
          the hero artwork, Data Dragon icons and the data from replays.
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
