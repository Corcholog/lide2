import type { Metadata } from "next";
import { Archivo_Black, Geist, Geist_Mono } from "next/font/google";
import { InlineScript } from "@/components/theme/InlineScript";
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

export const metadata: Metadata = {
  title: "LIDE · Torneo",
  description: "Estadisticas del torneo, extraidas de los replays .rofl de cada partida",
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
