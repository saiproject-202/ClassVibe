// backend/badgeCatalog.js
//
// Milestone 9 (Rewards Locker): single source of truth for every badge a student
// can actually earn. Every slug here maps 1:1 to something already computed in
// quiz-socket-handlers.js — either a computeAwards() award `type`, or the
// rank-1 'gold' badge already assigned by QuizResult.assignBadge(). No new game
// mechanic is invented here; this catalog just gives real, already-earned
// achievements a name, icon, and description to show in the Rewards Locker.

const BADGE_CATALOG = [
  {
    slug: 'champion',
    name: 'Champion',
    icon: '🏆',
    description: 'Finish a quiz in 1st place.'
  },
  {
    slug: 'fastestThinker',
    name: 'Fastest Thinker',
    icon: '⚡',
    description: 'Have the fastest average answer time of anyone in a quiz.'
  },
  {
    slug: 'bestAccuracy',
    name: 'Best Accuracy',
    icon: '🎯',
    description: 'Have the highest accuracy of anyone in a quiz.'
  },
  {
    slug: 'longestStreak',
    name: 'Longest Streak',
    icon: '🔥',
    description: 'String together the longest correct-answer streak in a quiz.'
  },
  {
    slug: 'mostImproved',
    name: 'Most Improved',
    icon: '📈',
    description: 'Beat your own past average by the widest margin.'
  },
  {
    slug: 'teamSpirit',
    name: 'Team Spirit',
    icon: '🤝',
    description: "Be part of the team with the smallest score gap between its members."
  }
];

module.exports = { BADGE_CATALOG };
