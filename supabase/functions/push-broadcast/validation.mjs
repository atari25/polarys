export function validateBroadcast(value) {
  if (!value || typeof value !== 'object') throw Error('Invalid request');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id ?? '')) throw Error('A unique UUID id is required');
  for (const [key, max] of [['title', 100], ['body', 500]]) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > max) throw Error(`Invalid ${key}`);
  }
  if (value.testToken !== undefined && !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(value.testToken)) throw Error('Invalid test token');
  if (value.dryRun !== true && value.confirm !== 'SEND') throw Error('Set confirm to SEND or dryRun to true');
  return { id: value.id, title: value.title.trim(), body: value.body.trim(), testToken: value.testToken, dryRun: value.dryRun === true };
}
export function pushMessage(token, value) {
  return { to: token, title: value.title, body: value.body, sound: 'default', channelId: 'safe-ride',
    ttl: 3600, data: { route: 'alert', kind: 'broadcast', broadcastId: value.id } };
}
