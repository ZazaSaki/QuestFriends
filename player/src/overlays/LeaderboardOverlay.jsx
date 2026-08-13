import Icon from '../components/Icon';

// Rank medals from the mock: gold accent, silver-ish tint, bronze-ish tint.
const TROPHY_COLOR = ['text-secondary', 'text-surface-tint', 'text-on-tertiary-container'];

/**
 * Converted from baseline/stitch_quest_expedition_ui/leaderboard_overlay (+ _dark).
 *
 * Standings come from `GET /api/rooms/:roomId` (`teams[]` with `totalScore` and
 * `currentSeqNum`) — the backend has no separate leaderboard endpoint. The
 * player's own team gets the highlighted "(You)" treatment the mock gives rank 4.
 */
export default function LeaderboardOverlay({ teams = [], myTeamId, loading, error, onClose }) {
  const ranked = [...teams].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));

  return (
    <div className="fixed inset-0 z-40 bg-background/95 dark:bg-[#1a1a1a]/95 backdrop-blur-sm overflow-y-auto pb-32">
      <main className="px-container-margin pt-section-padding pb-section-padding max-w-4xl mx-auto flex flex-col gap-stack-lg">
        <header className="text-center relative">
          <button
            type="button"
            aria-label="Close leaderboard"
            onClick={onClose}
            className="absolute right-0 top-0 p-2 rounded-full text-on-surface-variant hover:bg-surface-variant dark:hover:bg-white/10 transition-colors"
          >
            <Icon name="close" />
          </button>
          <h2 className="font-headline-xl text-headline-xl text-primary dark:text-primary-fixed">
            Scoreboard
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-stack-sm">
            Current standings in the EJAS26 quest.
          </p>
        </header>

        {loading && (
          <p className="text-center font-body-md text-on-surface-variant italic">A carregar…</p>
        )}
        {error && (
          <p className="text-center font-label-md text-label-md text-error dark:text-error-container">
            {error}
          </p>
        )}

        <section className="flex flex-col gap-stack-sm">
          {ranked.map((team, i) => {
            const rank = i + 1;
            const isMe = team.id === myTeamId;
            const quests = team.currentSeqNum ? team.currentSeqNum - 1 : 0;

            return (
              <div
                key={team.id}
                className={
                  isMe
                    ? 'bg-secondary/10 shadow-md rounded p-4 flex items-center justify-between border-2 border-secondary transition-transform active:scale-95'
                    : `bg-surface-container-lowest dark:bg-white/5 shadow-md rounded p-4 flex items-center justify-between ${
                        rank === 1 ? 'border-2 border-secondary/20' : 'border border-secondary/10'
                      }`
                }
              >
                <div className="flex items-center gap-4">
                  <div
                    className={
                      isMe
                        ? 'w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-headline-md text-headline-md text-on-secondary'
                        : 'w-10 h-10 rounded-full bg-surface-container dark:bg-white/10 flex items-center justify-center font-headline-md text-headline-md text-primary dark:text-primary-fixed'
                    }
                  >
                    {rank}
                  </div>
                  <div>
                    <h3
                      className={`font-body-lg text-body-lg ${isMe ? 'font-bold' : 'font-semibold'} text-primary dark:text-primary-fixed`}
                    >
                      {team.name}
                      {isMe && (
                        <span className="font-label-sm text-label-sm text-secondary uppercase ml-2">
                          (You)
                        </span>
                      )}
                    </h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                      {quests} {quests === 1 ? 'Quest' : 'Quests'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {rank <= 3 && !isMe && (
                    <Icon name="trophy" fill className={`text-2xl ${TROPHY_COLOR[rank - 1]}`} />
                  )}
                  <span
                    className={`font-headline-md text-headline-md ${
                      rank === 1 && !isMe ? 'text-secondary' : 'text-primary dark:text-primary-fixed'
                    }`}
                  >
                    {team.totalScore ?? 0}
                  </span>
                </div>
              </div>
            );
          })}

          {!loading && !ranked.length && (
            <p className="text-center font-body-md text-on-surface-variant italic">
              Ainda sem equipas.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
