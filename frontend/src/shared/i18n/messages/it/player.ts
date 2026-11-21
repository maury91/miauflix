import type { player as english } from '../en/player';
import type { Translation } from '../types';

export const player: Translation<typeof english> = {
  'player.trying': 'Provo la fonte {position} di {total} per “{title}”…',
  'player.downloadingPart': 'Scarico questa parte di “{title}”…',
  'player.converting': 'Converto “{title}” per la riproduzione…',
  'player.noSource':
    "Non c'è nessuna fonte per “{title}”. Premi “Avvisami” per ricevere una notifica appena esce.",
  'player.noRoomMovie':
    "Non c'è abbastanza spazio per riprodurre questo film. Libera spazio sul server o aumenta il suo limite di archiviazione, poi riprova.",
  'player.noRoomEpisode':
    "Non c'è abbastanza spazio per riprodurre questo episodio. Libera spazio sul server o aumenta il suo limite di archiviazione, poi riprova.",
  'player.failure.unavailable':
    "Non c'è ancora nessuna fonte riproducibile per “{title}”. Riprova più tardi o scegli un altro titolo.",
  'player.failure.session':
    'La tua sessione non può riprodurre “{title}”. Accedi di nuovo, poi riprova.',
  'player.failure.rateLimited':
    'I controlli di riproduzione per “{title}” sono temporaneamente limitati. Attendi un momento, poi riprova.',
  'player.failure.detail': 'Non è stato possibile avviare “{title}”: {detail}',
  'player.failure.offline':
    'Miauflix non è riuscito a raggiungere il servizio di riproduzione per “{title}”. Controlla la connessione, poi riprova.',
  'player.failure.server':
    'Non è stato possibile preparare la fonte di “{title}”. Riprova o scegli un altro titolo.',
  'player.failure.generic':
    'Non è stato possibile avviare “{title}”. Riprova per preparare di nuovo la fonte.',
  'player.failure.selectedSource':
    'Non è stato possibile caricare la fonte scelta per “{title}”. Riprova per preparare di nuovo la fonte.',
  'player.failure.allSources':
    'Non è stato possibile caricare nessuna fonte di “{title}”. Riprova per preparare di nuovo la fonte.',
  'player.status.checking': 'Controllo le fonti di “{title}”…',
  'player.status.preparing': 'Preparo “{title}” per la riproduzione…',
  'player.status.ready': '“{title}” è pronto.',
  'player.status.unavailable': "Non c'è ancora nessuna fonte riproducibile per “{title}”.",
  'player.status.error': 'Non è stato possibile avviare “{title}”.',
  'player.backToDetails': 'Torna ai dettagli',
  'player.logo': 'Logo di Miauflix',
  'player.playFailed': 'Non è stato possibile avviare la riproduzione. Premi di nuovo Riproduci.',
  'player.controls': 'Controlli di riproduzione',
  'player.toolbar': 'Barra di riproduzione',
  'player.preparing': 'Preparo la riproduzione…',
  'player.seek': 'Avanzamento',
  'player.timeOf': '{position} di {duration}',
  'player.play': 'Riproduci',
  'player.pause': 'Pausa',
  'player.fullscreen': 'Schermo intero',
  'player.fullscreenUnavailable': 'Lo schermo intero non è disponibile in questo browser.',
  'player.mute': 'Disattiva audio',
  'player.unmute': 'Riattiva audio',
  'player.volume': 'Volume',
  'player.label': 'Lettore',
  'player.skipIntro': 'Salta intro',
  'player.credits': 'Titoli di coda',
  'player.skipCredits': 'Salta titoli di coda ({seconds}s)',
  'player.watchCredits': 'Guarda i titoli di coda',
  'player.nextEpisode': 'Prossimo episodio',
  'player.playNext': 'Riproduci il prossimo episodio ({seconds}s)',
  'player.stay': 'Resta',
  'player.notifyPromised': 'Ti avviseremo appena “{title}” sarà disponibile.',
  'player.notifyMe': 'Avvisami',
  'player.notifyFailed': 'Non è stato possibile salvare la notifica. Riprova.',
  'player.selectedTitle': 'Titolo selezionato',
  'player.audioConversionFailed':
    'Impossibile avviare la conversione dell’audio. Riprova la riproduzione.',
  'player.audioFailed': 'Riproduzione dell’audio non riuscita. Riprova la riproduzione.',
};
