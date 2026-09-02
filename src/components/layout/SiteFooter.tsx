import { TOURNAMENT } from '@/lib/lide2/tournament'

/**
 * The site's footer: whose this is, and whose it is not.
 *
 * It goes in the layout and not on the home page because the problem it solves
 * is precisely the one the inner pages have. The note saying the site is not
 * official lived in a single place - the hero's banner - so somebody landing
 * straight on /equipos from a shared link saw nothing that told them. And the
 * page shows the crests of thirteen universities: without this it is easy to
 * read as something institutional.
 *
 * The hero banner stays as it is. This is the same message said in full, in the
 * place where people look for these things.
 */

const CONTACT_EMAIL = 'loguerciogiorgioivan@gmail.com'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t-2 border-line bg-surface">
      {/* The same container as the layout's <main>, so the text starts where
          the rest of the page starts. */}
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
            The contact framed as "did you find a mistake?" and not as a bare
            email address. Somebody seeing their own KDA wrong has a concrete
            reason to write; an email with no context never gets used.
          */}
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
          Fine print, set apart and dimmer: it is not tournament information. It
          covers the three things the site uses from Riot - the home page
          artwork, the champion and item icons that come from Data Dragon, and
          the names and data that come out of the replays - and it is one of the
          conditions their fan content policy asks for.
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
