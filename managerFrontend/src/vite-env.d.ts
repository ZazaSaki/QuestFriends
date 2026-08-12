/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  /** Public origin of the player SPA, used to build room join links / QR codes. */
  readonly VITE_PLAYER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
