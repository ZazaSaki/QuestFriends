import { Suspense, lazy } from 'react';

// html5-qrcode bundles its own decoder and roughly triples the entry chunk, so
// it is fetched only when a scanner is actually opened — players load this app
// over cellular, often with one bar.
const QrScanner = lazy(() => import('./QrScanner'));

export default function LazyQrScanner(props) {
  return (
    <Suspense
      fallback={
        <div className="relative w-full flex justify-center">
          <div className="scanner-frame bg-black/40 flex items-center justify-center">
            <span className="font-label-sm text-label-sm text-secondary-fixed uppercase tracking-widest">
              A abrir a câmara…
            </span>
          </div>
        </div>
      }
    >
      <QrScanner {...props} />
    </Suspense>
  );
}
