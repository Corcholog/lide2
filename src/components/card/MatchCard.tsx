'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { GameIcon } from '@/components/match/GameIcon'
import { formatDate, formatDuration, formatGold, formatKda, formatNumber } from '@/lib/format'

export interface CardHighlight {
  label: string
  value: string
  player: string
  champion: string
  championIcon: string
}

export interface MatchCardData {
  blueName: string
  redName: string
  blueKills: number
  redKills: number
  blueGold: number
  redGold: number
  winningSide: 100 | 200 | null
  durationMs: number
  playedAt: string | null
  stageLabel: string | null
  roundLabel: string | null
  patch: string | null
  mvp: {
    name: string
    champion: string
    championIcon: string
    kills: number
    deaths: number
    assists: number
    damage: number
    gold: number
  } | null
  highlights: CardHighlight[]
}

const SIZE = 1080

export function MatchCard({ data, fileName }: { data: MatchCardData; fileName: string }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    if (!cardRef.current) return
    setBusy(true)
    setError(null)

    try {
      const dataUrl = await toPng(cardRef.current, {
        width: SIZE,
        height: SIZE,
        pixelRatio: 1,
        cacheBust: true,
      })

      const link = document.createElement('a')
      link.download = fileName
      link.href = dataUrl
      link.click()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la imagen')
    } finally {
      setBusy(false)
    }
  }

  const blueWon = data.winningSide === 100
  const redWon = data.winningSide === 200

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between gap-4">
        <p className="text-sm text-ink-400">1080 × 1080, listo para publicar</p>
        <button
          onClick={download}
          disabled={busy}
          className="rounded bg-brand-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-red-soft disabled:opacity-50"
        >
          {busy ? 'Generando…' : 'Descargar PNG'}
        </button>
      </div>

      {error && (
        <p className="w-full rounded border border-brand-red/40 bg-brand-red-dim/40 px-3 py-2 text-sm text-brand-red-soft">
          {error}
        </p>
      )}

      {/* El contenedor escala visualmente; el nodo exportado mantiene sus 1080px. */}
      <div className="w-full overflow-hidden" style={{ height: SIZE / 2 }}>
        <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}>
          <div
            ref={cardRef}
            style={{ width: SIZE, height: SIZE }}
            className="flex flex-col justify-between bg-ink-950 p-16"
          >
            <header className="flex items-center justify-between">
              <p className="text-4xl font-black tracking-tight text-white">LIDE</p>
              <p className="text-2xl font-medium text-ink-400">
                {[data.stageLabel, data.roundLabel].filter(Boolean).join(' · ') || 'Torneo'}
              </p>
            </header>

            <section className="flex flex-col items-center gap-6">
              <div className="flex w-full items-center justify-between gap-8">
                <TeamName name={data.blueName} won={blueWon} accent="aqua" align="right" />
                <div className="tabular shrink-0 text-center">
                  <p className="text-9xl font-black leading-none">
                    <span className={blueWon ? 'text-brand-aqua' : 'text-ink-500'}>
                      {data.blueKills}
                    </span>
                    <span className="mx-4 text-ink-700">–</span>
                    <span className={redWon ? 'text-brand-red-soft' : 'text-ink-500'}>
                      {data.redKills}
                    </span>
                  </p>
                  <p className="mt-3 text-2xl text-ink-500">
                    {formatDuration(data.durationMs)} · {formatGold(data.blueGold)} vs{' '}
                    {formatGold(data.redGold)} oro
                  </p>
                </div>
                <TeamName name={data.redName} won={redWon} accent="red" align="left" />
              </div>
            </section>

            {data.mvp && (
              <section className="flex items-center gap-8 rounded-2xl border-2 border-ink-800 bg-ink-900 p-8">
                <GameIcon
                  src={data.mvp.championIcon}
                  alt={data.mvp.champion}
                  size={140}
                  className="rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold tracking-widest text-brand-red">MVP</p>
                  <p className="truncate text-5xl font-bold text-white">{data.mvp.name}</p>
                  <p className="mt-1 text-3xl text-ink-400">{data.mvp.champion}</p>
                </div>
                <div className="tabular shrink-0 text-right">
                  <p className="text-5xl font-bold text-white">
                    {formatKda(data.mvp.kills, data.mvp.deaths, data.mvp.assists)}
                  </p>
                  <p className="mt-1 text-2xl text-ink-400">
                    {formatNumber(data.mvp.damage)} de daño
                  </p>
                </div>
              </section>
            )}

            <section className="grid grid-cols-3 gap-6">
              {data.highlights.map((highlight) => (
                <div
                  key={highlight.label}
                  className="flex flex-col gap-3 rounded-2xl border-2 border-ink-800 p-6"
                >
                  <p className="text-xl uppercase tracking-wide text-ink-500">{highlight.label}</p>
                  <p className="tabular text-5xl font-bold text-white">{highlight.value}</p>
                  <div className="flex items-center gap-3">
                    <GameIcon
                      src={highlight.championIcon}
                      alt={highlight.champion}
                      size={44}
                      className="rounded-lg"
                    />
                    <p className="min-w-0 truncate text-2xl text-ink-300">{highlight.player}</p>
                  </div>
                </div>
              ))}
            </section>

            <footer className="flex items-center justify-between text-xl text-ink-600">
              <span>{formatDate(data.playedAt)}</span>
              <span>parche {data.patch ?? '?'}</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamName({
  name,
  won,
  accent,
  align,
}: {
  name: string
  won: boolean
  accent: 'aqua' | 'red'
  align: 'left' | 'right'
}) {
  return (
    <div className={`min-w-0 flex-1 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <p
        className={`truncate text-5xl font-bold ${
          won ? (accent === 'aqua' ? 'text-brand-aqua' : 'text-brand-red-soft') : 'text-ink-400'
        }`}
      >
        {name}
      </p>
      {/* El resultado va escrito, no sólo por color. */}
      <p className="mt-2 text-2xl font-medium text-ink-500">{won ? 'VICTORIA' : 'DERROTA'}</p>
    </div>
  )
}
