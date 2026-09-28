const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const exportsForTest={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/ride-links.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsForTest});
const {rideLinks,friendMessage,validCoordinates}=exportsForTest;
const home={latitude:42.02,longitude:-93.65,address:'123 Main St #4 & Apt B, Ames, IA'},pickup={latitude:42.03,longitude:-93.64};
test('Uber preserves separate pickup, home coordinates, nickname and encoded address in both links',()=>{
 const links=rideLinks('uber',home,pickup);
 for(const link of Object.values(links)) {
  const params=new URL(link).searchParams;
  assert.equal(params.get('dropoff[latitude]'),'42.02');
  assert.equal(params.get('dropoff[longitude]'),'-93.65');
  assert.equal(params.get('dropoff[nickname]'),'Home');
  assert.equal(params.get('dropoff[formatted_address]'),home.address);
  assert.equal(params.get('pickup[latitude]'),'42.03');
 }
});
test('Lyft app and web links preserve the home destination',()=>{
 const links=rideLinks('lyft',home,pickup);
 assert.ok(links.web.startsWith('https://ride.lyft.com/u?'));
 for(const link of Object.values(links)) {
  const params=new URL(link).searchParams;
  assert.equal(params.get('destination[latitude]'),'42.02');
  assert.equal(params.get('destination[longitude]'),'-93.65');
  assert.equal(params.get('pickup[longitude]'),'-93.64');
 }
});
test('missing pickup lets Uber locate the rider; invalid coordinates are rejected',()=>{
 assert.equal(new URL(rideLinks('uber',home).native).searchParams.get('pickup'),'my_location');
 assert.equal(validCoordinates({latitude:100,longitude:0}),false);
 assert.throws(()=>rideLinks('uber',{latitude:NaN,longitude:0,address:'bad'}));
});
test('friend draft includes current location and map pin, never the home destination',()=>{
 const text=friendMessage({...pickup,label:'Welch Ave, Ames'});
 assert.ok(text.startsWith('Hey, could you pick me up?'));
 assert.ok(text.includes('Welch Ave, Ames'));
 assert.ok(text.includes('ll=42.03,-93.64'));
 assert.ok(!text.includes(home.address));
 assert.throws(()=>friendMessage({latitude:NaN,longitude:0,label:'wrong'}));
});
