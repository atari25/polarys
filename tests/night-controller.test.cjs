const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function harness(data = new Map(), development = true, nearby = []) {
  let now = new Date(2026, 8, 27, 21).getTime();
  const scheduled = [], cancelled = [], cache = {};
  let tracking = false, regions = [], registrations = 0;
  const tasks = {};
  const nativeLocation = {
    Accuracy: { High: 4 }, GeofencingEventType: { Enter: 1, Exit: 2 },
    getBackgroundPermissionsAsync: async () => ({ granted: true }),
    hasStartedLocationUpdatesAsync: async () => tracking,
    startLocationUpdatesAsync: async () => { tracking = true; },
    stopLocationUpdatesAsync: async () => { tracking = false; },
    hasStartedGeofencingAsync: async () => regions.length > 0,
    startGeofencingAsync: async (_task,value) => { regions = value; registrations++; },
    getCurrentPositionAsync: async () => { throw Error('No live fix'); },
  };
  const storage = { removeItem: async key => { data.delete(key); }, getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); } };
  function load(name) {
    if (cache[name]) return cache[name];
    const exports = {}; cache[name] = exports;
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
      exports, console, __DEV__: development, Date: class extends Date { static now() { return now; } }, process: { env: {} },
      require: key => {
        if (key === './storage') return { deviceStorage: storage, STORAGE_KEYS: { night: 'night', home: 'home' } };
        if (key === 'expo-location') return nativeLocation;
        if (key === 'expo-task-manager') return { defineTask: (name, handler) => { tasks[name] = handler; } };
        if (key === './places') return { findNearbyBars: async () => nearby };
        if (key === './notifications') return { getNotificationPermission: async () => true };
        if (key === 'react-native') return { Platform: { OS: 'ios' } };
        if (key === 'expo-notifications') return {
          SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
          scheduleNotificationAsync: async value => { scheduled.push(value); return String(scheduled.length); },
          cancelScheduledNotificationAsync: async id => { cancelled.push(id); },
        };
        return load(key.slice(2));
      },
    });
    return exports;
  }
  return { load, tasks, nativeLocation, tracking: () => tracking, regions: () => regions, registrations: () => registrations, now: () => now, controller: load('night-controller'), data, scheduled, cancelled, advance: minutes => { now += minutes * 60000; }, night: () => JSON.parse(data.get('night')) };
}
const enter = { type: 'enter', venue: { id: 'test', name: 'Test venue' } };
test('entry schedules nothing; home clears persisted night', async () => {
  const h = harness();
  await h.controller.dispatchNight(enter);
  assert.equal(h.scheduled.length, 0);
  h.advance(10);
  await h.controller.dispatchNight({ type: 'leave' });
  assert.deepEqual(h.cancelled, []);
  await h.controller.dispatchNight({ type: 'home' });
  assert.equal(h.night().status, 'idle');
});
test('legacy timed reminder is cancelled and metadata removed', async () => {
  const h = harness();
  await h.controller.dispatchNight(enter);
  h.data.set('night', JSON.stringify({ ...h.night(), purchaseLogged: true, nudgeNotificationId: 'old-reminder' }));
  h.data.set('polarys.lastPurchase.v1', 'old purchase');
  h.advance(10);
  await h.controller.dispatchNight({ type: 'tick' });
  assert.equal(h.scheduled.length, 0);
  assert.equal(h.night().purchaseLogged, undefined);
  assert.equal(h.data.has('polarys.lastPurchase.v1'), false);
  assert.deepEqual(h.cancelled, ['old-reminder']);
});
test('legacy 20-minute at-risk session cannot trigger a car check-in', async () => {
  const h = harness();
  await h.controller.dispatchNight(enter);
  h.data.set('night', JSON.stringify({ ...h.night(), status: 'at_risk', totalVenueMs: 20*60000, purchaseLogged: true, atRiskUntil: Date.now()+99999999 }));
  h.advance(20);
  assert.equal(await h.controller.receiveCar(), false);
  assert.equal(h.night().status, 'idle');
});
test('cold controller restores eligible session; concurrent car calls emit only one notification', async () => {
  const initial = harness();
  await initial.controller.dispatchNight(enter);
  const h = harness(initial.data); h.advance(45);
  await Promise.all([h.controller.receiveCar(), h.controller.receiveCar()]);
  assert.equal(h.scheduled.filter(n => n.content.data.kind === 'car-check-in').length, 1);
  assert.equal(h.night().carAlertIssued, true);
  await h.controller.dispatchNight({ type: 'handled' });
  assert.equal(await h.controller.receiveCar(), false);
});
test('invalid saved data cannot fabricate eligibility', async () => {
  const h = harness(new Map([['night', '{broken']]));
  assert.equal(await h.controller.receiveCar(), false);
  assert.equal(h.scheduled.length, 0);
});
test('Bluetooth and Shortcut share one alert; Bluetooth does not fake a Shortcut receipt', async () => {
  const h = harness();
  await h.controller.dispatchNight(enter);
  h.advance(45);
  assert.equal(await h.controller.receiveCar('bluetooth'), true);
  assert.equal(h.data.has('polarys.shortcutReceipt.v1'), false);
  assert.equal(await h.controller.receiveCar('bluetooth'), false);
  await h.controller.receiveCar();
  assert.equal(h.scheduled.filter(n => n.content.data.kind === 'car-check-in').length, 1);
  assert.equal(JSON.parse(h.data.get('polarys.shortcutReceipt.v1')).kind, 'car');
  await h.controller.dispatchNight({ type: 'handled' });
  assert.equal(await h.controller.receiveCar('bluetooth'), false);
  assert.equal(await h.controller.receiveCar(), false);
});

test('45-minute departure sends once without car connection, not at the threshold itself', async () => {
 const h=harness(); await h.controller.dispatchNight(enter); h.advance(45);
 await h.controller.dispatchNight({type:'tick'}); assert.equal(h.scheduled.length,0);
 await Promise.all([h.controller.dispatchNight({type:'leave'}),h.controller.dispatchNight({type:'leave'})]);
 assert.equal(h.scheduled.length,1); assert.equal(h.scheduled[0].content.data.kind,'departure');
 assert.equal(h.night().carAlertIssued,false);
 await h.controller.receiveCar('bluetooth'); assert.equal(h.night().carConnectionPoints,40);
 await h.controller.receiveCar('bluetooth'); assert.equal(h.night().carConnectionPoints,40);
});
test('short visit departure sends nothing',async()=>{
 const h=harness(); await h.controller.dispatchNight(enter); h.advance(44);
 await h.controller.dispatchNight({type:'leave'}); assert.equal(h.scheduled.length,0);
});

const cy = { latitude:42.0219482, longitude:-93.6503831 };
const fix = (h,meters=0,accuracy=5) => ({timestamp:h.now(),coords:{latitude:cy.latitude+meters/111195,longitude:cy.longitude,accuracy}});
test('real task registration, precise entry and duplicate fence exit after cold restart',async()=>{
 const h=harness(); h.load('tasks');
 assert.ok(h.tasks.BAR_FENCE); assert.ok(h.tasks.VENUE_CHECK);
 await h.load('geofencing').processVenueLocation(fix(h),true);
 assert.equal(h.regions().length,5); assert.equal(h.regions()[0].radius,100);
 assert.equal(h.night().currentVenue.id,'cys-roost'); assert.equal(h.tracking(),true);
 const cold=harness(h.data); cold.load('tasks'); cold.advance(45);
 await cold.tasks.BAR_FENCE({data:{eventType:2,region:{identifier:'cys-roost'}}});
 await cold.tasks.BAR_FENCE({data:{eventType:2,region:{identifier:'cys-roost'}}});
 assert.equal(cold.scheduled.filter(n=>n.content.data.kind==='departure').length,1);
 assert.equal(cold.night().totalVenueMs,45*60000);
});
test('precise exit rejects noisy and stale fixes, then leaves before the 100m boundary',async()=>{
 const h=harness(), geo=h.load('geofencing');
 await geo.processVenueLocation(fix(h),true); h.advance(45);
 await geo.processVenueLocation(fix(h,70,90)); assert.equal(h.night().status,'at_venue');
 await geo.processVenueLocation({...fix(h,70),timestamp:h.now()-60000}); assert.equal(h.night().status,'at_venue');
 await geo.processVenueLocation(fix(h,60)); assert.equal(h.night().status,'between_venues');
 assert.equal(h.scheduled.length,1);
 h.advance(16); await geo.processVenueLocation(fix(h,400)); assert.equal(h.tracking(),false);
});
test('home clears session, stops tracking and prevents immediate reentry',async()=>{
 const h=harness(), geo=h.load('geofencing'); await geo.processVenueLocation(fix(h),true);
 h.data.set('home',JSON.stringify(cy)); h.advance(45); await geo.processVenueLocation(fix(h));
 assert.equal(h.night().status,'idle'); assert.equal(h.tracking(),false); assert.equal(h.scheduled.length,0);
 h.advance(1); await geo.handleGeofence(1,{identifier:'cys-roost'});
 assert.equal(h.tracking(),false); assert.equal(h.night().status,'idle');
});
test('six-hour and daytime safety stops end precise tracking',async()=>{
 const h=harness(),geo=h.load('geofencing'); await geo.processVenueLocation(fix(h),true);
 h.advance(360); await geo.checkTrackingSafety(); assert.equal(h.tracking(),false);
 await geo.handleGeofence(1,{identifier:'cys-roost'}); assert.equal(h.tracking(),false);
 h.advance(120); await geo.checkTrackingSafety(); assert.equal(h.night().status,'idle');
});
test('nearest registration never exceeds 20 and daytime fences do not start tracking',async()=>{
 const h=harness(),geo=h.load('geofencing');
 const venues=Array.from({length:30},(_,i)=>({id:String(i),name:String(i),lat:cy.latitude+i/1000,lon:cy.longitude}));
 assert.equal(geo.nearestVenues(venues,cy.latitude,cy.longitude).length,20);
 h.advance(8*60); await geo.processVenueLocation(fix(h),true);
 assert.equal(h.regions().length,5); await geo.handleGeofence(1,{identifier:'cys-roost'});
 assert.equal(h.tracking(),false);
});

test('old tracking runtime does not block a new evening after a cold start',async()=>{
 const h=harness(); await h.load('geofencing').processVenueLocation(fix(h),true);
 h.advance(24*60); await h.load('geofencing').processVenueLocation(fix(h),true);
 assert.equal(h.night().status,'at_venue'); assert.equal(h.night().totalVenueMs,0);
 assert.equal(h.tracking(),true);
});
test('Bluetooth before threshold adds no points; after a handled departure it adds points without another alert',async()=>{
 const h=harness(); await h.controller.dispatchNight(enter);
 h.advance(44); await h.controller.receiveCar('bluetooth'); assert.equal(h.night().carConnectionPoints,0);
 h.advance(1); await h.controller.dispatchNight({type:'leave'}); await h.controller.dispatchNight({type:'handled'});
 assert.equal(await h.controller.receiveCar('bluetooth'),false); assert.equal(h.night().carConnectionPoints,40);
 assert.equal(h.scheduled.length,1);
});
test('bar hopping preserves only venue time and unrelated overlapping fence exits cannot end the new visit',async()=>{
 const h=harness(),geo=h.load('geofencing');
 await geo.processVenueLocation(fix(h),true);
 h.advance(25); await geo.processVenueLocation(fix(h,60));
 h.advance(5);
 await geo.processVenueLocation({timestamp:h.now(),coords:{latitude:42.020454,longitude:-93.6504317,accuracy:5}});
 assert.equal(h.night().currentVenue.id,'blue-owl');
 await geo.handleGeofence(2,{identifier:'cys-roost'});
 assert.equal(h.night().currentVenue.id,'blue-owl');
 h.advance(20);
 await geo.handleGeofence(2,{identifier:'blue-owl'});
 assert.equal(h.night().totalVenueMs,45*60000);
 assert.equal(h.scheduled.filter(n=>n.content.data.kind==='departure').length,1);
});

test('development resume clears saved home pause and permits a fresh confirmed visit',async()=>{
 const h=harness(),geo=h.load('geofencing'); await geo.processVenueLocation(fix(h),true);
 await geo.endNightAtHome(); assert.ok(JSON.parse(h.data.get('polarys.tracking.v2')).blockedUntil > h.now());
 assert.equal(await geo.resumeNightForTesting(),false); // Native fix unavailable in this test.
 assert.equal(JSON.parse(h.data.get('polarys.tracking.v2')).blockedUntil,0);
 h.advance(1); await geo.processVenueLocation(fix(h));
 assert.equal(h.night().status,'at_venue'); assert.equal(h.night().totalVenueMs,0);
});
test('resume is unavailable in production and never changes the pause',async()=>{
 const h=harness(new Map(),false),geo=h.load('geofencing'); await geo.endNightAtHome();
 const before=h.data.get('polarys.tracking.v2');
 await assert.rejects(()=>geo.resumeNightForTesting(),/development builds/);
 assert.equal(h.data.get('polarys.tracking.v2'),before);
});

test('removing manual end-night clears the old pause once, but preserves subsequent home pauses',async()=>{
 const h=harness(),geo=h.load('geofencing'); await geo.endNightAtHome();
 await assert.rejects(()=>geo.initializeGeofencing()); // Live fix unavailable after migration.
 assert.equal(JSON.parse(h.data.get('polarys.tracking.v2')).blockedUntil,0);
 await geo.endNightAtHome();
 await assert.rejects(()=>geo.initializeGeofencing());
 assert.ok(JSON.parse(h.data.get('polarys.tracking.v2')).blockedUntil > h.now());
});

test('discovered pub registers a fence and uses the same time, departure and car points rules',async()=>{
 const venue={id:'discovered-pub',name:'Discovered pub',lat:42.03,lon:-93.66};
 const h=harness(new Map(),true,[venue]),geo=h.load('geofencing');
 const point=()=>({timestamp:h.now(),coords:{latitude:venue.lat,longitude:venue.lon,accuracy:5}});
 await geo.processVenueLocation(point(),true);
 assert.ok(h.regions().some(r=>r.identifier===venue.id && r.radius===100));
 assert.equal(h.night().currentVenue.id,venue.id);
 h.advance(45);
 await geo.processVenueLocation({timestamp:h.now(),coords:{latitude:venue.lat+60/111195,longitude:venue.lon,accuracy:5}});
 assert.equal(h.night().totalVenueMs,45*60000);
 assert.equal(h.scheduled[0].content.data.kind,'departure');
 await h.controller.receiveCar('bluetooth');
 assert.equal(h.night().carConnectionPoints,40);
});
test('distinct discovered venue near a curated bar is not discarded just for being nearby',async()=>{
 const nearby={id:'adjacent-pub',name:'Different pub',lat:cy.latitude+0.0001,lon:cy.longitude};
 const h=harness(new Map(),true,[nearby]);
 await h.load('geofencing').processVenueLocation(fix(h),true);
 assert.ok(h.regions().some(r=>r.identifier==='adjacent-pub'));
});

for (const id of ['ajs-ultra-lounge', 'paddys-irish-pub']) {
 test(`${id} works without Places and sends the same 45-minute departure alert`, async () => {
  const h = harness(), geo = h.load('geofencing');
  const venue = h.load('venues').CORE_VENUES.find(v => v.id === id);
  await geo.processVenueLocation({timestamp:h.now(),coords:{latitude:venue.lat,longitude:venue.lon,accuracy:5}},true);
  assert.equal(h.night().currentVenue.id,id);
  assert.equal(h.regions().find(r => r.identifier === id).radius,100);
  h.advance(45);
  await geo.handleGeofence(2,{identifier:id});
  assert.equal(h.night().totalVenueMs,45*60000);
  assert.equal(h.scheduled.filter(n => n.content.data.kind === 'departure').length,1);
 });
}

test('saved address survives restart, registers offline, and sends one departure after 45 minutes', async () => {
  const initial = harness();
  await initial.load('saved-places').savePlace({address:'Example party address',latitude:42.04,longitude:-93.67}, 'Friend’s place');
  const h = harness(initial.data), geo = h.load('geofencing');
  await geo.refreshSavedPlaceMonitoring();
  const place = (await h.load('saved-places').readSavedPlaces())[0];
  assert.ok(h.regions().some(r => r.identifier === place.id && r.radius === 100));
  const point = () => ({timestamp:h.now(),coords:{latitude:place.lat,longitude:place.lon,accuracy:5}});
  await geo.processVenueLocation(point(),true);
  assert.equal(h.night().currentVenue.name, 'Friend’s place');
  h.advance(45);
  await geo.processVenueLocation(point());
  assert.equal(h.scheduled.length,0);
  h.advance(1);
  await geo.processVenueLocation({timestamp:h.now(),coords:{latitude:place.lat+0.001,longitude:place.lon,accuracy:5}});
  await geo.handleGeofence(2,{identifier:place.id});
  assert.equal(h.scheduled.filter(n => n.content.data.kind === 'departure').length,1);
});

test('saved places respect the night window and short visits do not notify', async () => {
  const h = harness(), geo = h.load('geofencing');
  await h.load('saved-places').savePlace({address:'Party',latitude:42.04,longitude:-93.67},'Party');
  await geo.refreshSavedPlaceMonitoring();
  const place = (await h.load('saved-places').readSavedPlaces())[0];
  const point = () => ({timestamp:h.now(),coords:{latitude:place.lat,longitude:place.lon,accuracy:5}});
  await geo.processVenueLocation(point(),true);
  h.advance(44);
  await geo.handleGeofence(2,{identifier:place.id});
  assert.equal(h.scheduled.length,0);
  h.advance(8*60);
  await geo.processVenueLocation(point(),true);
  assert.equal(h.night().status,'idle');
  assert.equal(h.tracking(),false);
});

test('removing a saved place clears its cached fence and visit without a departure', async () => {
  const h = harness(), geo = h.load('geofencing'), places = h.load('saved-places');
  await places.savePlace({address:'Party',latitude:42.04,longitude:-93.67},'Party');
  await geo.processVenueLocation({timestamp:h.now(),coords:{latitude:42.04,longitude:-93.67,accuracy:5}},true);
  const place = (await places.readSavedPlaces())[0];
  h.advance(46);
  await places.removeSavedPlace(place.id);
  await geo.refreshSavedPlaceMonitoring();
  await geo.handleGeofence(2,{identifier:place.id});
  assert.ok(!h.regions().some(r => r.identifier === place.id));
  assert.ok(!JSON.parse(h.data.get('polarys.tracking.v2')).venues.some(v=>v.id===place.id));
  assert.equal(h.night().status,'idle');
  assert.equal(h.scheduled.length,0);
});

test('saved addresses reserve fence slots even among 20 closer Google venues', async () => {
  const nearby = Array.from({length:20},(_,i)=>({id:`google${i}`,name:`Bar ${i}`,lat:42.02+i/10000,lon:-93.65}));
  const h = harness(new Map(),true,nearby);
  await h.load('saved-places').savePlace({address:'Far friend',latitude:42.05,longitude:-93.69},'Far friend');
  await h.load('geofencing').processVenueLocation(fix(h),true);
  assert.equal(h.regions().length,20);
  assert.ok(h.regions().some(r=>r.identifier.startsWith('personal:')));
});

test('saved places validate coordinates, deduplicate, and enforce the limit', async () => {
  const h = harness(), places = h.load('saved-places');
  await assert.rejects(()=>places.savePlace({address:'Bad',latitude:NaN,longitude:0},''));
  for(let i=0;i<10;i++) await places.savePlace({address:`Place ${i}`,latitude:40+i/100,longitude:-93},'');
  await places.savePlace({address:'Updated',latitude:40,longitude:-93},'Updated');
  assert.equal((await places.readSavedPlaces()).length,10);
  await assert.rejects(()=>places.savePlace({address:'Extra',latitude:41,longitude:-93},''));
});
