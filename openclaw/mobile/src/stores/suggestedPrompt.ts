/**
 * When user taps a skill (or suggestion), we set a prompt here and navigate to Chat.
 * ChatInput reads it, pre-fills the input, and clears it.
 */

import { create } from 'zustand';

interface SuggestedPromptStore {
  prompt: string | null;
  set: (prompt: string | null) => void;
  consume: () => string | null; // get and clear in one call
}

export const useSuggestedPromptStore = create<SuggestedPromptStore>((set, get) => ({
  prompt: null,
  set: (prompt) => set({ prompt }),
  consume: () => {
    const p = get().prompt;
    set({ prompt: null });
    return p;
  },
}));
