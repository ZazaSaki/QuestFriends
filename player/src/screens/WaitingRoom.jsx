import { useState } from 'react';
import Icon from '../components/Icon';
import QrScanner from '../components/LazyQrScanner';

/**
 * Converted from baseline/stitch_quest_expedition_ui/waiting_room (+ _dark).
 *
 * Two states in one screen, as the mock implies:
 *  - `joined === false` → Room ID entry / QR scan.
 *  - `joined === true`  → team lobby: pulsing lantern, "Waiting for Host…",
 *                          until the server emits `game_started`.
 *
 * The mock drew a 6-character code box, but rooms are identified by their UUID
 * (`391ee1a1-7478-45c1-8ca7-776a71cd36fd`) and `Room.id` is a case-sensitive
 * String column — so the value is never truncated or upper-cased. Scanning the
 * QR or opening a `?room=<id>` link is the realistic path; the field is the
 * fallback for someone reading an id aloud.
 */
export default function WaitingRoom({
  joined,
  teamName,
  username,
  onJoin,
  busy,
  error,
  initialRoomId = '',
}) {
  const [roomId, setRoomId] = useState(initialRoomId);
  const [name, setName] = useState('');
  const [scanning, setScanning] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!roomId.trim() || !name.trim() || busy) return;
    onJoin(roomId.trim(), name.trim());
  };

  // A room QR may hold the bare UUID or a join link like
  // https://host/?room=391ee1a1-7478-45c1-8ca7-776a71cd36fd — take it verbatim.
  const handleScan = (text) => {
    setScanning(false);
    let value = text.trim();
    try {
      const url = new URL(value);
      value = url.searchParams.get('room') || url.pathname.split('/').filter(Boolean).pop() || value;
    } catch {
      /* not a URL — use the raw payload */
    }
    setRoomId(value.trim());
  };

  return (
    <>
      <div className="flex justify-center items-center py-6 px-container-margin md:hidden" />

      <main className="max-w-md mx-auto px-container-margin pt-stack-lg flex flex-col gap-stack-lg">
        <div className="text-center flex flex-col gap-stack-md">
          <h2 className="font-headline-xl text-headline-xl text-primary dark:text-primary-fixed font-bold">
            {joined ? 'You’re In' : 'Join Room'}
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant dark:text-on-primary-container max-w-[280px] mx-auto">
            {joined
              ? 'Your team is assembled. The quest begins when the host starts the room.'
              : 'Enter a room code or scan the QR code to join your team.'}
          </p>
        </div>

        {!joined && (
          <>
            <form
              onSubmit={submit}
              className="bg-surface-container-lowest dark:bg-white/5 rounded-xl ambient-shadow-md p-6 flex flex-col gap-stack-md"
            >
              <div className="flex flex-col gap-stack-sm">
                <label
                  className="font-label-md text-label-md text-primary dark:text-primary-fixed uppercase"
                  htmlFor="roomId"
                >
                  Room ID
                </label>
                <input
                  id="roomId"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={64}
                  placeholder="Paste the room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="brand-input w-full px-4 py-3 rounded-lg font-mono text-[13px] leading-5 placeholder:text-outline-variant placeholder:font-body-md text-center"
                />
                <p className="font-label-sm text-label-sm text-on-surface-variant text-center">
                  Scan the room QR below — it fills this in for you.
                </p>
              </div>

              <div className="flex flex-col gap-stack-sm">
                <label
                  className="font-label-md text-label-md text-primary dark:text-primary-fixed uppercase"
                  htmlFor="username"
                >
                  Your Name
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="nickname"
                  maxLength={24}
                  placeholder="How your team knows you"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="brand-input w-full px-4 py-3 rounded-lg font-body-lg text-body-lg placeholder:text-outline-variant text-center"
                />
              </div>

              {error && (
                <p className="font-label-sm text-label-sm text-error dark:text-error-container text-center">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !roomId.trim() || !name.trim()}
                className="w-full bg-[#d97736] text-surface-container-lowest font-label-md text-label-md uppercase py-4 rounded-3xl hover:opacity-90 transition-opacity shadow-md flex items-center justify-center gap-unit disabled:opacity-40"
              >
                {busy ? 'Joining…' : 'Join Room'}
                <Icon name="arrow_forward" className="text-[18px]" />
              </button>
            </form>

            <div className="flex items-center gap-4 py-2">
              <div className="h-px bg-outline-variant/30 flex-1" />
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">OR</span>
              <div className="h-px bg-outline-variant/30 flex-1" />
            </div>

            <div className="bg-surface-container-lowest dark:bg-white/5 rounded-xl ambient-shadow-md p-6 flex flex-col gap-stack-md">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-primary dark:text-primary-fixed">
                    Scan QR Code
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Use your camera
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={scanning ? 'Stop scanning' : 'Scan QR code'}
                  onClick={() => setScanning((s) => !s)}
                  className="w-12 h-12 bg-[#283b31] rounded-full flex items-center justify-center text-surface-container-lowest shadow-md hover:scale-105 transition-transform"
                >
                  <Icon name={scanning ? 'close' : 'qr_code_scanner'} className="text-[24px]" />
                </button>
              </div>
              {scanning && <QrScanner onScan={handleScan} />}
            </div>
          </>
        )}

        {/* Status / Illustration */}
        <div className="mt-stack-md flex flex-col items-center justify-center gap-stack-md py-stack-lg">
          <div className="relative w-32 h-32 rounded-full bg-primary-fixed/20 dark:bg-white/5 flex items-center justify-center overflow-hidden">
            {/* The mock's lantern illustration, as a glyph — no remote asset. */}
            <Icon
              name="lightbulb"
              fill
              className="text-primary dark:text-primary-fixed-dim opacity-80"
              style={{ fontSize: '72px' }}
            />
          </div>
          <div className="flex items-center gap-unit">
            <div className="w-2 h-2 rounded-full bg-[#d97736] pulse-dot" />
            <span className="font-body-md text-body-md text-on-surface-variant italic">
              {joined ? 'Waiting for Host…' : 'Not connected yet'}
            </span>
          </div>
          {joined && (
            <div className="text-center">
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
                Your Team
              </p>
              <p className="font-headline-md text-headline-md text-primary dark:text-primary-fixed">
                {teamName}
              </p>
              {username && (
                <p className="font-body-md text-body-md text-on-surface-variant italic mt-stack-sm">
                  Playing as {username}
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
