// The board is a beta most people never open: load its code on first use so
// the planner bundle stays the same size for everyone else. The page prefetches
// the same chunk when the board is likely to be opened.
export const importPlannerBoard = () => import('@/features/planner/components/board/PlannerBoard');
