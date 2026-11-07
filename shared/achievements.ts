// Achievements. The server decides when they're earned (worker/lib/rewards.ts).

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-finish', title: 'First Steps', description: 'Finish your first puzzle.', icon: '🧩' },
  { id: 'gold-1', title: 'Golden Touch', description: 'Earn a Gold medal.', icon: '🥇' },
  { id: 'gold-10', title: 'Gold Rush', description: 'Earn 10 Gold medals.', icon: '🏆' },
  { id: 'gold-50', title: 'Gold Hoard', description: 'Earn 50 Gold medals.', icon: '👑' },
  { id: 'finish-25', title: 'Puzzler', description: 'Finish 25 puzzles.', icon: '🧠' },
  { id: 'finish-100', title: 'Centurion', description: 'Finish 100 puzzles.', icon: '💯' },
  { id: 'perfect', title: 'Perfect Swaps', description: 'Finish a puzzle with 100% move efficiency.', icon: '🎯' },
  { id: 'speedy', title: 'Lightning', description: 'Finish an Easy puzzle in under a minute.', icon: '⚡' },
  { id: 'hard-clean', title: 'No Help Needed', description: 'Finish a Hard puzzle without hints or placed tiles.', icon: '💪' },
  { id: 'rotation-5', title: 'Spin Doctor', description: 'Finish 5 puzzles in Rotation mode.', icon: '🔄' },
  { id: 'zen-10', title: 'Inner Peace', description: 'Finish 10 puzzles in Zen mode.', icon: '🧘' },
  { id: 'daily-10', title: 'Daily Regular', description: 'Finish 10 daily challenges.', icon: '📅' },
  { id: 'streak-7', title: 'On Fire', description: 'Reach a 7-day daily streak.', icon: '🔥' },
  { id: 'streak-30', title: 'Unstoppable', description: 'Reach a 30-day daily streak.', icon: '🌟' },
  { id: 'timeattack-10', title: 'Time Lord', description: 'Solve 10 puzzles in one Time Attack run.', icon: '⏱️' },
  { id: 'collection', title: 'Collector', description: 'Finish every puzzle in a category.', icon: '📚' },
  { id: 'challenge-win', title: 'Challenger', description: 'Beat a friend’s challenge.', icon: '🤝' },
  { id: 'event', title: 'Event Champion', description: 'Finish every puzzle in an event.', icon: '🎉' },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Category collection bonus: paid once, the first time every puzzle in a category is finished. */
export function collectionBonus(puzzles: number): number {
  return Math.min(1000, 100 + 20 * puzzles);
}
/** Collections need at least this many puzzles to count. */
export const COLLECTION_MIN = 3;
