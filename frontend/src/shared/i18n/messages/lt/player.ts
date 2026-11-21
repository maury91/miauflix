import type { player as english } from '../en/player';
import type { Translation } from '../types';

export const player: Translation<typeof english> = {
  'player.trying': 'Bandomas „{title}“ šaltinis {position} iš {total}…',
  'player.downloadingPart': 'Atsisiunčiama „{title}“ dalis…',
  'player.converting': '„{title}“ konvertuojamas, kad būtų galima atkurti…',
  'player.noSource':
    '„{title}“ dar negalima žiūrėti. Pasirinkite „Pranešti man“, jei norite gauti pranešimą, kai kūrinys bus pasiekiamas.',
  'player.noRoomMovie':
    'Šiam filmui atkurti nepakanka vietos. Atlaisvinkite vietos serveryje arba padidinkite saugyklos limitą ir bandykite dar kartą.',
  'player.noRoomEpisode':
    'Šiai serijai atkurti nepakanka vietos. Atlaisvinkite vietos serveryje arba padidinkite saugyklos limitą ir bandykite dar kartą.',
  'player.failure.unavailable':
    '„{title}“ dar negalima žiūrėti. Bandykite vėliau arba pasirinkite ką nors kita.',
  'player.failure.session': 'Prisijunkite dar kartą, kad galėtumėte žiūrėti „{title}“.',
  'player.failure.rateLimited':
    'Per daug „{title}“ atkūrimo patikrų. Šiek tiek palaukite ir bandykite dar kartą.',
  'player.failure.detail': 'Nepavyko paleisti „{title}“. {detail}',
  'player.failure.offline':
    '„Miauflix“ nepavyko susisiekti su „{title}“ atkūrimo paslauga. Patikrinkite ryšį ir bandykite dar kartą.',
  'player.failure.server':
    'Nepavyko paruošti „{title}“ šaltinio. Bandykite dar kartą arba pasirinkite ką nors kita.',
  'player.failure.generic': 'Nepavyko paleisti „{title}“. Bandykite dar kartą.',
  'player.failure.selectedSource':
    'Nepavyko įkelti pasirinkto „{title}“ šaltinio. Bandykite dar kartą.',
  'player.failure.allSources':
    'Nepavyko paleisti „{title}“ iš nė vieno šaltinio. Bandykite dar kartą.',
  'player.status.checking': 'Tikrinami „{title}“ šaltiniai…',
  'player.status.preparing': '„{title}“ ruošiamas atkurti…',
  'player.status.ready': '„{title}“ jau galima žiūrėti.',
  'player.status.unavailable': '„{title}“ dar negalima žiūrėti.',
  'player.status.error': 'Nepavyko paleisti „{title}“.',
  'player.backToDetails': 'Grįžti prie kūrinio informacijos',
  'player.logo': '„Miauflix“ logotipas',
  'player.playFailed': 'Nepavyko pradėti atkūrimo. Dar kartą paspauskite „Leisti“.',
  'player.controls': 'Atkūrimo valdikliai',
  'player.toolbar': 'Atkūrimo įrankių juosta',
  'player.preparing': 'Ruošiamas atkūrimas…',
  'player.seek': 'Keisti atkūrimo vietą',
  'player.timeOf': '{position} iš {duration}',
  'player.play': 'Leisti',
  'player.pause': 'Pristabdyti',
  'player.fullscreen': 'Įjungti arba išjungti viso ekrano režimą',
  'player.fullscreenUnavailable': 'Šioje naršyklėje viso ekrano režimas nepasiekiamas.',
  'player.mute': 'Nutildyti',
  'player.unmute': 'Įjungti garsą',
  'player.volume': 'Garsumas',
  'player.label': 'Leistuvas',
  'player.skipIntro': 'Praleisti įžangą',
  'player.credits': 'Pabaigos titrai',
  'player.skipCredits': 'Praleisti titrus ({seconds} sek.)',
  'player.watchCredits': 'Žiūrėti titrus',
  'player.nextEpisode': 'Kita serija',
  'player.playNext': 'Žiūrėti kitą seriją ({seconds} sek.)',
  'player.stay': 'Likti čia',
  'player.notifyPromised': 'Pranešime, kai „{title}“ bus galima žiūrėti.',
  'player.notifyMe': 'Pranešti man',
  'player.notifyFailed': 'Nepavyko įjungti pranešimo. Pabandykite dar kartą.',
  'player.selectedTitle': 'Pasirinktas kūrinys',
  'player.audioConversionFailed':
    'Nepavyko pradėti garso konvertavimo. Pabandykite paleisti vaizdo įrašą dar kartą.',
  'player.audioFailed': 'Nepavyko atkurti garso. Pabandykite paleisti vaizdo įrašą dar kartą.',
};
