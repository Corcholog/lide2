/** The "nothing here yet" notice: what is missing and what will fill it. */
export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-2 border-line bg-surface px-6 py-10 text-center text-fg">
      <p className="font-display text-lg uppercase tracking-wide">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{detail}</p>
    </div>
  )
}
