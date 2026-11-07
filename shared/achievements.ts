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
  // ---- second set ----
  { id: 'finish-10', title: 'Getting Hooked', description: 'Finish 10 puzzles.', icon: '🎣', reward: 50 },
  { id: 'finish-250', title: 'Puzzle Machine', description: 'Finish 250 puzzles.', icon: '⚙️', reward: 500 },
  { id: 'gold-25', title: 'Midas', description: 'Earn 25 Gold medals.', icon: '💰', reward: 200 },
  { id: 'explorer', title: 'Explorer', description: 'Finish puzzles in 5 different categories.', icon: '🧭', reward: 75 },
  { id: 'medium-10', title: 'Stepping Up', description: 'Finish 10 Medium puzzles.', icon: '📈', reward: 75 },
  { id: 'hard-10', title: 'Tough Cookie', description: 'Finish 10 Hard puzzles.', icon: '🍪', reward: 150 },
  { id: 'hard-gold', title: 'Hard as Gold', description: 'Earn a Gold medal on a Hard puzzle.', icon: '🏅', reward: 150 },
  { id: 'speedy-30', title: 'Blink', description: 'Finish an Easy puzzle in under 30 seconds.', icon: '👀', reward: 100 },
  { id: 'medium-fast', title: 'Quick Study', description: 'Finish a Medium puzzle in under 3 minutes.', icon: '⏩', reward: 100 },
  { id: 'rotation-25', title: 'Whirlwind', description: 'Finish 25 puzzles in Rotation mode.', icon: '🌪️', reward: 150 },
  { id: 'zen-50', title: 'Zen Master', description: 'Finish 50 puzzles in Zen mode.', icon: '🪷', reward: 200 },
  { id: 'daily-30', title: 'Daily Devotee', description: 'Finish 30 daily challenges.', icon: '🗓️', reward: 300 },
  { id: 'daily-gold-10', title: 'Golden Days', description: 'Earn 10 Gold medals on daily challenges.', icon: '✨', reward: 200 },
  { id: 'streak-100', title: 'Legendary', description: 'Reach a 100-day daily streak.', icon: '🏛️', reward: 1000 },
  { id: 'timeattack-15', title: 'Speed Demon', description: 'Solve 15 puzzles in one Time Attack run.', icon: '😈', reward: 250 },
  { id: 'slider-10', title: 'Slide Show', description: 'Finish 10 Slider Puzzles.', icon: '🎞️', reward: 100 },
  { id: 'slider-daily-7', title: 'Slider Regular', description: 'Finish 7 daily sliders.', icon: '📆', reward: 150 },
  { id: 'slider-fast', title: 'Quick Slide', description: 'Finish a 4×4 Slider Puzzle in under a minute.', icon: '💨', reward: 150 },
  { id: 'collection-3', title: 'Curator', description: 'Complete 3 whole categories.', icon: '🖼️', reward: 300 },
  { id: 'challenge-5', title: 'Rival', description: 'Beat 5 friends’ challenges.', icon: '⚔️', reward: 150 },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Category collection bonus: paid once, the first time every puzzle in a category is finished. */
export function collectionBonus(puzzles: number): number {
  return Math.min(1000, 100 + 20 * puzzles);
}
/** Collections need at least this many puzzles to count. */
export const COLLECTION_MIN = 3;
