import { create } from 'zustand';

/**
 * The "keep the examples or start clean" question, asked once the tour ends.
 * Lives outside the planner store because it is pure UI intent, not workspace
 * data — and the tour finishes on the Team page, so the dialog has to be
 * reachable from the shared layout rather than from one page.
 */
interface SampleChoiceState {
  open: boolean;
  askSampleChoice: () => void;
  closeSampleChoice: () => void;
}

export const useSampleChoiceStore = create<SampleChoiceState>((set) => ({
  open: false,
  askSampleChoice: () => set({ open: true }),
  closeSampleChoice: () => set({ open: false }),
}));
