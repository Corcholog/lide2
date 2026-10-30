'use client'

import { useState } from 'react'
import { ChampionSpotlight, type SpotlightChampion } from '@/components/home/ChampionSpotlight'
import type { RosterCard } from '@/lib/lide2/champion-roster'

export interface Finalist {
  champion: SpotlightChampion
  players: RosterCard[]
}

/** The spotlight with a button per finalist, to see either one as the winner. */
export function PreviewChampion({ finalists }: { finalists: [Finalist, Finalist] }) {
  const [winner, setWinner] = useState(0)
  const shown = finalists[winner]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quién gana la final">
        {finalists.map((finalist, index) => (
          <button
            key={finalist.champion.teamId}
            type="button"
            onClick={() => setWinner(index)}
            aria-pressed={winner === index}
            className={`rounded border px-4 py-2 text-sm font-medium transition-colors ${
              winner === index
                ? 'border-accent bg-accent-strong text-white'
                : 'border-line hover:border-accent hover:text-accent'
            }`}
          >
            Gana {finalist.champion.name}
          </button>
        ))}
      </div>

      <ChampionSpotlight champion={shown.champion} score="3-1" players={shown.players} />
    </div>
  )
}
