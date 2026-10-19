import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
test('stdio adapter preserves JSON-RPC, suppresses notification replies and returns revocation errors', {timeout:15000}, async t=>{
  const token='a'.repeat(64);let locked=false;let calls=0;
  const server=net.createServer(socket=>{
    let data='';socket.setEncoding('utf8');socket.on('data',chunk=>{
      data+=chunk;if(!data.includes('\n'))return;
      const {token:actual,request}=JSON.parse(data);assert.equal(actual,token);calls++;
      socket.end(JSON.stringify(locked?{jsonrpc:'2.0',id:request.id,error:{code:-32001,message:'Vault locked'}}:request.id===undefined?null:{jsonrpc:'2.0',id:request.id,result:{method:request.method}})+'\n');
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const child=spawn(process.execPath,['scripts/mission-mcp.mjs'],{env:{...process.env,MISSION_PORT:String(server.address().port),MISSION_TOKEN:token},stdio:['pipe','pipe','pipe']});
  t.after(()=>{child.kill();server.close();});
  const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize'})+'\n');
  assert.equal(JSON.parse((await lines.next()).value).result.method,'initialize');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})+'\n');
  assert.equal(JSON.parse((await lines.next()).value).id,2);assert.equal(calls,3);
  locked=true;child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call'})+'\n');
  assert.equal(JSON.parse((await lines.next()).value).error.code,-32001);
});
