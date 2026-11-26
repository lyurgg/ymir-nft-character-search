const assert=require('node:assert/strict');
const W=require('./wallet-items-core.js'),S=require('./item-sales-core.js');
const A='0x'+'a'.repeat(40),B='0x'+'b'.repeat(40),C='0x'+'c'.repeat(40);
assert.equal(W.address(' '+A.toUpperCase()+' '),A);assert.equal(W.address('0x'+'0'.repeat(40)),'');assert.equal(W.address('bad'),'');
assert.equal(W.side({buyer:A,seller:B},A),'bought');assert.equal(W.side({buyer:B,seller:A},A),'sold');assert.equal(W.side({buyer:A,seller:A},A),'self');
assert.equal(W.resultLimit('1003'),1003);assert.equal(W.resultLimit(' 1003 '),1003);assert.equal(W.resultLimit(1),1);
for(const value of [0,-1,1.5,NaN,Infinity,'','1e3','1003.0',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>W.resultLimit(value),/positive whole number/);
const names={'30424029':'Sindri Shoes'},epoch=1795000000,head=100000;
const event=(n,{buyer=A,seller=B,code='30424029',index=30,hash=n}={})=>({
 address:S.MARKET,topics:[S.TOPIC,S.SERVICE],blockNumber:'0x'+n.toString(16),transactionHash:'0x'+hash.toString(16).padStart(64,'0'),logIndex:'0x'+index.toString(16),removed:false,
 data:'0x'+seller.slice(2).padStart(64,'0')+buyer.slice(2).padStart(64,'0')+(25000n*10n**18n+1n).toString(16).padStart(64,'0')+Buffer.from(code).toString('hex').padEnd(64,'0')
});
const events=[];
for(let n=0;n<26;n++)events.push(event(99999-n,{buyer:n%2?B:A,seller:n%2?A:B}));
events.push(event(100000,{code:'99999999'})); // Newer unknown codes never displace mapped trades.
events.push(event(100000,{buyer:C,seller:B,index:31})); // An unrelated wallet's event.
events.push(event(99999)); // Duplicate provider row.
const progress=[],found=[],queries=[];
async function rpc(method,p,signal){
 signal?.throwIfAborted();
 if(method==='eth_blockNumber')return '0x'+head.toString(16);
 if(method==='eth_getBlockByNumber')return {timestamp:'0x'+(epoch+Number(BigInt(p[0]))).toString(16)};
 if(method==='eth_getLogs'){
  const from=Number(BigInt(p[0].fromBlock)),to=Number(BigInt(p[0].toBlock));queries.push([from,to]);
  // Simulate the older range completing first: the displayed limit still uses strict newest order.
  if(to===head)await new Promise(r=>setTimeout(r,5));
  return events.filter(e=>Number(BigInt(e.blockNumber))>=from&&Number(BigInt(e.blockNumber))<=to);
 }
 throw Error('Unexpected RPC method');
}
(async()=>{
 const result=await W.scan({wallet:A,names,rpc,onMatch:r=>found.push(r),onProgress:p=>progress.push(p)});
 assert.equal(result.hitLimit,true);assert.equal(result.rangeComplete,false);assert.equal(result.rows.length,20);assert.equal(result.unknown,1);
 assert.deepEqual(result.rows.map(r=>r.block),Array.from({length:20},(_,i)=>99999-i));
 assert.equal(result.rows[0].name,'Sindri Shoes');assert.equal(result.rows[0].direction,'bought');assert.equal(result.rows[1].direction,'sold');
 assert.equal(result.rows[0].amount_wei,'25000000000000000000001');assert.equal(found.length,20);assert.equal(queries.length,2);
 const many=Array.from({length:1040},(_,i)=>event(99999-i));
 const manyRpc=async(m,p,s)=>m==='eth_getLogs'?many.filter(e=>Number(BigInt(e.blockNumber))>=Number(BigInt(p[0].fromBlock))&&Number(BigInt(e.blockNumber))<=Number(BigInt(p[0].toBlock))):rpc(m,p,s);
 const custom=await W.scan({wallet:A,names,rpc:manyRpc,limit:1003});
 assert.equal(custom.limit,1003);assert.equal(custom.rows.length,1003);assert.equal(custom.hitLimit,true);assert.equal(custom.rows.at(-1).block,98997);
 const bought=await W.scan({wallet:A,names,rpc,direction:'bought'});assert.equal(bought.rows.length,13);assert.ok(bought.rows.every(r=>r.direction==='bought'));assert.equal(bought.rangeComplete,true);
 const sold=await W.scan({wallet:A,names,rpc,direction:'sold'});assert.equal(sold.rows.length,13);assert.ok(sold.rows.every(r=>r.direction==='sold'));
 // Self trades appear once and can be selected from either direction.
 const selfRpc=async(m,p,s)=>m==='eth_getLogs'?[event(Number(BigInt(p[0].toBlock)),{buyer:A,seller:A})]:rpc(m,p,s);
 const self=await W.scan({wallet:A,names,rpc:selfRpc,direction:'sold'});assert.ok(self.rows.every(r=>r.direction==='self'));
 const empty=await W.scan({wallet:'0x'+'d'.repeat(40),names,rpc});assert.equal(empty.rows.length,0);assert.equal(empty.rangeComplete,true);
 await assert.rejects(W.scan({wallet:'invalid',names,rpc}),/full WEMIX/);
 await assert.rejects(W.scan({wallet:A,names,rpc,days:3}),/supported/);
 await assert.rejects(W.scan({wallet:A,names,rpc,limit:0}),/positive whole number/);
 await assert.rejects(W.scan({wallet:A,names,rpc:async(m,p,s)=>m==='eth_getLogs'?Promise.reject(Error('provider failed')):rpc(m,p,s)}),/provider failed/);
 const aborted=new AbortController();aborted.abort();await assert.rejects(W.scan({wallet:A,names,rpc,signal:aborted.signal}),{name:'AbortError'});
 console.log('Wallet item checks passed: custom 1003-item limit, newest-first order, mapped codes, buys/sales/self trades, exact prices, duplicate rejection, coverage, failures and cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
