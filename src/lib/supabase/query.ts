import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Leer el resultado de una consulta sin tragarse el error.
 *
 * El patrón `data ?? []` es cómodo y es una trampa: una policy rota, una
 * columna renombrada o Supabase caído devuelven `data: null` con un `error` al
 * lado, y la página termina dibujando su estado vacío. Es decir que "se cayó la
 * base" y "todavía no se jugó nada" se ven exactamente igual, que es lo último
 * que uno quiere un día de partido.
 *
 * Acá el error se lanza y lo levanta el error.tsx del sitio, que muestra qué
 * pasó y ofrece reintentar. Se pierde el render parcial —si falla una de las
 * cuatro consultas de la home, no se ve ninguna— y es a propósito: una tabla de
 * posiciones a la que le falta una consulta no está incompleta, está mal, y
 * mostrarla igual es peor que no mostrar nada.
 *
 * El `que` es lo que va al log del servidor. En producción el mensaje real no
 * viaja al browser, así que sin eso el `digest` del error no lleva a ningún
 * lado.
 */
interface Result<T> {
  data: T | null
  error: PostgrestError | null
}

function boom(que: string, error: PostgrestError): never {
  throw new Error(`No se pudo leer ${que}: ${error.message} (${error.code})`, { cause: error })
}

/** Las filas de un listado. Vacío es un resultado válido; un error no. */
export function rows<T>(result: Result<T[]>, que: string): T[] {
  if (result.error) boom(que, result.error)
  return result.data ?? []
}

/**
 * Una fila que puede no existir (`maybeSingle`).
 *
 * Devolver null es legítimo —un equipo que no existe da 404, no error— así que
 * acá sólo se distingue "no está" de "no se pudo preguntar".
 */
export function maybeRow<T>(result: Result<T>, que: string): T | null {
  if (result.error) boom(que, result.error)
  return result.data
}
