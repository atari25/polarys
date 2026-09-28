const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
function harness(response={}, nativeResults=[]) {
 const data=new Map(), requests=[],opened=[],cache={};
 function load(name) {
  if(cache[name]) return cache[name];
  const exports={}; cache[name]=exports;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
   exports, require:key=>{
    if(key==='./config')return {GOOGLE_API_KEY:'test'};
    if(key==='./storage')return {STORAGE_KEYS:{home:'home'},deviceStorage:{getItem:async k=>data.get(k)??null,setItem:async(k,v)=>data.set(k,v)}};
    if(key==='expo-location') return {
     geocodeAsync:async()=>nativeResults,
     reverseGeocodeAsync:async()=>{throw Error('Reverse geocoder unavailable');},
    };
    if(key==='react-native')return {Platform:{OS:'ios'},Linking:{canOpenURL:async()=>true,openURL:async url=>opened.push(url)}};
    if(key==='./user-location') return {addressLabel:()=>'',currentLocation:async()=>({latitude:42.03,longitude:-93.64})};
    return load(key.slice(2));
   },
   fetch:async(url,options)=>{requests.push({url,options});return {ok:response.ok??true,status:response.status??200,json:async()=>response};},
  });return exports;
 }
 return {api:load('home-address'),load,data,requests,opened};
}
test('suggestions use returned place IDs and labels; short inputs make no request',async()=>{
 const h=harness({suggestions:[{placePrediction:{placeId:'place-1',text:{text:'123 Main, Ames'}}},{}]});
 assert.equal((await h.api.suggestAddresses('12',new AbortController().signal)).length,0);
 const values=await h.api.suggestAddresses('123 Main',new AbortController().signal);
 assert.equal(values.length,1);assert.equal(values[0].id,'place-1');
 assert.equal(JSON.parse(h.requests[0].options.body).input,'123 Main');
});
test('chosen suggestion resolves to coordinates and persists canonical address',async()=>{
 const h=harness({formattedAddress:'123 Main St, Ames, IA',location:{latitude:42,longitude:-93}});
 const home=await h.api.resolveAddress({id:'place/1',address:'partial',source:'google'});
 assert.equal(home.address,'123 Main St, Ames, IA');
 await h.api.saveHome(home);
 assert.equal((await h.api.readHome()).latitude,42);
 assert.ok(h.requests[0].url.endsWith('place%2F1'));
});
test('API failure and missing coordinates cannot save a false home',async()=>{
 const h=harness({ok:false});
 assert.equal((await h.api.suggestAddresses('123 Main',new AbortController().signal)).length,0);
 await assert.rejects(()=>h.api.resolveAddress({id:'x',address:'x',source:'google'}));
 await assert.rejects(()=>h.api.saveHome({latitude:NaN,longitude:0,address:'x'}));
 assert.equal(h.data.has('home'),false);
});
test('old coordinate-only homes remain usable; invalid storage is rejected',async()=>{
 const h=harness();h.data.set('home',JSON.stringify({latitude:42,longitude:-93}));
 assert.equal((await h.api.readHome()).address,'Home');
 h.data.set('home','{broken');assert.equal(await h.api.readHome(),null);
 h.data.set('home',JSON.stringify({latitude:120,longitude:0,address:'bad'}));assert.equal(await h.api.readHome(),null);
});

test('Google 403 falls back to device candidates and does not repeatedly call a denied API',async()=>{
 const h=harness({ok:false,status:403},[{latitude:42.02,longitude:-93.65}]);
 const values=await h.api.suggestAddresses('123 Main St, Ames, IA',new AbortController().signal);
 assert.equal(values[0].source,'device');
 assert.equal(values[0].coordinates.address,'123 Main St, Ames, IA');
 await h.api.suggestAddresses('124 Main St, Ames, IA',new AbortController().signal);
 assert.equal(h.requests.length,1);
 const home=await h.api.resolveAddress(values[0]); await h.api.saveHome(home);
 assert.equal((await h.api.readHome()).address,'123 Main St, Ames, IA');
});
test('device fallback home flows through actual ride actions into Uber and Lyft destinations',async()=>{
 const h=harness({ok:false,status:403},[{latitude:42.02,longitude:-93.65}]);
 const results=await h.api.suggestAddresses('123 Main St, Ames, IA',new AbortController().signal);
 await h.api.saveHome(await h.api.resolveAddress(results[0]));
 const rides=h.load('ride-actions');
 await rides.openRide('uber');await rides.openRide('lyft');
 const uber=new URL(h.opened[0]).searchParams,lyft=new URL(h.opened[1]).searchParams;
 assert.equal(uber.get('dropoff[latitude]'),'42.02');
 assert.equal(uber.get('dropoff[formatted_address]'),'123 Main St, Ames, IA');
 assert.equal(lyft.get('destination[longitude]'),'-93.65');
 assert.equal(lyft.get('pickup[latitude]'),'42.03');
});
test('selected Google prediction can resolve with device geocoder if Place Details is denied',async()=>{
 const h=harness({ok:false,status:403},[{latitude:42.02,longitude:-93.65}]);
 const home=await h.api.resolveAddress({id:'place-id',address:'123 Main, Ames',source:'google'});
 assert.equal(home.latitude,42.02);assert.equal(home.address,'123 Main, Ames');
});
test('cancelled suggestions do not return late native results',async()=>{
 const h=harness({ok:false,status:403},[{latitude:42.02,longitude:-93.65}]);
 const controller=new AbortController();controller.abort();
 assert.equal((await h.api.suggestAddresses('123 Main',controller.signal)).length,0);
 assert.equal(h.requests.length,0);
});
