import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import Icon from './Icon';

/**
 * Live QR viewfinder inside the Stitch `.scanner-frame` (corner markers + sweep
 * line come from index.css). Uses html5-qrcode, which drives getUserMedia and
 * decodes each frame — works on iOS Safari and Android Chrome alike.
 *
 * The camera only runs while this component is mounted; the parent unmounts it
 * to release the stream.
 */
export default function QrScanner({ onScan, className = '' }) {
  const regionId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState(null);

  useEffect(() => {
    let scanner;
    let stopped = false;

    (async () => {
      try {
        scanner = new Html5Qrcode(regionId, { verbose: false });
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            // Fire once, then let the parent tear us down.
            if (!stopped) {
              stopped = true;
              onScanRef.current?.(decodedText);
            }
          },
          () => {
            /* per-frame "no QR found" — not an error worth surfacing */
          }
        );
      } catch (err) {
        setError(
          err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
            ? 'Camera permission denied — enter the code manually instead.'
            : 'Could not start the camera on this device.'
        );
      }
    })();

    return () => {
      stopped = true;
      // stop() rejects if the camera never started; nothing to clean up then.
      scanner?.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [regionId]);

  return (
    <div className={`relative w-full flex justify-center ${className}`}>
      <div className="scanner-frame bg-black/40 relative z-10 flex items-center justify-center">
        <div id={regionId} className="absolute inset-0" />
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />
        <div className="scanning-line" />
        {error && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-stack-sm px-6 text-center bg-primary/80">
            <Icon name="no_photography" className="text-[40px] text-secondary-container" />
            <p className="font-label-sm text-label-sm text-secondary-fixed">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
