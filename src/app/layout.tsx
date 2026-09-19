import type { Metadata } from "next";
import { Archivo_Black, Geist, Geist_Mono } from "next/font/google";
import { InlineScript } from "@/components/theme/InlineScript";
import { siteUrl } from "@/lib/env";
import { TOURNAMENT } from "@/lib/lide2/tournament";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
 * Display font for headings and large numbers. It has a single weight, so
 * font-bold and font-black do not change it; wide letterforms want tighter
 * tracking at large sizes.
 */
const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

/*
 * Metadata and link previews. The image is src/app/opengraph-image.jpg (picked
 * up by file convention, generated with `npm run og`); `metadataBase` makes its
 * URL absolute, which link previews require. The title template prefixes each
 * page's own title.
 */
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: `${TOURNAMENT.name} · ${TOURNAMENT.fullName}`,
    template: `%s · ${TOURNAMENT.name}`,
  },
  description: `${TOURNAMENT.teams} equipos de ${TOURNAMENT.universities} universidades. Tabla, fixture, playoffs y estadísticas de cada partida, sacadas de los replays. Página no oficial.`,
  applicationName: TOURNAMENT.name,
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: TOURNAMENT.name,
    title: `${TOURNAMENT.name} · ${TOURNAMENT.fullName}`,
    description: `${TOURNAMENT.slogan} ${TOURNAMENT.teams} equipos, ${TOURNAMENT.universities} universidades.`,
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The script below overwrites data-theme before hydration, so React finds
    // an attribute different from the one it rendered: suppressHydrationWarning
    // tells it the DOM wins.
    <html
      lang="es"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      // overflow-x-clip: the full-width hero uses 100vw, which includes the
      // scrollbar, and would otherwise cause horizontal scrolling.
      className={`${geistSans.variable} ${geistMono.variable} ${archivoBlack.variable} h-full overflow-x-clip antialiased motion-safe:scroll-smooth`}
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
        {/*
          Shows `.sin-js` elements when JavaScript is off (see globals.css).
          Rendered with `dangerouslySetInnerHTML`: with scripting on, <noscript>
          content is raw text, and React could not hydrate a <style> child
          against it.
        */}
        <noscript
          dangerouslySetInnerHTML={{ __html: "<style>.sin-js{display:revert}</style>" }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
