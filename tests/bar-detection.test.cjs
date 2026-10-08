// Deterministic GPS traces against production detection and risk-store code.
// Native location delivery, Places, and notification delivery are mocked.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const latitude = meters => meters / 6371000 * 180 / Math.PI;
function harness({ places, apiOk = true } = {}) {
  let now = 1000000, task;
  const notifications = [];
  const requests = [];
  const cache = {};
  function load(file, mocks = {}, suffix = '') {
    if (cache[file]) return cache[file];
    const exports = {};
    cache[file] = exports;
    const source = fs.readFileSync(path.join(root, file), 'utf8') + suffix;
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
      exports, require: name => {
        if (mocks[name]) return mocks[name];
        if (name === 'expo-task-manager') return { defineTask: (_name, callback) => { task = callback; } };
        if (name === './night-controller') return { dispatchNight: async event => { if (event.type === 'leave') notifications.push(event); } };
        if (name.startsWith('.')) return load(path.relative(root, path.resolve(root, path.dirname(file), name + '.ts')));
        return {};
      }, console, AbortController, setTimeout, clearTimeout,
      process: { env: { EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: 'mock-key' } },
      Date: { now: () => now }, setInterval: () => 1, clearInterval() {},
      fetch: async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return { ok: apiOk, json: async () => ({ places: places ?? [
          { id: 'far', displayName: { text: 'Far bar' }, primaryType: 'bar', location: { latitude: latitude(80), longitude: 0 } },
          { id: 'near', displayName: { text: 'Test pub' }, primaryType: 'bar', location: { latitude: 0, longitude: 0 } },
        ] }) };
      },
    });
    return exports;
  }
  const risk = load('src/session.ts');
  const detection = load('src/tracking.ts');
  task = async ({ data }) => detection.processLocation(data.locations[data.locations.length - 1]);
  async function fix(meters = 0, { accuracy = 5, advance = 10000, age = 0, background = false } = {}) {
    now += advance;
    const position = { timestamp: now - age, coords: { latitude: latitude(meters), longitude: 0, accuracy, speed: 0 } };
    return background ? task({ data: { locations: [position] } }) : detection.processLocation(position);
  }
  async function dwell(count = 19, options) { for (let i = 0; i < count; i++) await fix(0, options); }
  return { risk, fix, dwell, notifications, requests };
}

test('nearest bar confirms only after 3 minutes; timer drives points; exit freezes time and dispatches leave once', async () => {
  const h = harness();
  await h.dwell(18);
  assert.equal(h.risk.getVenueSession(), null);
  await h.fix();
  assert.equal(h.risk.getVenueSession().name, 'Test pub');
  assert.equal(h.requests[0].rankPreference, 'DISTANCE');
  assert.equal(h.risk.getRiskScore(), 0);
  await h.dwell(6);
  assert.equal(h.risk.getRiskScore(), 0.5);
  h.risk.setBluetoothActive(true);
  assert.equal(h.risk.getRiskScore(), 40.5);
  await h.fix(105, { accuracy: 10 });
  assert.equal(h.notifications.length, 0);
  await h.fix(120, { accuracy: 5 });
  assert.equal(h.notifications.length, 1);
  const score = h.risk.getRiskScore();
  await h.fix(200, { advance: 60000 });
  assert.equal(h.risk.getRiskScore(), score);
  assert.equal(h.notifications.length, 1);
});

test('leaving the 30m confirmation area resets dwell', async () => {
  const h = harness(); await h.dwell(12); await h.fix(-40); await h.dwell(18);
  assert.equal(h.risk.getVenueSession(), null);
  await h.fix(); assert.ok(h.risk.getVenueSession());
});

for (const [name, options] of [
  ['poor accuracy', { accuracy: 60 }], ['missing accuracy', { accuracy: null }],
  ['stale fix', { age: 35000, advance: 40000 }], ['gap in location updates', { advance: 60000 }],
]) {
  test(`${name} cannot finish an unconfirmed visit`, async () => {
    const h = harness(); await h.dwell(12); await h.fix(0, options);
    assert.equal(h.risk.getVenueSession(), null);
    await h.dwell(17); assert.equal(h.risk.getVenueSession(), null);
  });
}

test('poor GPS cannot trigger exit', async () => {
  const h = harness(); await h.dwell(); await h.fix(250, { accuracy: 100 });
  assert.equal(h.notifications.length, 0); assert.equal(h.risk.getVenueSession().exitedAt, undefined);
});

test('legacy location batches confirm and exit using the same logic', async () => {
  const h = harness(); await h.dwell(19, { background: true });
  assert.ok(h.risk.getVenueSession()); await h.fix(150, { background: true });
  assert.equal(h.notifications.length, 1);
});

test('returning to the same venue starts a fresh timer', async () => {
  const h = harness(); await h.dwell(); const first = h.risk.getVenueSession().enteredAt;
  await h.fix(150); await h.fix(0, { advance: 60000 }); await h.dwell(18);
  assert.ok(h.risk.getVenueSession().enteredAt > first);
  assert.equal(h.risk.getVenueSession().exitedAt, undefined);
  assert.equal(h.risk.getRiskScore(), 0);
});

for (const [name, options] of [['Places failure', { apiOk: false }], ['missing venue coordinates', { places: [{ id: 'bad', displayName: { text: 'Bad' }, primaryType: 'bar' }] }]]) {
  test(`${name} never fabricates a visit`, async () => {
    const h = harness(options); await h.dwell(30); assert.equal(h.risk.getVenueSession(), null);
  });
}

for (const type of ['bar','pub','night_club','nightclub','club','bar_and_grill','irish_pub','brewpub','gastropub']) {
 test('discovered category '+type+' starts the same venue timer',async()=>{
  const h=harness({places:[{id:'new-place',displayName:{text:'Discovered place'},primaryType:'restaurant',types:['restaurant',type],location:{latitude:0,longitude:0}}]});
  await h.dwell();assert.equal(h.risk.getVenueSession().name,'Discovered place');
  assert.ok(h.requests[0].includedTypes.includes('pub'));
 });
}
test('club in the name alone does not classify a gym as nightlife',async()=>{
 const h=harness({places:[{id:'gym',displayName:{text:'College Fitness Club'},primaryType:'gym',types:['sports_club','gym'],location:{latitude:0,longitude:0}}]});
 await h.dwell();assert.equal(h.risk.getVenueSession(),null);
});
