const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function harness() {
  let now = new Date(2026, 9, 6, 22).getTime();
  const store = new Map(), events = [], requests = [];
  let saved = [], found = [], precise = false, current = null;
  const position = (accuracy = 5) => ({ timestamp: now, coords: { latitude: 41.9, longitude: -87.6, accuracy } });
  const cache = {};
  const native = {
    Accuracy: { High: 4 }, GeofencingEventType: { Enter: 1, Exit: 2 },
    getForegroundPermissionsAsync: async () => ({ granted: true }),
    getBackgroundPermissionsAsync: async () => ({ granted: true }),
    hasStartedLocationUpdatesAsync: async () => precise,
    startLocationUpdatesAsync: async () => { precise = true; },
    hasStartedGeofencingAsync: async () => false,
    startGeofencingAsync: async () => {},
    getCurrentPositionAsync: async () => position(),
  };
  const mocks = {
    'expo-location': native,
    './location-task-lifecycle': { stopLocationTask: async () => { precise = false; } },
    './storage': { deviceStorage: { getItem: async k => store.get(k) ?? null, setItem: async (k,v) => store.set(k,v) }, STORAGE_KEYS: { home: 'home' } },
    './saved-places': { readSavedPlaces: async () => saved, isSavedPlace: id => id.startsWith('personal:') },
    './places': { findNearbyBars: async (lat,lon) => { requests.push([lat,lon]); return found; } },
    './night-controller': { dispatchNight: async event => { events.push(event); if (event.type === 'enter') current = event.venue; if (event.type === 'home' || event.type === 'leave') current = null; } },
    './night-store': { readNight: async () => ({ status: current ? 'at_venue' : 'idle', currentVenue: current, lastLeftAt: null }) },
  };
  class Clock extends Date { static now() { return now; } }
  function load(file) {
    if (cache[file]) return cache[file];
    const exports = {}; cache[file] = exports;
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
      exports, Date: Clock, console, process: { env: {} }, require: name => mocks[name] ?? load(path.relative(path.join(__dirname,'..'),path.resolve(__dirname,'..',path.dirname(file),name+'.ts'))),
    });
    return exports;
  }
  return { api: load('src/geofencing.ts'), events, requests, position,
    advance: ms => { now += ms; }, setSaved: value => { saved = value; }, setFound: value => { found = value; } };
}
const party = { id: 'personal:chicago', name: 'House party', lat: 41.9, lon: -87.6 };
test('saving a place while already inside immediately evaluates entry', async () => {
  const h = harness(); h.setSaved([party]);
  await h.api.refreshSavedPlaceMonitoring();
  assert.equal(h.events.find(e => e.type === 'enter')?.venue.id, party.id);
});
test('ordinary location updates discover new nearby bars without reopening the app', async () => {
  const h = harness(); const bar = { ...party, id: 'chicago-bar' }; h.setFound([bar]);
  await h.api.processVenueLocation(h.position());
  assert.equal(h.requests.length, 1);
  assert.equal(h.events.find(e => e.type === 'enter')?.venue.id, bar.id);
  h.advance(10000); await h.api.processVenueLocation(h.position());
  assert.equal(h.requests.length, 1, 'lookup remains throttled');
  h.advance(60000); await h.api.processVenueLocation(h.position());
  assert.equal(h.requests.length, 2);
});
test('poor GPS does not fabricate entry; a later fresh fix starts the visit', async () => {
  const h = harness(); h.setSaved([party]);
  await h.api.processVenueLocation(h.position(100));
  assert.equal(h.events.some(e => e.type === 'enter'), false);
  h.advance(30000); await h.api.processVenueLocation(h.position());
  assert.equal(h.events.some(e => e.type === 'enter'), true);
});
test('saved places still detect when nearby Places returns nothing', async () => {
  const h = harness(); h.setSaved([party]);
  await h.api.processVenueLocation(h.position());
  assert.equal(h.events.find(e => e.type === 'enter')?.venue.id, party.id);
});
