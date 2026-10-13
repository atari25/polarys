const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../supabase/functions/push-broadcast/validation.mjs');
const message = { id: '11111111-1111-4111-8111-111111111111', title: 'Heading home?', body: 'Check your ride options.', dryRun: true };
test('broadcast requires valid content and explicit send confirmation', async () => {
 const {validateBroadcast}=await load();
 assert.equal(validateBroadcast(message).dryRun,true);
 assert.throws(()=>validateBroadcast({...message,dryRun:false}));
 assert.throws(()=>validateBroadcast({...message,title:''}));
 assert.throws(()=>validateBroadcast({...message,body:'x'.repeat(501)}));
 assert.throws(()=>validateBroadcast({...message,id:'same'}));
 assert.equal(validateBroadcast({...message,dryRun:false,confirm:'SEND'}).dryRun,false);
});
test('broadcast cannot inject a different route or extend a stale reminder lifetime',async()=>{
 const {pushMessage}=await load();const result=pushMessage('ExpoPushToken[test]',{...message,route:'other',ttl:999999});
 assert.equal(result.data.route,'alert');assert.equal(result.ttl,3600);assert.equal(result.data.broadcastId,message.id);
});
test('test recipient must be an Expo token',async()=>{
 const {validateBroadcast}=await load();
 assert.throws(()=>validateBroadcast({...message,testToken:'all'}));
 assert.equal(validateBroadcast({...message,testToken:'ExpoPushToken[test-1]'}).testToken,'ExpoPushToken[test-1]');
});
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
async function handlerHarness(secret='s'.repeat(40)) {
 const validation=await load(); let handler, databaseCalls=0;
 let source=fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/push-broadcast/index.ts'),'utf8');
 source=source.replace(/import .*?;\n/g,'');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
  Deno:{env:{get:name=>name==='PUSH_ADMIN_SECRET'?secret:'test'},serve:fn=>{handler=fn;}},
  createClient:()=>{databaseCalls++;throw Error('Unexpected database access');},
  ...validation,Response,Request,TextEncoder,crypto:require('node:crypto').webcrypto,AbortSignal,
 });
 return {handler,calls:()=>databaseCalls};
}
test('admin endpoint rejects missing or wrong credentials before database access',async()=>{
 const h=await handlerHarness();
 for(const headers of [{},{'x-push-admin':'wrong'}]) {
  const response=await h.handler(new Request('https://example.com',{method:'POST',headers,body:'{}'}));
  assert.equal(response.status,401);
 }
 assert.equal(h.calls(),0);
});
test('admin endpoint fails closed when secret is unset or weak',async()=>{
 const h=await handlerHarness('short');
 const response=await h.handler(new Request('https://example.com',{method:'POST',headers:{'x-push-admin':'short'},body:'{}'}));
 assert.equal(response.status,401);assert.equal(h.calls(),0);
});
