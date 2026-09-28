const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../services/social-events.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api});
const row = cells => `<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;
test('official schedule parser keeps confirmed games, TBA, and changed dates; excludes completed games and conditional finals',()=>{
 const html='2026 Football Schedule'+row(['Oct 9 (Fri)','9:15 PM','Away','BYU','Provo, Utah','','-'])+row(['Oct 31 (Sat)','TBA','Home','Oklahoma State','Ames','','-'])+row(['Sep 26 (Sat)','2:30 PM','Home','Utah','Ames','','L 17-31'])+row(['Dec 4 (Fri)','7 PM','Neutral','Big 12 Championship','Arlington','','-']);
 const games=api.parseFootballSchedule(html);
 assert.equal(games.length,2);assert.equal(games[0].date,'2026-10-09');assert.match(games[1].detail,/TBA/);
 assert.throws(()=>api.parseFootballSchedule('<html>Unavailable</html>'));
});
test('calendar dates and Ames timezone boundaries',()=>{
 const events=api.seasonalEvents(2026);
 assert.equal(events.find(e=>e.title==='Thanksgiving Eve').date,'2026-11-25');
 assert.equal(events.find(e=>e.title==='Labor Day').date,'2026-09-07');
 assert.equal(api.amesDate(new Date('2026-10-01T02:00:00Z')),'2026-09-30');
 const upcoming=api.upcomingSocials([],new Date('2026-09-27T12:00:00Z'));
 assert.equal(upcoming[0].title,'Halloween');
 assert.ok(upcoming.some(e=>e.date==='2027-03-17'));
 assert.ok(!upcoming.some(e=>e.date<'2026-09-27'));
});
