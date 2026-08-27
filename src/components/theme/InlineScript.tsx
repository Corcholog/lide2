/**
 * Un `<script>` que corre mientras el navegador parsea el HTML, antes del primer
 * pintado.
 *
 * React avisa en desarrollo cada vez que un componente dibuja un `<script>`,
 * porque en el cliente esas etiquetas nunca se ejecutan: insertar un script por
 * DOM no lo corre. Acá eso no es un problema —el script tiene que correr una vez
 * sola, en la carga dura, y en las navegaciones internas ya no hace falta— pero
 * el aviso ensucia la consola.
 *
 * La salida que documenta Next: emitir `text/javascript` en el servidor y
 * `text/plain` en el cliente, de modo que el navegador lo corre al parsear y
 * React lo ignora al hidratar. `suppressHydrationWarning` es por la diferencia
 * de `type` entre los dos.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
