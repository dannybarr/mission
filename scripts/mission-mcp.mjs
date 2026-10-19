// Dependency-free MCP stdio adapter. Never log memory or credentials.
import net from 'node:net';
const port=Number(process.env.MISSION_PORT), token=process.env.MISSION_TOKEN;
if(!Number.isInteger(port)||port<1||port>65535||!token||!/^[a-f0-9]{64}$/.test(token)) {
  process.stderr.write('Generate a connection in the unlocked Mission desktop app.\n');process.exit(1);
}
delete process.env.MISSION_TOKEN;
const limit=250000;
async function forward(request) {
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host:'127.0.0.1',port});let data='';
    socket.setEncoding('utf8');socket.setTimeout(4000);
    socket.on('connect',()=>socket.write(JSON.stringify({token,request})+'\n'));
    socket.on('data',chunk=>{ data+=chunk;if(Buffer.byteLength(data)>1048576){socket.destroy();reject(new Error());}else if(data.includes('\n')){socket.end();try{resolve(JSON.parse(data.slice(0,data.indexOf('\n'))));}catch{reject(new Error());}} });
    socket.on('timeout',()=>{socket.destroy();reject(new Error());});socket.on('error',reject);
    socket.on('end',()=>{if(!data.includes('\n'))reject(new Error());});
  });
}
let buffer='';let chain=Promise.resolve();let queued=0;
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  buffer+=chunk;
  if(Buffer.byteLength(buffer)>limit){process.stderr.write('MCP request exceeds limit.\n');process.exit(1);}
  while(buffer.includes('\n')){
    const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    if(!line.trim())continue;
    if(++queued>16){process.stderr.write('Too many pending MCP requests.\n');process.exit(1);}
    chain=chain.then(async()=>{
      let request;
      try {request=JSON.parse(line);}catch {process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');return;}
      const hasId=request&&Object.hasOwn(request,'id');
      try {const response=await forward(request);if(hasId&&response!==null)process.stdout.write(JSON.stringify(response)+'\n');}
      catch {if(hasId)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32001,message:'Mission unavailable. Unlock the vault and generate a new connection.'}})+'\n');}
    }).finally(()=>{queued--;});
  }
});
