// Achievements. The server decides when they're earned (worker/lib/rewards.ts).

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Balance points paid once, when it's earned. */
  reward: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-finish', title: 'First Steps', description: 'Finish your first puzzle.', icon: '🧩', reward: 25 },
  { id: 'gold-1', title: 'Golden Touch', description: 'Earn a Gold medal.', icon: '🥇', reward: 25 },
  { id: 'gold-10', title: 'Gold Rush', description: 'Earn 10 Gold medals.', icon: '🏆', reward: 100 },
  { id: 'gold-50', title: 'Gold Hoard', description: 'Earn 50 Gold medals.', icon: '👑', reward: 300 },
  { id: 'finish-25', title: 'Puzzler', description: 'Finish 25 puzzles.', icon: '🧠', reward: 100 },
  { id: 'finish-100', title: 'Centurion', description: 'Finish 100 puzzles.', icon: '💯', reward: 300 },
  { id: 'perfect', title: 'Perfect Swaps', description: 'Finish a puzzle with 100% move efficiency.', icon: '🎯', reward: 50 },
  { id: 'speedy', title: 'Lightning', description: 'Finish an Easy puzzle in under a minute.', icon: '⚡', reward: 50 },
  { id: 'hard-clean', title: 'No Help Needed', description: 'Finish a Hard puzzle without hints or placed tiles.', icon: '💪', reward: 150 },
  { id: 'rotation-5', title: 'Spin Doctor', description: 'Finish 5 puzzles in Rotation mode.', icon: '🔄', reward: 75 },
  { id: 'zen-10', title: 'Inner Peace', description: 'Finish 10 puzzles in Zen mode.', icon: '🧘', reward: 75 },
  { id: 'daily-10', title: 'Daily Regular', description: 'Finish 10 daily challenges.', icon: '📅', reward: 150 },
  { id: 'streak-7', title: 'On Fire', description: 'Reach a 7-day daily streak.', icon: '🔥', reward: 100 },
  { id: 'streak-30', title: 'Unstoppable', description: 'Reach a 30-day daily streak.', icon: '🌟', reward: 400 },
  { id: 'timeattack-10', title: 'Time Lord', description: 'Solve 10 puzzles in one Time Attack run.', icon: '⏱️', reward: 150 },
  { id: 'collection', title: 'Collector', description: 'Finish every puzzle in a category.', icon: '📚', reward: 100 },
  { id: 'challenge-win', title: 'Challenger', description: 'Beat a friend’s challenge.', icon: '🤝', reward: 50 },
  { id: 'event', title: 'Event Champion', description: 'Finish every puzzle in an event.', icon: '🎉', reward: 100 },
  { id: 'slider-1', title: 'Smooth Operator', description: 'Finish a Slider Puzzle.', icon: '🔀', reward: 25 },
  { id: 'slider-5x5', title: 'Sliding Master', description: 'Finish a 5×5 Slider Puzzle.', icon: '🧠', reward: 150 },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Category collection bonus: paid once, the first time every puzzle in a category is finished. */
export function collectionBonus(puzzles: number): number {
  return Math.min(1000, 100 + 20 * puzzles);
}
/** Collections need at least this many puzzles to count. */
export const COLLECTION_MIN = 3;
