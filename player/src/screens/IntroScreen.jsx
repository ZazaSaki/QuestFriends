import Icon from '../components/Icon';
import InformationBlockRenderer from '../components/InformationBlockRenderer';

/**
 * The game's authored `introduction` block (GET /api/games/:gameId), shown once
 * when the host starts the room. Nothing advances on its own: the player reads
 * it and taps through when they are ready.
 *
 * Styled after baseline/stitch_quest_expedition_ui/mission_description_with_media_light.
 */
export default function IntroScreen({ introduction, teamName, onBegin }) {
  return (
    <main className="px-container-margin pt-stack-lg pb-section-padding max-w-2xl mx-auto">
      <div className="mb-stack-lg text-center">
        <span className="inline-block px-3 py-1 bg-primary-container/10 dark:bg-white/10 text-primary-container dark:text-primary-fixed-dim font-label-sm text-label-sm uppercase rounded-full mb-stack-sm tracking-widest">
          {teamName ? `Equipa ${teamName}` : 'Introdução'}
        </span>
        <h2 className="font-headline-xl text-headline-xl text-primary dark:text-primary-fixed mb-stack-sm">
          A Jornada Começa
        </h2>
        <div className="h-1 w-16 bg-secondary mx-auto rounded-full" />
      </div>

      {introduction && (
        <article className="mission-card p-6 rounded-xl mb-stack-lg space-y-stack-md text-on-surface-variant dark:text-on-primary-container text-justify">
          <InformationBlockRenderer content={introduction} dropLeadingImage />
        </article>
      )}

      <div className="text-center mt-stack-lg">
        <button
          type="button"
          onClick={onBegin}
          className="bg-[#d97736] text-on-secondary font-label-md text-label-md px-8 py-4 rounded-3xl shadow-ambient-lg hover:opacity-90 active:scale-95 transition-all w-full flex items-center justify-center gap-2"
        >
          COMEÇAR A JORNADA
          <Icon name="arrow_forward" className="text-[18px]" />
        </button>
      </div>
    </main>
  );
}
