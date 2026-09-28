export const FOOTBALL_SOURCE = 'https://cyclones.com/sports/football/schedule/text';
export type SocialEvent = { id: string; date: string; title: string; detail: string; kind: 'Game day' | 'Social occasion'; source?: string };
const clean = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').trim();
export function parseFootballSchedule(html: string): SocialEvent[] {
  const year = html.match(/(20\d{2}) Football Schedule/)?.[1];
  if (!year) throw new Error('Schedule year not found');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const events: SocialEvent[] = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => clean(cell[1]));
    if (cells.length < 7) continue;
    const [day, time, at, opponent, location, theme, result] = cells;
    const match = day.match(/^([A-Za-z]{3})\s+(\d{1,2})/);
    if (!match || !months.includes(match[1]) || !opponent || /^[WL]\b/.test(result)) continue;
    // Championship participation is conditional, not a confirmed Cyclones game.
    if (/championship|bowl/i.test(opponent)) continue;
    const date = `${year}-${String(months.indexOf(match[1]) + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    events.push({ id: `football-${date}-${opponent}`, date, title: `Iowa State ${at === 'Away' ? 'at' : 'vs.'} ${opponent}`, kind: 'Game day', detail: `${at} · ${location} · ${time || 'Time TBA'}${theme ? ` · ${theme}` : ''}`, source: FOOTBALL_SOURCE });
  }
  if (!events.length) throw new Error('No upcoming games found in published schedule');
  return events;
}
export function amesDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function seasonalEvents(year: number): SocialEvent[] {
  const event = (date: string, title: string, detail: string): SocialEvent => ({ id: `${date}-${title}`, date, title, detail, kind: 'Social occasion' });
  const date = (month: number, day: number) => `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const thanksgiving = 1 + (4 - new Date(Date.UTC(year,10,1)).getUTCDay() + 7) % 7 + 21;
  const laborDay = 1 + (1 - new Date(Date.UTC(year,8,1)).getUTCDay() + 7) % 7;
  const memorialDay = 31 - (new Date(Date.UTC(year,4,31)).getUTCDay() - 1 + 7) % 7;
  const note = 'Calendar occasion · local parties and event times vary. Plan your ride ahead.';
  return [event(date(3,17), "St. Patrick’s Day", note), event(date(5,memorialDay), 'Memorial Day', note), event(date(7,4), 'Fourth of July', note), event(date(9,laborDay), 'Labor Day', note), event(date(10,31), 'Halloween', note), event(date(11,thanksgiving-1), 'Thanksgiving Eve', note), event(date(12,31), 'New Year’s Eve', note)];
}
export function upcomingSocials(games: SocialEvent[], now = new Date()) {
  const today = amesDate(now);
  const year = Number(today.slice(0,4));
  return [...games, ...seasonalEvents(year), ...seasonalEvents(year+1)]
    .filter(event => event.date >= today && event.date <= `${year+1}${today.slice(4)}`)
    .sort((a,b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
