import { Emitter } from './emitter.js';

/**
 * What the host knows about its own meeting link, as one line of status.
 *
 * The link is the room's entry in the directory (lib/rooms.js); the host's
 * lease writes it and reports every write. This turns those reports, and
 * the moments the invite changes, into words for the meeting info panel —
 * so a host with a guest on the phone saying "it says connecting" has
 * somewhere to look.
 *
 * States (`state`), for a host of a room:
 *  - 'working'      the last write landed: the link points at this meeting
 *  - 'refreshing'   the invite just changed, or nothing has been written yet
 *  - 'failing'      the directory could not be reached — with the advice inline
 *  - 'held'         another meeting holds this link right now
 * and null for a guest, who writes nothing.
 *
 * Emits 'change' {state, label, detail} — only when the words change, so a
 * status region fed from it is not re-announced on every heartbeat.
 */
export class LinkHealth extends Emitter {
  #host = false;
  /** Outcome of the last write: 'ok' | 'held' | 'error' | null (none yet). */
  #last = null;
  #refreshing = false; // the invite changed; the entry has yet to carry it
  #announced = ''; // the last words announced ('' — none, which is a guest's state too)

  /** Whether we host the room — only a host has a line. */
  role({ host }) {
    this.#host = !!host;
    if (!host) {
      this.#last = null;
      this.#refreshing = false;
    }
    this.#announce();
  }

  /** The invite newcomers need changed; the entry is about to be rewritten. */
  codeChanged() {
    this.#refreshing = true;
    this.#announce();
  }

  /** The lease wrote the entry (see RoomLease 'beat'). */
  beat({ ok, held = false }) {
    this.#last = ok ? 'ok' : held ? 'held' : 'error';
    if (ok) this.#refreshing = false;
    this.#announce();
  }

  get state() {
    if (!this.#host) return null;
    if (this.#last === 'held') return 'held';
    if (this.#last === 'error') return 'failing';
    if (this.#refreshing || this.#last === null) return 'refreshing';
    return 'working';
  }

  /** The line to show: {state, label, detail}, or null for a guest. */
  snapshot() {
    const state = this.state;
    if (state === null) return null;
    switch (state) {
      case 'working':
        return { state, label: '正常', detail: '任何打开此链接的人都能进入本次会议。' };
      case 'refreshing':
        return {
          state,
          label: '正在刷新…',
          detail: '链接正在更新。现在打开链接的人稍后即可进入。',
        };
      case 'held':
        return {
          state,
          label: '正被另一场会议使用',
          detail:
            '其他人同时在此链接上发起了会议，当前链接指向他们的会议。新参会者将进入那场会议；当前会议对已在其中的所有人继续进行。',
        };
      default:
        return {
          state,
          label: '无法更新',
          detail:
            '刚才无法更新链接。在更新成功之前，新参会者可能无法找到此会议 —— 如果有人无法进入，请让他们稍后重新打开链接。',
        };
    }
  }

  #announce() {
    const next = this.snapshot();
    const key = next ? `${next.state}|${next.detail}` : '';
    if (key === this.#announced) return;
    this.#announced = key;
    this.emit('change', next);
  }
}
