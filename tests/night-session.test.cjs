const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
function load(name){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..','src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:n=>load(n.replace('./','')),process:{env:{}}});return exports;}
const {emptyNight,reduceNight,totalVenueMs,isNightTime,activityBreakdown}=load('night-session');
const m=60000, t=new Date(2026,8,27,21,0).getTime();
const A={id:'a',name:'Bar A'},B={id:'b',name:'Bar B'};
const enter=(s,at=t,venue=A)=>reduceNight(s,{type:'enter',venue},at);
const event=(s,type,at)=>reduceNight(s,{type},at);
test('45-minute boundary; a car inside fence can trigger; duplicate car does not repeat',()=>{
 let s=enter(emptyNight(t));assert.equal(event(s,'car',t+44*m).carAlertIssued,false);
 s=event(s,'car',t+45*m);assert.equal(s.carAlertIssued,true);assert.equal(s.totalVenueMs,45*m);
 assert.equal(event(s,'car',t+46*m).atRiskUntil,s.atRiskUntil);
});
test('legacy purchase flag cannot lower the 45-minute threshold',()=>{
 const s={...enter(emptyNight(t)),purchaseLogged:true};
 assert.equal(event(s,'car',t+20*m).carAlertIssued,false);
 assert.equal(event(s,'car',t+45*m).carAlertIssued,true);
});
test('bar hopping accumulates venue time but excludes travel; over 15 minutes resets',()=>{
 let s=enter(emptyNight(t));s=event(s,'leave',t+25*m);s=enter(s,t+40*m,B);
 assert.equal(totalVenueMs(s,t+60*m),45*m);
 s=event(s,'leave',t+60*m);s=enter(s,t+76*m,A);assert.equal(s.totalVenueMs,0);
});
test('duplicate enter and exit do not inflate time',()=>{
 let s=enter(emptyNight(t));s=enter(s,t+10*m);assert.equal(s.entryTime,t);
 s=event(s,'leave',t+45*m);s=event(s,'leave',t+50*m);assert.equal(s.totalVenueMs,45*m);assert.equal(s.lastLeftAt,t+45*m);
});
test('90-minute expiry is anchored to exit, cannot renew on repeated finalize',()=>{
 let s=enter(emptyNight(t));s=event(s,'leave',t+45*m);s=event(s,'finalize',t+61*m);
 assert.equal(s.atRiskUntil,t+135*m);assert.equal(event(s,'finalize',t+70*m).atRiskUntil,t+135*m);
 assert.equal(event(s,'car',t+135*m).status,'idle');
});
test('night crosses midnight but stops exactly at 5am; next evening cannot revive it',()=>{
 const late=new Date(2026,8,27,23,40).getTime();let s=enter(emptyNight(late),late);
 assert.equal(event(s,'car',late+45*m).carAlertIssued,true);
 const end=new Date(2026,8,28,5).getTime();assert.equal(event(s,'car',end).status,'idle');
 assert.equal(event(s,'car',new Date(2026,8,28,21).getTime()).status,'idle');
});
test('daytime entry ignored; 9pm inclusive and 5am exclusive',()=>{
 const day=new Date(2026,8,27,20,59).getTime();assert.equal(enter(emptyNight(day),day).status,'idle');
 assert.equal(isNightTime(t),true);assert.equal(isNightTime(new Date(2026,8,28,5).getTime()),false);
});
test('home clears risk; handled suppresses repeated alert',()=>{
 let s=enter(emptyNight(t));s=event(s,'car',t+45*m);s=event(s,'handled',t+46*m);
 assert.equal(event(s,'car',t+47*m).alertHandled,true);
 s=event(s,'home',t+48*m);assert.equal(s.status,'idle');
});
test('six-hour cap prevents continued accumulation; pure input is not mutated',()=>{
 const s=enter(emptyNight(t));Object.freeze(s);
 const capped=event(s,'tick',t+360*m);assert.equal(capped.status,'at_risk');assert.equal(capped.totalVenueMs,360*m);
 assert.equal(s.totalVenueMs,0);assert.equal(s.status,'at_venue');
});
test('stale events ignored and JSON roundtrip preserves state',()=>{
 const s=enter(emptyNight(t));assert.equal(event(s,'leave',t-1),s);
 const restored=JSON.parse(JSON.stringify(s));assert.equal(event(restored,'car',t+45*m).carAlertIssued,true);
});

test('time points keep increasing; risk follows 45 minutes and car connection, not points alone',()=>{
 let s=enter(emptyNight(t));
 assert.equal(activityBreakdown(s,t+10*m).venuePoints,5);
 assert.equal(activityBreakdown(s,t+44*m).level,'Low');
 assert.equal(activityBreakdown(s,t+45*m).venuePoints,22.5);
 assert.equal(activityBreakdown(s,t+45*m).level,'Medium');
 assert.equal(activityBreakdown(s,t+120*m).venuePoints,60);
 assert.equal(activityBreakdown(s,t+120*m).level,'Medium');
 s=event(s,'car',t+45*m);
 assert.equal(activityBreakdown(s,t+45*m).total,62.5);
 assert.equal(activityBreakdown(s,t+45*m).level,'High');
 assert.equal(activityBreakdown(event(s,'home',t+46*m),t+46*m).total,0);
});
test('travel does not add points; session expiry resets activity risk',()=>{
 let s=event(enter(emptyNight(t)),'leave',t+45*m);
 assert.equal(activityBreakdown(s,t+55*m).venuePoints,22.5);
 s=event(s,'finalize',t+61*m);
 assert.equal(activityBreakdown(s,t+135*m).total,0);
 assert.equal(activityBreakdown(s,t+135*m).level,'Low');
});
