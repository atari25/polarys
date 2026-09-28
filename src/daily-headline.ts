const HEADLINES = [
  'Sunday funday?',
  'Monday. We meet again.',
  'Tuesday plot twist?',
  'Halfway to the weekend.',
  'Going to mugs?',
  'Friday. Group chat, assemble.',
  'Saturday. What’s the move?',
] as const;

export function dailyHeadline(now = new Date()): string {
  // Keep Friday's greeting through its late-night session, until 5 a.m.
  const day = new Date(now);
  if (day.getHours() < 5) day.setDate(day.getDate() - 1);
  return HEADLINES[day.getDay()];
}
