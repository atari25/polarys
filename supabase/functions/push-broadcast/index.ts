import { createClient } from 'npm:@supabase/supabase-js@2';
import { validateBroadcast, pushMessage } from './validation.mjs';
const reply = (status: number, body: unknown) => Response.json(body, { status });
const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
async function authorized(request: Request) {
  const expected = Deno.env.get('PUSH_ADMIN_SECRET');
  const supplied = request.headers.get('x-push-admin');
  if (!expected || expected.length < 32 || !supplied) return false;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const a = await hash(expected), b = await hash(supplied);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function expo(path: string, body: unknown) {
  const key = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (!key) throw Error('Expo credentials are not configured');
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error('Expo request failed');
  const result = await response.json();
  if (result.errors) throw Error('Expo rejected request');
  return result.data;
}
Deno.serve(async request => {
  if (request.method !== 'POST') return reply(405, { error: 'POST required' });
  if (!await authorized(request)) return reply(401, { error: 'Unauthorized' });
  let value;
  try { const raw = await request.text(); if (raw.length > 4096) return reply(413, { error: 'Request too large' }); value = JSON.parse(raw); }
  catch { return reply(400, { error: 'Invalid JSON' }); }
  const client = db();
  try {
    if (value.action === 'receipts') {
      // Call 15+ minutes after sending. A receipt confirms provider handoff, not display.
      const { data: rows, error } = await client.from('push_receipts').select('*').eq('status', 'pending').order('created_at').limit(1000);
      if (error) throw error;
      if (!rows?.length) return reply(200, { checked: 0 });
      const receipts = await expo('getReceipts', { ids: rows.map(r => r.id) });
      let checked = 0;
      for (const row of rows) {
        const receipt = receipts[row.id]; if (!receipt) continue;
        const code = receipt.details?.error ?? null;
        if (code === 'DeviceNotRegistered') {
          const { error } = await client.from('push_devices').delete().eq('token', row.token); if (error) throw error;
        }
        const { error } = await client.from('push_receipts').update({ status: receipt.status, error: code }).eq('id', row.id);
        if (error) throw error; checked++;
      }
      return reply(200, { checked, pending: rows.length - checked });
    }
    let message;
    try { message = validateBroadcast(value); } catch (e) { return reply(400, { error: (e as Error).message }); }
    let query = client.from('push_devices').select('token').gte('updated_at', new Date(Date.now() - 30 * 86400000).toISOString()).limit(101);
    if (message.testToken) query = query.eq('token', message.testToken);
    const { data: rows, error } = await query;
    if (error) throw error;
    // Explicit beta limit: never silently skip recipients or exceed one Expo batch.
    if (rows!.length > 100) return reply(409, { error: 'More than 100 recipients. Add a queued sender before broadcasting.' });
    if (message.dryRun) return reply(200, { recipients: rows!.length, title: message.title, body: message.body, route: 'alert', sent: false });
    if (!rows!.length) return reply(409, { error: 'No recently active registered recipients' });
    if (!Deno.env.get('EXPO_ACCESS_TOKEN')) return reply(503, { error: 'Expo credentials are not configured' });
    // Reserve the ID before contacting Expo. Never retry an uncertain send automatically.
    const { error: reserveError } = await client.from('push_broadcasts').insert({ id: message.id, title: message.title, body: message.body });
    if (reserveError) return reply(reserveError.code === '23505' ? 409 : 500, { error: 'Broadcast ID already used or could not be reserved. No send attempted.' });
    try {
      const tickets = await expo('send', rows!.map(r => pushMessage(r.token, message)));
      if (!Array.isArray(tickets) || tickets.length !== rows!.length) throw Error('Invalid ticket response');
      let accepted = 0, failed = 0;
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i], token = rows![i].token;
        if (ticket.status === 'ok' && ticket.id) {
          const { error } = await client.from('push_receipts').insert({ id: ticket.id, broadcast_id: message.id, token });
          if (error) throw error; accepted++;
        } else {
          failed++;
          if (ticket.details?.error === 'DeviceNotRegistered') {
            const { error } = await client.from('push_devices').delete().eq('token', token); if (error) throw error;
          }
        }
      }
      const { error } = await client.from('push_broadcasts').update({ status: failed ? 'partial_or_failed' : 'accepted' }).eq('id', message.id);
      if (error) throw error;
      return reply(200, { accepted, failed, delivered: 'Not yet known. Check receipts after 15 minutes.' });
    } catch {
      await client.from('push_broadcasts').update({ status: 'unknown_check_before_resending' }).eq('id', message.id);
      return reply(502, { error: 'Send outcome uncertain. Do not resend with a new ID without checking Expo and database records.' });
    }
  } catch { return reply(500, { error: 'Service request failed; check server configuration and logs.' }); }
});
