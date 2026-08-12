import { useState } from 'react';
import Icon from '../components/Icon';
import QrScanner from '../components/LazyQrScanner';

/**
 * Converted from baseline/stitch_quest_expedition_ui/quest_access_qr_password.
 *
 * The gate on a locked quest: the team has reached the waypoint, and the quest
 * opens only once the right value is supplied — scanned off a physical QR glyph
 * or typed as a passcode. Both paths call the same `unlock-quest` endpoint, so
 * the parent handles the 403 (wrong value) / 409 (another quest active) cases.
 */
export default function QuestAccess({ mode = 'QR', onUnlock, onBack, busy, error, sequenceOrder }) {
  const [code, setCode] = useState('');
  const [scannerOn, setScannerOn] = useState(mode === 'QR');

  const submit = (e) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    onUnlock(code.trim());
  };

  const handleScan = (text) => {
    setScannerOn(false);
    setCode(text);
    onUnlock(text);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-primary text-on-primary flex flex-col font-body-md antialiased overflow-y-auto selection:bg-secondary-container selection:text-on-secondary-container">
      <header className="w-full top-0 sticky bg-primary z-50 flex items-center justify-between px-container-margin py-stack-md">
        <button
          type="button"
          aria-label="Go Back"
          onClick={onBack}
          className="flex items-center text-on-primary hover:opacity-80 active:scale-95 transition-all"
        >
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-headline-md text-headline-md text-on-primary">Join Quest</h1>
        <div className="w-6 h-6" />
      </header>

      <main className="flex-grow flex flex-col px-container-margin py-stack-lg gap-section-padding">
        <section className="flex flex-col items-center text-center gap-stack-lg w-full max-w-md mx-auto">
          <div className="space-y-stack-sm">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-secondary-container">
              {mode === 'QR' ? 'Scan Glyph' : 'Speak the Word'}
            </h2>
            <p className="font-body-md text-body-md text-primary-fixed-dim">
              {mode === 'QR'
                ? 'Align the sacred marker within the frame to begin your journey.'
                : 'Enter the passcode hidden at this waypoint to begin your journey.'}
              {sequenceOrder ? ` (Waypoint ${sequenceOrder})` : ''}
            </p>
          </div>

          {scannerOn ? (
            <QrScanner onScan={handleScan} className="mt-stack-md" />
          ) : (
            <button
              type="button"
              onClick={() => setScannerOn(true)}
              className="mt-stack-md w-full max-w-[280px] aspect-square rounded-lg border-2 border-dashed border-secondary-container/40 flex flex-col items-center justify-center gap-stack-sm text-primary-fixed-dim hover:border-secondary-container transition-colors"
            >
              <Icon name="qr_code_scanner" className="text-[64px] text-secondary-container/50" />
              <span className="font-label-md text-label-md uppercase">Open Scanner</span>
            </button>
          )}
        </section>

        <div className="flex items-center gap-4 w-full max-w-md mx-auto">
          <div className="flex-1 h-px bg-primary-fixed-dim/20" />
          <span className="font-label-sm text-label-sm text-primary-fixed-dim uppercase">
            Or enter manually
          </span>
          <div className="flex-1 h-px bg-primary-fixed-dim/20" />
        </div>

        <section className="flex flex-col gap-stack-md w-full max-w-md mx-auto mb-stack-lg">
          <form
            onSubmit={submit}
            className={`bg-surface-container-low/5 backdrop-blur-md border border-primary-fixed-dim/20 rounded-xl p-6 flex flex-col gap-stack-md${error ? ' shake' : ''}`}
          >
            <label
              className="font-label-md text-label-md text-secondary-fixed uppercase text-center block w-full"
              htmlFor="quest-code"
            >
              Quest Passcode
            </label>
            <div className="relative w-full">
              <Icon
                name="key"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-fixed-dim"
              />
              {/* The mock upper-cased this as you typed, but the backend
                  compares `challengeValue !== quest.openChallengeValue`
                  exactly — so a lower-case code an author wrote would never
                  match. The value is kept verbatim; only the spacing is styled. */}
              <input
                id="quest-code"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Enter ancient word..."
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-primary border border-primary-fixed-dim/30 rounded-full py-4 pl-12 pr-4 text-center font-body-lg text-body-lg text-on-primary placeholder:text-primary-fixed-dim/50 focus:outline-none focus:border-secondary-container focus:ring-1 focus:ring-secondary-container transition-colors tracking-widest"
              />
            </div>

            {error && (
              <p className="font-label-sm text-label-sm text-error-container text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="w-full bg-secondary-container text-on-secondary-container font-label-md text-label-md rounded-full py-4 px-6 hover:opacity-90 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 mt-stack-sm disabled:opacity-40"
            >
              <Icon name="login" fill />
              {busy ? 'Opening…' : 'Join'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
