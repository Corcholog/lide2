/**
 * Los datos crudos de una pieza, para copiar.
 *
 * Es la mitad del panel que importa cuando la card no alcanza: alguien que
 * arma la pieza en Figma no quiere el PNG, quiere los nombres bien escritos y
 * los números con su unidad. Sale del mismo `StatBlock` que dibuja la card, así
 * que no hay forma de que el texto diga una cosa y la imagen otra.
 */

import type { StatBlock } from '@/lib/stats/types'

/** Nombre, equipo y contexto en un renglón: "Zaahen — Equipo 07 · 6/0/8". */
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
 * Una celda de CSV.
 *
 * Se entrecomilla siempre y no sólo cuando hace falta: los nombres de equipo
 * traen comas y barras, y una regla condicional es una más para equivocarse.
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
