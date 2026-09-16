/**
 * A `<script>` that runs while the HTML is parsed, before the first paint.
 *
 * React warns when components render `<script>` tags, which never run on the
 * client. Following Next's documented approach, the server emits
 * `text/javascript` and the client `text/plain`, so the browser runs it once on
 * load and React ignores it when hydrating. `suppressHydrationWarning` covers
 * the differing `type`.
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
