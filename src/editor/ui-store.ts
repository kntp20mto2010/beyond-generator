import { create } from "zustand";
import type { FileSystemAdapter } from "../io/fs.js";

interface UiState {
  fs: FileSystemAdapter | null;
  savedRevision: number;
  setFs(fs: FileSystemAdapter): void;
  setSavedRevision(rev: number): void;
}

export const useUiStore = create<UiState>((set) => ({
  fs: null,
  savedRevision: 0,
  setFs: (fs) => set({ fs }),
  setSavedRevision: (savedRevision) => set({ savedRevision }),
}));
