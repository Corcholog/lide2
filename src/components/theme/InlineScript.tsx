/**
 * A `<script>` that runs while the browser parses the HTML, before the first
 * paint.
 *
 * React warns in development every time a component draws a `<script>`, because
 * on the client those tags never execute: inserting a script through the DOM
 * does not run it. That is not a problem here - the script has to run exactly
 * once, on the hard load, and internal navigations no longer need it - but the
 * warning clutters the console.
 *
 * The way out that Next documents: emit `text/javascript` on the server and
 * `text/plain` on the client, so the browser runs it while parsing and React
 * ignores it while hydrating. `suppressHydrationWarning` is for the difference
 * in `type` between the two.
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
