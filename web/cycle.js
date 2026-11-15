import { evaluate } from './match.js';
import { plain, PRAISE, RETRY } from './phrases.js';

/**
 * The automatic loop: say the phrase → listen → evaluate → praise (and go on) or ask to repeat.
 * Platform-free: speech, listening, sounds and timing are injected, so it runs the same on Android,
 * in a browser and in tests.
 *
 * deps: {
 *   say(text, { phraseId? }): Promise<void>   — phrase or praise, with stress marks
 *   listen(): Promise<string[]>               — recognizer alternatives ([] = nothing heard)
 *   celebrate(): Promise<void>                — sound + confetti
 *   sleep(ms): Promise<void>
 *   onState(state, data)                      — UI updates
 *   settings(): { strictness, attempts, autoNext }
 *   pick?(list): string                       — random choice, injectable for tests
 * }
 */
export class Trainer {
  constructor(deps) {
    this.d = { pick: (l) => l[Math.floor(Math.random() * l.length)], ...deps };
    this.run = 0;
    this.sessionSeq = 0;
  }

  /** Stops the current loop at the next await. */
  stop() {
    this.run++;
    this.sessionSeq++;
    this.d.onState('idle', {});
  }

  /**
   * Trains one phrase. Resolves with 'success' | 'skipped' | 'stopped'.
   * Never throws: errors from speech engines become an 'error' state and 'stopped'.
   */
  async train(phrase) {
    const run = ++this.run;
    const alive = () => run === this.run;
    const { strictness, attempts } = this.d.settings();
    try {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (!alive()) return 'stopped';
        this.d.onState('speaking', { phrase, attempt });
        await this.d.say(phrase.text, { phraseId: phrase.id });
        if (!alive()) return 'stopped';

        this.d.onState('listening', { phrase, attempt });
        const heard = await this.d.listen();
        if (!alive()) return 'stopped';

        const result = evaluate(plain(phrase.text), heard, strictness);
        if (result.ok) {
          const praise = this.d.pick(PRAISE);
          this.d.onState('success', { phrase, attempt, result, praise });
          await Promise.all([this.d.celebrate(), this.d.say(praise)]);
          return 'success';
        }
        const last = attempt === attempts;
        const message = heard.length === 0 ? 'Я не усл+ышала. Скаж+и погр+омче!' : last ? 'Хорош+о стар+ался! Попр+обуем сл+едующую.' : result.near ? this.d.pick(RETRY) : 'Послушай ещё раз и повтор+и.';
        this.d.onState('retry', { phrase, attempt, result, message, last });
        await this.d.say(message);
        if (last) return 'skipped';
        await this.d.sleep(400);
      }
      return 'skipped';
    } catch (err) {
      if (alive()) this.d.onState('error', { phrase, message: String(err?.message ?? err) });
      return 'stopped';
    }
  }

  /** Goes through phrases one after another; with autoNext off, stops after each success. */
  async session(phrases, from = 0, onDone = () => {}) {
    const sid = ++this.sessionSeq;
    for (let i = from; i < phrases.length; i++) {
      const res = await this.train(phrases[i]);
      if (sid !== this.sessionSeq) return;
      onDone(phrases[i], res, i);
      if (res === 'stopped') return;
      if (!this.d.settings().autoNext) {
        this.d.onState('paused', { phrase: phrases[i], next: i + 1 < phrases.length ? i + 1 : null });
        return;
      }
      await this.d.sleep(1200);
      if (sid !== this.sessionSeq) return;
    }
    this.d.onState('finished', {});
  }
}
