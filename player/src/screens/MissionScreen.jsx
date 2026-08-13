import Icon from '../components/Icon';
import InformationBlockRenderer from '../components/InformationBlockRenderer';
import ChallengeBlocks from '../components/ChallengeBlocks';
import { formatDistance } from '../lib/geo';

/**
 * Converted from baseline/stitch_quest_expedition_ui/mission_screen (+ _dark)
 * and mission_description_with_media_light.
 *
 * Renders whichever face of the quest the state machine is on:
 *   LOCKED     → hunting the waypoint (no content revealed — server-side rule)
 *   ACTIVE     → description blocks + the challenge (quiz here, camera elsewhere)
 *   SUBMITTED  → media is with the staff, awaiting review
 *   REWARD     → postChallengeContent, then on to the next waypoint
 */
export default function MissionScreen({
  questState,
  quest,
  target,
  distance,
  insideRadius,
  geoError,
  reward,
  onOpenQuest,
  onOpenCamera,
  onSubmitQuiz,
  onContinue,
  onOpenCompass,
  busy,
  error,
  notice,
}) {
  return (
    <main className="flex-grow px-container-margin pt-stack-lg pb-section-padding md:max-w-2xl md:mx-auto w-full">
      {notice && (
        <div className="mb-stack-md rounded-[16px] bg-secondary/10 border border-secondary/30 px-4 py-3 flex items-center gap-3">
          <Icon name="info" className="text-secondary" fill />
          <p className="font-body-md text-body-md text-on-surface dark:text-inverse-on-surface">
            {notice}
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {questState === 'LOCKED' && (
        <article className="mission-card rounded-[24px] p-6 transition-transform duration-300 active:scale-[0.98]">
          <header className="mb-stack-md flex justify-between items-start">
            <div>
              <span className="inline-block bg-primary-container/10 dark:bg-white/10 text-primary-container dark:text-primary-fixed-dim font-label-sm text-label-sm px-3 py-1 rounded-full mb-2 uppercase">
                {target?.sequenceOrder ? `Waypoint ${target.sequenceOrder}` : 'Próximo Waypoint'}
              </span>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary dark:text-primary-fixed">
                Encontre o Local
              </h2>
            </div>
            <div className="bg-secondary/10 text-secondary p-2 rounded-full flex items-center justify-center">
              <Icon name="explore_nearby" fill />
            </div>
          </header>

          <p className="font-body-md text-on-surface-variant dark:text-on-primary-container mb-stack-lg">
            Siga o compasso até ao ponto sagrado. A missão só se revela quando lá
            chegar — a descrição fica selada até então.
          </p>

          {/* Live distance readout, fed by useGeolocation in App.jsx */}
          <div className="bg-surface dark:bg-white/5 p-4 rounded-[16px] mb-stack-lg border border-outline-variant/50 dark:border-white/10">
            <div className="flex justify-between items-center mb-2">
              <span className="font-label-sm text-label-sm text-on-surface dark:text-inverse-on-surface uppercase">
                Distância
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {target?.radius ? `raio ${Math.round(target.radius)} m` : ''}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-lg text-headline-lg text-primary dark:text-primary-fixed">
                {formatDistance(distance)}
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant uppercase">
                {distance != null && distance >= 1000 ? 'km' : 'm'}
              </span>
            </div>
            {geoError && (
              <p className="font-label-sm text-label-sm text-error dark:text-error-container mt-2">
                {geoError}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenCompass}
            className="w-full mb-stack-md border-2 border-primary dark:border-primary-fixed-dim text-primary dark:text-primary-fixed font-label-md text-label-md py-4 px-6 rounded-3xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Icon name="navigation" fill />
            Abrir Compasso
          </button>

          <button
            type="button"
            disabled={busy || !insideRadius}
            onClick={onOpenQuest}
            className="w-full bg-primary-container text-on-primary font-label-md text-label-md py-4 px-6 rounded-3xl shadow-ambient-lg hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Icon name={insideRadius ? 'lock_open' : 'lock'} />
            {insideRadius ? 'Abrir Missão' : 'Aproxime-se do local'}
          </button>

          {error && (
            <p className="font-label-md text-label-md text-error dark:text-error-container text-center mt-stack-md">
              {error}
            </p>
          )}
        </article>
      )}

      {/* ---------------------------------------------------------------- */}
      {(questState === 'ACTIVE' || questState === 'SUBMITTED') && quest && (
        <>
          <div className="mb-stack-lg text-center">
            <span className="inline-block px-3 py-1 bg-primary-container/10 dark:bg-white/10 text-primary-container dark:text-primary-fixed-dim font-label-sm text-label-sm uppercase rounded-full mb-stack-sm tracking-widest">
              {quest.sequenceOrder ? `Missão ${String(quest.sequenceOrder).padStart(2, '0')}` : 'Missão Ativa'}
            </span>
            <h2 className="font-headline-xl text-headline-xl text-primary dark:text-primary-fixed mb-stack-sm">
              {quest.title}
            </h2>
            <div className="h-1 w-16 bg-secondary mx-auto rounded-full" />
          </div>

          {/* Description blocks. dropLeadingImage strips the hero image at the
              top of the content block — descriptions open on their text. */}
          <article className="mission-card p-6 rounded-xl mb-stack-lg space-y-stack-md text-on-surface-variant dark:text-on-primary-container text-justify">
            <InformationBlockRenderer content={quest.content} dropLeadingImage />
          </article>

          {questState === 'SUBMITTED' ? (
            <div className="mission-card rounded-xl p-6 flex flex-col items-center gap-stack-md text-center">
              <div className="w-2 h-2 rounded-full bg-[#d97736] pulse-dot" />
              <h3 className="font-headline-md text-headline-md text-primary dark:text-primary-fixed">
                Enviado
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                A staff está a rever a vossa submissão. Fiquem por perto.
              </p>
            </div>
          ) : quest.challengeType === 'QUIZ' ? (
            <ChallengeBlocks quest={quest} onSubmit={onSubmitQuiz} busy={busy} error={error} />
          ) : (
            <div className="text-center mt-stack-lg">
              {error && (
                <p className="font-label-md text-label-md text-error dark:text-error-container mb-stack-md">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={onOpenCamera}
                className="w-full bg-primary-container text-on-primary font-label-md text-label-md py-4 px-6 rounded-3xl shadow-ambient-lg hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Icon name={quest.challengeType === 'VIDEO' ? 'videocam' : 'photo_camera'} />
                {quest.challengeType === 'VIDEO'
                  ? 'Gravar Vídeo para Completar'
                  : 'Upload Photo to Complete'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {questState === 'REWARD' && (
        <article className="mission-card rounded-[24px] p-6 space-y-stack-md text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-secondary/10 text-secondary flex items-center justify-center">
            <Icon name="star" fill style={{ fontSize: '36px' }} />
          </div>
          <span className="inline-block bg-primary-container/10 dark:bg-white/10 text-primary-container dark:text-primary-fixed-dim font-label-sm text-label-sm px-3 py-1 rounded-full uppercase">
            Missão Completa
          </span>
          {reward?.awardedScore != null && (
            <h2 className="font-headline-xl text-headline-xl text-primary dark:text-primary-fixed">
              +{reward.awardedScore}
            </h2>
          )}
          {reward?.postChallengeContent && (
            <div className="text-left text-on-surface-variant dark:text-on-primary-container">
              <InformationBlockRenderer
                content={reward.postChallengeContent}
                dropLeadingImage={false}
              />
            </div>
          )}
          <button
            type="button"
            onClick={onContinue}
            className="w-full bg-[#d97736] text-on-secondary font-label-md text-label-md py-4 px-6 rounded-3xl shadow-ambient-lg hover:opacity-90 active:scale-[0.98] transition-all"
          >
            CONTINUAR
          </button>
        </article>
      )}
    </main>
  );
}
