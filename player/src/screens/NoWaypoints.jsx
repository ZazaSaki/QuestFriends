import Icon from '../components/Icon';

/**
 * The team's track has no waypoints, so `next-coordinate` reports `finished`
 * before the team has done anything. That is an authoring gap (a track created
 * without coordinates), not a victory — showing the conclusion here would be a
 * lie, so we say plainly what happened and offer a re-check for when the host
 * fixes it.
 */
export default function NoWaypoints({ teamName, onRetry, busy }) {
  return (
    <main className="px-container-margin pt-section-padding pb-section-padding max-w-2xl mx-auto flex flex-col gap-stack-lg">
      <header className="text-center flex flex-col gap-stack-md items-center">
        <div className="w-24 h-24 rounded-full bg-error-container text-on-error-container flex items-center justify-center">
          <Icon name="wrong_location" fill style={{ fontSize: '48px' }} />
        </div>
        <h2 className="font-headline-lg text-headline-lg text-primary dark:text-primary-fixed">
          Sem waypoints
        </h2>
      </header>

      <div className="mission-card rounded-xl p-6 space-y-stack-md text-center">
        <p className="font-body-lg text-body-lg text-on-surface-variant dark:text-on-primary-container">
          A vossa equipa{teamName ? ` (${teamName})` : ''} está num percurso que ainda
          não tem pontos definidos.
        </p>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Avisem o anfitrião: o percurso precisa de coordenadas no editor do jogo,
          ou a equipa tem de ser movida para outro percurso.
        </p>
      </div>

      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="w-full bg-primary-container text-on-primary font-label-md text-label-md py-4 px-6 rounded-3xl shadow-ambient-lg hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
      >
        <Icon name="refresh" />
        {busy ? 'A verificar…' : 'Verificar Novamente'}
      </button>
    </main>
  );
}
