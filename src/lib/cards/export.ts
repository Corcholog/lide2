/**
 * A piece's data as plain text or CSV, for designing it elsewhere with the
 * exact names and numbers. Built from the same `StatBlock` as the card, so both
 * always agree. CSV headers are in Spanish.
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

/** One CSV cell, always quoted: team names can contain commas. */
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
