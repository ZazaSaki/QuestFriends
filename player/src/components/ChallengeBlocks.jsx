import { useState } from 'react';
import Icon from './Icon';

/**
 * Converted from baseline/stitch_quest_expedition_ui/mission_quiz_challenge_scrollable
 * (+ _dark). Multiple-choice options use the mock's `peer sr-only` radio pattern
 * so the whole card is the hit target.
 *
 * The manager authors quizzes as `content.quiz = [{ id, question, options[],
 * correctOptionIndex }]` (managerFrontend/src/lib/questMapping.ts). Grading is
 * server-side against `content.answer`, so we submit the chosen option's TEXT.
 * Quests with no quiz array fall back to a free-text answer, matching the
 * original vanilla player.
 */
export default function ChallengeBlocks({ quest, onSubmit, busy, error }) {
  const content = quest?.content && typeof quest.content === 'object' ? quest.content : {};
  const questions = Array.isArray(content.quiz) ? content.quiz : [];
  const question = questions[0];

  const [selected, setSelected] = useState(null);
  const [freeText, setFreeText] = useState('');

  const answer = question ? question.options?.[selected] : freeText.trim();
  const canSubmit = !busy && answer !== undefined && answer !== null && String(answer).trim() !== '';

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(String(answer));
  };

  return (
    <form
      onSubmit={submit}
      className="bg-surface-bright dark:bg-white/5 rounded-xl shadow-ambient-md p-6 space-y-stack-md border border-surface-variant/50 dark:border-white/10 relative overflow-hidden"
    >
      {/* Decorative accent bar from the mock */}
      <div className="absolute top-0 left-0 w-full h-1 bg-secondary" />

      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-white/10 flex items-center justify-center text-primary dark:text-primary-fixed">
          <Icon name="psychology" />
        </div>
        <h3 className="font-headline-md text-headline-md text-primary dark:text-primary-fixed">
          Questão 1
        </h3>
      </div>

      {question ? (
        <>
          <p className="font-body-lg text-body-lg text-on-surface dark:text-inverse-on-surface font-medium">
            {question.question}
          </p>

          <div className="space-y-stack-sm pt-4">
            {(question.options ?? []).map((option, i) => (
              <label key={i} className="block relative cursor-pointer group">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="quiz"
                  checked={selected === i}
                  onChange={() => setSelected(i)}
                />
                <div className="p-4 rounded-lg border border-primary/20 dark:border-white/15 bg-background/50 dark:bg-white/5 hover:bg-primary/5 transition-colors peer-checked:border-secondary peer-checked:bg-secondary/10 flex items-start space-x-4">
                  <div className="w-6 h-6 rounded-full border-2 border-primary/30 dark:border-white/30 peer-checked:border-secondary flex-shrink-0 flex items-center justify-center mt-0.5">
                    <div className="w-3 h-3 rounded-full bg-secondary opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                  <span className="font-body-md text-body-md text-on-surface dark:text-inverse-on-surface">
                    {option}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-stack-sm pt-2">
          <label
            className="font-label-md text-label-md text-primary dark:text-primary-fixed uppercase"
            htmlFor="free-answer"
          >
            Your Answer
          </label>
          <input
            id="free-answer"
            type="text"
            autoComplete="off"
            placeholder="Type your answer…"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            className="brand-input w-full px-4 py-3 rounded-lg font-body-lg text-body-lg placeholder:text-outline-variant"
          />
        </div>
      )}

      {error && (
        <p className="font-label-md text-label-md text-error dark:text-error-container text-center pt-2">
          {error}
        </p>
      )}

      <div className="pt-6">
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full bg-secondary text-on-secondary font-label-md text-label-md rounded-full py-4 shadow-md hover:opacity-90 transition-opacity flex items-center justify-center space-x-2 disabled:opacity-40"
        >
          <span>{busy ? 'A enviar…' : 'Confirmar Resposta'}</span>
          <Icon name="arrow_forward" className="text-sm" />
        </button>
      </div>
    </form>
  );
}
