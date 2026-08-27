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
 * Titulares y numeros grandes.
 *
 * Es una grotesca de un solo peso, el mas pesado que hay: bloques macizos de
 * texto, sin gradaciones. Esa falta de matices es justamente lo que da el aire
 * brutalista, y contra el cuerpo en Geist el contraste es fuerte. Al ser ancha
 * conviene apretarle el tracking en los tamanos grandes.
 *
 * Un solo peso quiere decir que font-bold y font-black no hacen nada sobre esta
 * familia: el peso ya viene puesto.
 */
const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

/*
 * La tarjeta que arman WhatsApp, Discord, Twitter e Instagram cuando alguien
 * pega el link. Un sitio de torneo se difunde justamente así, pegando el link,
 * y sin esto sale pelado.
 *
 * La imagen es src/app/opengraph-image.jpg, que Next toma por convención de
 * nombre; la genera `npm run og` una sola vez. `metadataBase` es lo que la
 * convierte en una URL absoluta, que es la única forma en que las plataformas
 * la pueden ir a buscar.
 *
 * El template deja que cada página ponga lo suyo adelante ("Estadísticas ·
 * LIDE 2") sin repetir el nombre del torneo en cada archivo.
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
    // El script de abajo pisa data-theme antes de hidratar, así que React se
    // encuentra un atributo distinto al que renderizó: suppressHydrationWarning
    // le dice que el DOM manda.
    <html
      lang="es"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      // overflow-x-clip: la portada del torneo se sale del contenedor centrado
      // para ocupar el ancho de la ventana, y 100vw incluye el ancho de la barra
      // de scroll. Sin esto sobran unos píxeles y aparece scroll horizontal.
      className={`${geistSans.variable} ${geistMono.variable} ${archivoBlack.variable} h-full overflow-x-clip antialiased motion-safe:scroll-smooth`}
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
