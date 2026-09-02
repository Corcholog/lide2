/**
 * The 113 signups, exactly as they appear on the organizers' sheets.
 *
 * The names go in **verbatim**, uncorrected. The sheet mixes formats - there is
 * "Surname, Name" (team 02), "Surname Name" with no comma (teams 03 and 11) and
 * several in all caps - and guessing which token is the surname in order to
 * flip them is a cheap way to misspell somebody's name. They are stored as they
 * came and the `team_roster` table has a separate `display_name` so an admin
 * can tidy them up without losing the original.
 *
 * The one correction is "Maximiliano Antonio ZemelkaUNAHUR" on team 09: there
 * the university tag got stuck to the name while copying the sheet, and it is
 * not part of the name.
 *
 * This is NOT the same as `players`, which are Riot accounts detected from the
 * replays. A signup and an account are matched by hand from the admin panel;
 * until then they are two separate lists.
 */

import type { UniversityTag } from './tournament'

export interface RosterEntry {
  /** As it appears on the sheet, untouched. */
  name: string
  university: UniversityTag
}

/** Shortcut for the teams where everybody is from the same university, which is most of them. */
function roster(university: UniversityTag, ...names: string[]): RosterEntry[] {
  return names.map((name) => ({ name, university }))
}

/** Rosters by team number. Several signed up substitutes. */
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

  // The four that follow came out of individual signups: the organizers built
  // teams by putting together people from different universities.
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
