const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
function load(native) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/location-task-lifecycle.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,require:()=>native});
 return exports.stopLocationTask;
}
test('concurrent startup and old-task callbacks stop the retired tracker only once',async()=>{
 let active=true,stops=0;
 const stop=load({
  hasStartedLocationUpdatesAsync:async()=>active,
  stopLocationUpdatesAsync:async()=>{stops++;if(!active)throw Error('Task not found');active=false;},
 });
 await Promise.all([stop('legacy'),stop('legacy'),stop('legacy')]);
 assert.equal(stops,1);await stop('legacy');assert.equal(stops,1);
});
test('native removal between check and stop is harmless',async()=>{
 let active=true;
 const stop=load({
  hasStartedLocationUpdatesAsync:async()=>active,
  stopLocationUpdatesAsync:async()=>{active=false;throw Error("Task 'legacy' not found for app ID 'mainApplication'.");},
 });
 await stop('legacy');
});
test('real stop failures are surfaced and can be retried',async()=>{
 let fail=true,stops=0;
 const stop=load({
  hasStartedLocationUpdatesAsync:async()=>true,
  stopLocationUpdatesAsync:async()=>{stops++;if(fail)throw Error('Native service unavailable');},
 });
 await assert.rejects(stop('legacy'),/Native service unavailable/);
 fail=false;await stop('legacy');assert.equal(stops,2);
});
test('missing-task error is not swallowed if the task is still registered',async()=>{
 const stop=load({hasStartedLocationUpdatesAsync:async()=>true,stopLocationUpdatesAsync:async()=>{throw Error('Task not found');}});
 await assert.rejects(stop('legacy'),/not found/);
});
