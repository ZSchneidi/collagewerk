export const HISTORY_LIMIT = 50;

/** Snapshot-based undo/redo. `push` records the state *before* a change. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  push(before: T) {
    this.past.push(before);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
  }

  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  all(): T[] {
    return [...this.past, ...this.future];
  }
}
