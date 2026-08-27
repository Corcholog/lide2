/**
 * El fondo del sitio.
 *
 * La portada del torneo es una foto que ocupa la primera pantalla; en cuanto se
 * scrollea, atrás no queda nada. Esto es lo que aparece.
 *
 * Va `fixed`, así que no se mueve mientras el contenido pasa por encima: el
 * efecto es de contenido deslizándose sobre un telón, no de un fondo que
 * scrollea con vos.
 *
 * Nada de tramas repetidas acá. Una trama de líneas al mismo grosor y casi al
 * mismo color que los bordes de las tarjetas compite con el contenido en vez de
 * sostenerlo: el ojo no sabe qué es fondo y qué es tabla. Lo que queda son
 * manchas grandes y suaves —rojo y acero, la paleta del arte— y unas pocas
 * figuras rectas y bien grandes, que a esa escala se leen como composición y no
 * como textura. El grano fino de arriba de todo no dibuja nada: rompe el
 * bandeado de los degradados, que en pantallas de 8 bits se ve.
 *
 * Todo se arma con `color-mix` sobre los tokens, así que sigue al tema sin
 * duplicar una sola definición.
 */

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      {/* Manchas: rojo arriba a la derecha, acero abajo a la izquierda. */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(75% 60% at 92% -10%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 60%)',
            'radial-gradient(70% 55% at -12% 108%, color-mix(in srgb, var(--color-steel) 30%, transparent) 0%, transparent 65%)',
            'linear-gradient(200deg, transparent 35%, color-mix(in srgb, var(--color-steel) 10%, transparent) 100%)',
          ].join(', '),
        }}
      />

      {/*
        Las figuras, con clip-path: pesan cero, se recortan solas a cualquier
        pantalla y toman el color del tema. Van a media pantalla de grandes a
        propósito, porque a escala chica volverían a leerse como ruido.
      */}
      <div
        className="absolute -right-[12vw] top-[6vh] hidden h-[62vh] w-[52vw] bg-accent/[0.06] lg:block"
        style={{ clipPath: 'polygon(42% 0, 100% 16%, 100% 84%, 0 100%)' }}
      />
      <div
        className="absolute -left-[10vw] bottom-[-10vh] hidden h-[58vh] w-[46vw] bg-steel/[0.12] lg:block"
        style={{ clipPath: 'polygon(0 12%, 100% 0, 58% 100%, 0 88%)' }}
      />
      <div
        className="absolute left-[52vw] top-[62vh] hidden h-[30vh] w-[22vw] border-2 border-accent/[0.12] xl:block"
        style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
      />

      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />
    </div>
  )
}
