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
 * The one correction is "Inscripto 09-5UNAHUR" on team 09: there
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
    'Paula Ibarra',
    'Inscripto 01-2',
    'Inscripto 01-3',
    'Inscripto 01-4',
    'Inscripto 01-5',
  ),

  2: roster(
    'UNLP',
    'Inscripto 02-1',
    'Inscripto 02-2',
    'Inscripto 02-3',
    'Inscripto 02-4',
    'Inscripto 02-5',
  ),

  3: roster(
    'UNLP',
    'Inscripto 03-1',
    'Inscripto 03-2',
    'Inscripto 03-3',
    'Inscripto 03-4',
    'Inscripto 03-5',
    'Inscripto 03-6',
    'Inscripto 03-7',
  ),

  4: roster(
    'UNLP',
    'Inscripto 04-1',
    'Inscripto 04-2',
    'Inscripto 04-3',
    'Inscripto 04-4',
    'Inscripto 04-5',
  ),

  5: roster(
    'UAI',
    'Inscripto 05-1',
    'Inscripto 05-2',
    'Inscripto 05-3',
    'Inscripto 05-4',
    'Inscripto 05-5',
    'Inscripto 05-6',
    'Inscripto 05-7',
  ),

  6: roster(
    'UNAM',
    'Inscripto 06-1',
    'Inscripto 06-2',
    'Inscripto 06-3',
    'Inscripto 06-4',
    'Inscripto 06-5',
  ),

  7: roster(
    'UNRN',
    'Inscripto 07-1',
    'Inscripto 07-2',
    'Inscripto 07-3',
    'Inscripto 07-4',
    'Inscripto 07-5',
    'Inscripto 07-6',
  ),

  8: roster(
    'UNRN',
    'Inscripto 08-1',
    'Inscripto 08-2',
    'Inscripto 08-3',
    'Inscripto 08-4',
    'Inscripto 08-5',
    'Inscripto 08-6',
  ),

  9: roster(
    'UNAHUR',
    'Inscripto 09-1',
    'Inscripto 09-2',
    'Inscripto 09-3',
    'Inscripto 09-4',
    'Inscripto 09-5',
    'Inscripto 09-6',
  ),

  10: roster(
    'UNAHUR',
    'Inscripto 10-1',
    'Inscripto 10-2',
    'Inscripto 10-3',
    'Inscripto 10-4',
    'Inscripto 10-5',
    'Inscripto 10-6',
  ),

  11: roster(
    'UNDAV',
    'Inscripto 11-1',
    'Inscripto 11-2',
    'Inscripto 11-3',
    'Inscripto 11-4',
    'Inscripto 11-5',
    'Inscripto 11-6',
    'Inscripto 11-7',
  ),

  12: roster(
    'UNLaM',
    'Inscripto 12-1',
    'Inscripto 12-2',
    'Inscripto 12-3',
    'Inscripto 12-4',
    'Inscripto 12-5',
  ),

  // The four that follow came out of individual signups: the organizers built
  // teams by putting together people from different universities.
  13: [
    { name: 'Inscripto 13-1', university: 'UAP' },
    { name: 'Inscripto 13-2', university: 'UAP' },
    { name: 'Inscripto 13-3', university: 'UAP' },
    { name: 'Inscripto 13-4', university: 'UNER' },
    { name: 'Inscripto 13-5', university: 'UNER' },
  ],

  14: roster(
    'UNLP',
    'Inscripto 14-1',
    'Inscripto 14-2',
    'Inscripto 14-3',
    'Inscripto 14-4',
    'Inscripto 14-5',
  ),

  15: [
    { name: 'Dario Ferro', university: 'UNER' },
    { name: 'Andrea Sol Aranda', university: 'UNER' },
    { name: 'Mariel Beatriz ferrari soto', university: 'UNER' },
    { name: 'Fabián Tadeo Echeverría Ocampo', university: 'UNLP' },
    { name: 'Gregorio Aguilar', university: 'UADE' },
  ],

  16: [
    { name: 'Inscripto 16-1', university: 'UAI' },
    { name: 'Inscripto 16-2', university: 'UAI' },
    { name: 'Inscripto 16-3', university: 'UAI' },
    { name: 'Inscripto 16-4', university: 'UNLP' },
    { name: 'Inscripto 16-5', university: 'UNLP' },
  ],

  17: [
    { name: 'Inscripto 17-1', university: 'UNLu' },
    { name: 'Inscripto 17-2', university: 'UNLu' },
    { name: 'Inscripto 17-3', university: 'UNLu' },
    { name: 'Inscripto 17-4', university: 'UNAM' },
    { name: 'Inscripto 17-5', university: 'UNCuyo' },
  ],

  18: roster(
    'UNLP',
    'Inscripto 18-1',
    'Inscripto 18-2',
    'Inscripto 18-3',
    'Inscripto 18-4',
    'Inscripto 18-5',
  ),

  19: roster(
    'UNPAZ',
    'Inscripto 19-1',
    'Inscripto 19-2',
    'Inscripto 19-3',
    'Inscripto 19-4',
    'Inscripto 19-5',
    'Inscripto 19-6',
  ),

  20: roster(
    'UNPAZ',
    'Inscripto 20-1',
    'Inscripto 20-2',
    'Inscripto 20-3',
    'Inscripto 20-4',
    'Inscripto 20-5',
    'Inscripto 20-6',
    'Inscripto 20-7',
  ),
}
