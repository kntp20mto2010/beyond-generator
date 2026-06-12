import {
  enablePatches,
  produceWithPatches,
  applyPatches,
  type Draft,
  type Patch,
} from "immer";

enablePatches();

const HISTORY_LIMIT = 200;
const MERGE_WINDOW_MS = 1000;

type CommandFn<D> = (draft: Draft<D>) => void;

interface HistoryEntry {
  label: string;
  mergeKey?: string;
  patches: Patch[];
  inverse: Patch[];
  at: number;
}

export class DocStore<D extends object> {
  #doc: D;
  #revision = 0;
  #undoStack: HistoryEntry[] = [];
  #redoStack: HistoryEntry[] = [];
  #listeners = new Set<() => void>();

  constructor(initial: D) {
    this.#doc = initial;
  }

  get doc(): D {
    return this.#doc;
  }

  get revision(): number {
    return this.#revision;
  }

  dispatch(
    label: string,
    fn: CommandFn<D>,
    opts?: { mergeKey?: string },
  ): void {
    const [next, patches, inverse] = produceWithPatches(this.#doc, fn);
    if (patches.length === 0) return;

    this.#doc = next as D;
    this.#revision++;
    this.#redoStack = [];

    const now = Date.now();
    const mergeKey = opts?.mergeKey;
    const last = this.#undoStack[this.#undoStack.length - 1];

    if (
      mergeKey !== undefined &&
      last !== undefined &&
      last.mergeKey === mergeKey &&
      now - last.at < MERGE_WINDOW_MS
    ) {
      this.#undoStack[this.#undoStack.length - 1] = {
        label,
        mergeKey,
        patches: [...last.patches, ...patches],
        inverse: [...inverse, ...last.inverse],
        at: now,
      };
    } else {
      this.#undoStack.push({ label, mergeKey, patches, inverse, at: now });
      if (this.#undoStack.length > HISTORY_LIMIT) {
        this.#undoStack.shift();
      }
    }

    this.#notify();
  }

  undo(): void {
    const entry = this.#undoStack.pop();
    if (!entry) return;
    this.#doc = applyPatches(this.#doc, entry.inverse) as D;
    this.#revision++;
    this.#redoStack.push(entry);
    this.#notify();
  }

  redo(): void {
    const entry = this.#redoStack.pop();
    if (!entry) return;
    this.#doc = applyPatches(this.#doc, entry.patches) as D;
    this.#revision++;
    this.#undoStack.push(entry);
    this.#notify();
  }

  canUndo(): boolean {
    return this.#undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.#redoStack.length > 0;
  }

  reset(doc: D): void {
    this.#doc = doc;
    this.#undoStack = [];
    this.#redoStack = [];
    this.#revision++;
    this.#notify();
  }

  subscribe(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  #notify(): void {
    for (const cb of this.#listeners) {
      cb();
    }
  }
}
