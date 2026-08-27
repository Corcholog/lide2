/**
 * Los 113 inscriptos, tal como figuran en las planillas de la organización.
 *
 * Los nombres van **verbatim**, sin corregir. La planilla mezcla formatos —hay
 * "Apellido, Nombre" (equipo 02), "Apellido Nombre" sin coma (equipos 03 y 11) y
 * varios en mayúsculas— y adivinar cuál token es el apellido para darlos vuelta
 * es una forma barata de escribirle mal el nombre a alguien. Se guardan como
 * estan y la tabla `team_roster` tiene un `display_name` aparte para que un
 * administrador los deje prolijos sin perder el original.
 *
 * La única corrección es "Maximiliano Antonio ZemelkaUNAHUR" en el equipo 09:
 * ahí la sigla de la universidad quedó pegada al nombre al copiar la planilla, y
 * no es parte del nombre.
 *
 * Esto NO es lo mismo que `players`, que son cuentas de Riot detectadas de los
 * replays. Un inscripto y una cuenta se emparejan a mano desde el panel; hasta
 * entonces son dos listas separadas.
 */

import type { UniversityTag } from './tournament'

export interface RosterEntry {
  /** Como figura en la planilla, sin tocar. */
  name: string
  university: UniversityTag
}

/** Atajo para los equipos donde todos son de la misma casa, que son la mayoría. */
function roster(university: UniversityTag, ...names: string[]): RosterEntry[] {
  return names.map((name) => ({ name, university }))
}

/** Planteles por número de equipo. Varios anotaron suplentes. */
export const ROSTERS: Record<number, RosterEntry[]> = {
  1: roster(
    'UNLP',
    'Marcelo Condori',
    'Facundo Raúl Subijana',
    'Josías Emanuel Segovia',
    'Tomás Manuel Sabella',
    'Giorgio Ivan Loguercio',
  ),

  2: roster(
    'UNLP',
    'Torres, Agustina Lucia',
    'Sanz, Francisco',
    'Tartaglia Morras, Manuel',
    'Gorostidi, Felipe',
    'Sacco, Nicolas Facundo',
  ),

  3: roster(
    'UNLP',
    'Lautaro Torchia',
    'Juan Diego Chafloque Del Castillo',
    'Botteri Valentin',
    'Mateo Quaresimale',
    'Fermín Villarreal',
    'Martinez Rodrigo',
    'Zegarra Alexander',
  ),

  4: roster(
    'UNLP',
    'Diego Fernando Rey Rodriguez Cifuentes',
    'JOSIAS IBAÑEZ CONTRERAS',
    'DAVID ALCIDES MAILA LLUMIQUINGA',
    'DANIELA SANDOVAL',
    'GERMÁN ARIEL MENDOZA VARILLAS',
  ),

  5: roster(
    'UAI',
    'Gonzalo Biagioni',
    'Denis Tarulli',
    'Pablo Cruz',
    'Mateo Masci',
    'Agustin Ezequiel Nuñez',
    'Ignacio De Giacomo',
    'Tiziano Mancini',
  ),

  6: roster(
    'UNAM',
    'Juan Manuel Strieder',
    'Eugenio Lopez',
    'Fabricio Wlodeck',
    'Alexis Sebastian Pereyra',
    'Facundo Nahuel Barrios',
  ),

  7: roster(
    'UNRN',
    'Tania Valicenti',
    'Manuel Krause',
    'Tomas Bizzarri',
    'Ignacio heit',
    'Nicolas Agustin Berger',
    'German Caudet',
  ),

  8: roster(
    'UNRN',
    'Federico Costa Brutten',
    'Agustín Vinacua',
    'Mateo Lihuen Palma Castillo',
    'Juan Manuel Mamani',
    'Alejo Emiliano Mancuso',
    'Facundo Molina Corujo',
  ),

  9: roster(
    'UNAHUR',
    'Facundo Lionel Pedraza',
    'Layla Barrera',
    'Ella Di Martino',
    'Kevin Rodrigo Venezia',
    'Maximiliano Antonio Zemelka',
    'Matias Leonardo Orduna',
  ),

  10: roster(
    'UNAHUR',
    'Julian David Sanchez Avalos',
    'Alan Ramiro Aguayo',
    'Vicente Salvador Esteche Benitez',
    'Luciano Nicolas Mareco',
    'Florencia Ayelen Racedo',
    'Valentín Fidel Coradeghini',
  ),

  11: roster(
    'UNDAV',
    'Diaz Gustavo',
    'jaymez ian',
    'MASSIMINO MATÍAS NICOLÁS',
    'VALIN AGUSTIN MAXIMILIANO',
    'Juan Moreyra',
    'Nelson Cortes',
    'Juan Martín Freites',
  ),

  12: roster(
    'UNLaM',
    'Juan Heredia',
    'Lucas Calvet',
    'Facundo Pelozo',
    'Fabrizio Augusto Altamirano',
    'Ivan Roldan',
  ),

  // Los cuatro que siguen salieron de inscripciones individuales: la
  // organización armó equipos juntando gente de distintas universidades.
  13: [
    { name: 'Christian Barreto', university: 'UAP' },
    { name: 'Ezequiel Zunino', university: 'UAP' },
    { name: 'Patricio Heyde', university: 'UAP' },
    { name: 'Marcos Cazzulino', university: 'UNER' },
    { name: 'Lucio Turinetto', university: 'UNER' },
  ],

  14: roster(
    'UNLP',
    'Renzo Zylas de Magalhaes',
    'Luis Antonio Giaccio',
    'Valentin Alarcon',
    'Lautaro Petrullo',
    'Lisandro Giani',
  ),

  15: [
    { name: 'Denis Chang', university: 'UNER' },
    { name: 'Alexis Maximiliano Costas', university: 'UNER' },
    { name: 'Maria Teresita pereyra potel', university: 'UNER' },
    { name: 'Fernando Luis Guzmán Rivadineira', university: 'UNLP' },
    { name: 'Gabriel Pareja', university: 'UADE' },
  ],

  16: [
    { name: 'Lucia Zuleta', university: 'UAI' },
    { name: 'Alejo Burne', university: 'UAI' },
    { name: 'Edwin Jorge King', university: 'UAI' },
    { name: 'Octavio Girardelli', university: 'UNLP' },
    { name: 'Joxe Olave', university: 'UNLP' },
  ],

  17: [
    { name: 'Ludmila Abigail Etchetto', university: 'UNLu' },
    { name: 'Franco Manglano', university: 'UNLu' },
    { name: 'bautista galindez testa', university: 'UNLu' },
    { name: 'Sebastian Schmidgall', university: 'UNAM' },
    { name: 'Federico Williamson', university: 'UNCuyo' },
  ],

  18: roster(
    'UNLP',
    'Valentin Montes de Oca',
    'Ivan Lamonega',
    'Francisco leonhardt battista',
    'Fabrizio Barrios',
    'Heitor Leite Perruzzetto RIbeiro',
  ),

  19: roster(
    'UNPAZ',
    'Eliel Lorenzo',
    'facundo martinez',
    'Agustina Asisa',
    'Nahuel Martinez',
    'Brandon Vera',
    'Joaquin velasquez',
  ),

  20: roster(
    'UNPAZ',
    'Alex De los santos',
    'Oscar Nahuel Rodríguez',
    'Tomás Trujillo',
    'Aaron Lautaro Benjamín',
    'Agustin Almiron',
    'Thiago Alcaraz',
    'Nahuel Ariel Mac Farlin',
  ),
}
