import Icon from '../components/Icon';
import InformationBlockRenderer from '../components/InformationBlockRenderer';

/**
 * Shown when `GET /api/play/next-coordinate` answers `{ finished: true }` — the
 * team has cleared every waypoint on its track. Renders the game's authored
 * `conclusion` blocks (GET /api/games/:gameId) through the same renderer as
 * quest descriptions, plus the final score.
 */
export default function GameConclusion({ teamName, totalScore, conclusion, onOpenLeaderboard }) {
  return (
    <main className="px-container-margin pt-section-padding pb-section-padding max-w-2xl mx-auto flex flex-col gap-stack-lg">
      <header className="text-center flex flex-col gap-stack-md items-center">
        <div className="w-24 h-24 rounded-full bg-secondary/10 text-secondary flex items-center justify-center">
          <Icon name="trophy" fill style={{ fontSize: '52px' }} />
        </div>
        <span className="inline-block px-4 py-1 rounded-full bg-primary/10 dark:bg-white/10 text-primary dark:text-primary-fixed-dim font-label-sm text-label-sm uppercase tracking-widest">
          Jornada Concluída
        </span>
        <h2 className="font-headline-xl text-headline-xl text-primary dark:text-primary-fixed">
          {teamName}
        </h2>
        <div className="h-1 w-16 bg-secondary mx-auto rounded-full" />
      </header>

      {totalScore != null && (
        <div className="mission-card rounded-xl p-6 text-center">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
            Pontuação Final
          </p>
          <p className="font-headline-xl text-headline-xl text-secondary mt-stack-sm">{totalScore}</p>
        </div>
      )}

      {conclusion && (
        <article className="mission-card p-6 rounded-xl space-y-stack-md text-on-surface-variant dark:text-on-primary-container text-justify">
          <InformationBlockRenderer content={conclusion} dropLeadingImage />
        </article>
      )}

      <button
        type="button"
        onClick={onOpenLeaderboard}
        className="w-full bg-[#d97736] text-on-secondary font-label-md text-label-md py-4 px-6 rounded-3xl shadow-ambient-lg hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        <Icon name="leaderboard" />
        Ver Classificação
      </button>
    </main>
  );
}
