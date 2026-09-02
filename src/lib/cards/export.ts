/**
 * A piece's raw data, ready to copy.
 *
 * It is the half of the panel that matters when the card is not enough:
 * somebody building the piece in Figma does not want the PNG, they want the
 * names spelled right and the numbers with their units. It comes out of the
 * same `StatBlock` that draws the card, so there is no way for the text to say
 * one thing and the image another.
 *
 * The CSV headers stay in Spanish: the file is handed to whoever designs the
 * piece.
 */

import type { StatBlock } from '@/lib/stats/types'

/** Name, team and context on one line: "Zaahen — Equipo 07 · 6/0/8". */
function line(name: string, subtitle?: string | null, detail?: string | null): string {
  const context = [subtitle, detail].filter(Boolean).join(' · ')
  return context ? `${name} — ${context}` : name
}

export function toPlainText(block: StatBlock): string {
  const header = [block.title, block.subtitle].filter(Boolean).join(' · ')
  const rows = block.rows.map(
    (row, index) => `${index + 1}. ${line(row.name, row.subtitle, row.detail)} — ${row.display}`,
  )

  return [header, ...rows, block.note ? `(${block.note})` : null].filter(Boolean).join('\n')
}

/**
 * One CSV cell.
 *
 * Always quoted and not only when needed: team names carry commas and slashes,
 * and a conditional rule is one more thing to get wrong.
 */
function cell(value: string | number | null): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function toCsv(block: StatBlock): string {
  const header = ['puesto', 'nombre', 'contexto', 'detalle', 'valor', 'valor_crudo']

  const rows = block.rows.map((row, index) =>
    [index + 1, row.name, row.subtitle ?? '', row.detail ?? '', row.display, row.value]
      .map(cell)
      .join(','),
  )

  return [header.map(cell).join(','), ...rows].join('\n')
}
