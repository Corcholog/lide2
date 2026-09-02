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
 * Headlines and large numbers.
 *
 * It is a single-weight grotesque, the heaviest there is: solid blocks of text,
 * no gradations. That lack of nuance is exactly what gives the brutalist air,
 * and against the body set in Geist the contrast is strong. Being wide, it
 * wants tighter tracking at large sizes.
 *
 * A single weight means font-bold and font-black do nothing to this family: the
 * weight is already fixed.
 */
const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

/*
 * The card WhatsApp, Discord, Twitter and Instagram build when somebody pastes
 * the link. A tournament site spreads exactly that way, by pasted link, and
 * without this it comes out bare.
 *
 * The image is src/app/opengraph-image.jpg, which Next picks up by naming
 * convention; `npm run og` generates it once. `metadataBase` is what turns it
 * into an absolute URL, which is the only way the platforms can go and fetch
 * it.
 *
 * The template lets each page put its own part in front ("Estadísticas · LIDE
 * 2") without repeating the tournament's name in every file.
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
    description: `${TOURNAMENT.slogan} ${TOURNAMENT.teams} equipos, ${TOURNAMENT.universities} universidades. Arranca el 5 de septiembre de 2026.`,
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
      // overflow-x-clip: the tournament's hero breaks out of the centred
      // container to take the window's width, and 100vw includes the
      // scrollbar's width. Without this a few pixels spill over and horizontal
      // scroll appears.
      className={`${geistSans.variable} ${geistMono.variable} ${archivoBlack.variable} h-full overflow-x-clip antialiased motion-safe:scroll-smooth`}
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
