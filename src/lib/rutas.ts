/**
 * Las rutas del sitio, armadas en un solo lugar.
 *
 * Los links a la ficha de un jugador salen de siete lugares distintos —el
 * plantel de un equipo, el scoreboard, el detalle de una partida, dos tablas de
 * estadísticas, dos rankings—, y mientras estén escritos a mano en cada uno,
 * mover esa página es encontrarlos todos.
 *
 * SOBRE EL ID QUE VIAJA EN LA URL: es `players.id`, un uuid interno que no
 * significa nada afuera. NO es el `puuid`, que es el identificador de Riot con
 * el que se le pueden pedir datos a su API sobre esa persona: ése no sale del
 * servidor —ninguna vista pública lo expone, ver 0013_publico.sql— y por eso la
 * ficha se busca por `player_profiles` y no por `players`.
 */

export function rutaJugador(playerId: string): string {
  return `/jugadores/${playerId}`
}

export function rutaEquipo(teamId: string): string {
  return `/equipos/${teamId}`
}

export function rutaPartida(matchId: string): string {
  return `/partidas/${matchId}`
}
