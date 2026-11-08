// Game-portal hooks. CrazyGames and Poki give games a small SDK for "the game
// is loading / being played / paused" signals and for ads between levels.
// On any other site (itch.io, your own page) every call here does nothing.

type Fn = () => void;

interface CrazySDK {
  init(): Promise<void>;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?(cb: (s: { muteAudio?: boolean }) => void): void;
  };
  ad: { requestAd(kind: 'midgame' | 'rewarded', cb: { adStarted?: Fn; adFinished?: Fn; adError?: (e: unknown) => void }): void };
}
interface PokiSDK {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(before?: Fn): Promise<void>;
  setDebug?(v: boolean): void;
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazySDK };
    PokiSDK?: PokiSDK;
  }
}

/** Where we're embedded, from our own address or the page that framed us. */
function host(): string {
  const parts = [location.hostname, document.referrer];
  try {
    const ao = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
    if (ao) for (let i = 0; i < ao.length; i++) parts.push(ao[i]);
  } catch {
    /* not available */
  }
  return parts.join(' ').toLowerCase();
}

function load(src: string): Promise<void> {
  return new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => bad(new Error('SDK failed to load'));
    document.head.append(s);
  });
}

let crazy: CrazySDK | null = null;
let poki: PokiSDK | null = null;
let playing = false;

export const portal = {
  name: 'web' as 'crazygames' | 'poki' | 'web',

  async init(): Promise<void> {
    const where = host();
    try {
      if (/crazygames/.test(where)) {
        await load('https://sdk.crazygames.com/crazygames-sdk-v3.js');
        crazy = window.CrazyGames!.SDK;
        await crazy.init();
        crazy.game.loadingStart();
        this.name = 'crazygames';
      } else if (/poki/.test(where)) {
        await load('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
        poki = window.PokiSDK!;
        await poki.init();
        this.name = 'poki';
      }
    } catch {
      crazy = poki = null; // an ad blocker can stop the SDK; the game still works
    }
  },

  /** The portal's own "mute audio" setting (CrazyGames), now and when it changes. */
  onMute(cb: (muted: boolean) => void): void {
    if (!crazy) return;
    cb(!!crazy.game.settings?.muteAudio);
    crazy.game.addSettingsChangeListener?.((st) => cb(!!st.muteAudio));
  },

  loaded(): void {
    crazy?.game.loadingStop();
    poki?.gameLoadingFinished();
  },

  start(): void {
    if (playing) return;
    playing = true;
    crazy?.game.gameplayStart();
    poki?.gameplayStart();
  },

  stop(): void {
    if (!playing) return;
    playing = false;
    crazy?.game.gameplayStop();
    poki?.gameplayStop();
  },

  /** A finished picture: CrazyGames' little celebration hook. */
  celebrate(): void {
    crazy?.game.happytime();
  },

  /** Between puzzles: the portal may show an ad. Sound is muted while it plays. */
  async breakBetween(mute: (v: boolean) => void): Promise<void> {
    if (poki) {
      await poki.commercialBreak(() => mute(true)).catch(() => {});
      mute(false);
    } else if (crazy) {
      await new Promise<void>((done) =>
        crazy!.ad.requestAd('midgame', {
          adStarted: () => mute(true),
          adFinished: () => (mute(false), done()),
          adError: () => (mute(false), done()),
        }),
      );
    }
  },
};
