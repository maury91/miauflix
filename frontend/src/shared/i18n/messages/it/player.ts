import type { player as english } from '../en/player';
import type { Translation } from '../types';

export const player: Translation<typeof english> = {
  'player.trying': 'Tentativo con la fonte {position} di {total} per “{title}”…',
  'player.downloadingPart': 'Download di questa parte di “{title}”…',
  'player.converting': 'Conversione di “{title}” per la riproduzione…',
  'player.noSource':
    '“{title}” non è ancora disponibile. Seleziona “Avvisami” per ricevere un avviso appena potrai guardarlo.',
  'player.noRoomMovie':
    'Non c’è abbastanza spazio per riprodurre il film. Libera spazio sul server o aumenta il limite di archiviazione, poi riprova.',
  'player.noRoomEpisode':
    'Non c’è abbastanza spazio per riprodurre l’episodio. Libera spazio sul server o aumenta il limite di archiviazione, poi riprova.',
  'player.failure.unavailable':
    '“{title}” non è ancora disponibile. Riprova più tardi o scegli un altro titolo.',
  'player.failure.session': 'Accedi di nuovo per guardare “{title}”.',
  'player.failure.rateLimited':
    'Troppe richieste per riprodurre “{title}”. Aspetta un attimo e riprova.',
  'player.failure.detail': 'Impossibile riprodurre “{title}”. {detail}',
  'player.failure.offline':
    'Miauflix non riesce a contattare il servizio di riproduzione per “{title}”. Controlla la connessione e riprova.',
  'player.failure.server':
    'Impossibile preparare la fonte per “{title}”. Riprova o scegli un altro titolo.',
  'player.failure.generic': 'Impossibile avviare “{title}”. Riprova.',
  'player.failure.selectedSource':
    'Impossibile caricare la fonte selezionata per “{title}”. Riprova.',
  'player.failure.allSources': 'Nessuna fonte per “{title}” ha funzionato. Riprova.',
  'player.status.checking': 'Verifica delle fonti per “{title}”…',
  'player.status.preparing': 'Preparazione di “{title}”…',
  'player.status.ready': '“{title}” è pronto.',
  'player.status.unavailable': '“{title}” non è ancora disponibile.',
  'player.status.error': 'Impossibile avviare “{title}”.',
  'player.backToDetails': 'Torna ai dettagli',
  'player.logo': 'Logo di Miauflix',
  'player.playFailed': 'Impossibile avviare la riproduzione. Premi di nuovo “Riproduci”.',
  'player.controls': 'Controlli di riproduzione',
  'player.toolbar': 'Barra di riproduzione',
  'player.preparing': 'Preparazione della riproduzione…',
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
  'player.skipCredits': 'Salta i titoli di coda ({seconds} s)',
  'player.watchCredits': 'Guarda i titoli di coda',
  'player.nextEpisode': 'Prossimo episodio',
  'player.playNext': 'Guarda il prossimo episodio ({seconds} s)',
  'player.stay': 'Resta',
  'player.notifyPromised': 'Ti avviseremo appena potrai guardare “{title}”.',
  'player.notifyMe': 'Avvisami',
  'player.notifyFailed': 'Impossibile attivare l’avviso. Riprova.',
  'player.selectedTitle': 'Titolo selezionato',
  'player.audioConversionFailed':
    'Impossibile avviare la conversione dell’audio. Prova a riprodurre di nuovo il video.',
  'player.audioFailed': 'Problema con l’audio. Prova a riprodurre di nuovo il video.',
};
