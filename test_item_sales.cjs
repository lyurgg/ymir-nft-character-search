const assert=require('node:assert/strict');
const sales=require('./item-sales-core.js');
// Retained purchase-event fields from the live 25,000 WEMIX Sindri Shoes receipt.
const fixture={address:sales.MARKET,topics:[sales.TOPIC,sales.SERVICE,'0x0296324ff689f9946991abaaa42675bf9e9de4913dac5200000000000b8d9869'],data:'0x'+'000000000000000000000000beaabc38996609c58c1de8d30acd368ef47d5b63'+'00000000000000000000000099e445f47211ef3ee91ee478244b42871187fc75'+'00000000000000000000000000000000000000000000054b40b1f852bda00000'+'3330343234303239000000000000000000000000000000000000000000000000',transactionHash:'0xf473f955e633c27228b1432836cc94d10353013ceda6f0b812b3b6f86003c7a1',blockNumber:'0x71e9e55',logIndex:'0x1e',removed:false};
assert.equal(sales.decode(fixture).code,'30424029');
assert.equal(sales.decode(fixture).amount_wei,'25000000000000000000000');
assert.equal(sales.decode(fixture).seller,'0xbeaabc38996609c58c1de8d30acd368ef47d5b63');
assert.equal(sales.decode(fixture).buyer,'0x99e445f47211ef3ee91ee478244b42871187fc75');
assert.equal(sales.decode({...fixture,removed:true}),null);
assert.equal(sales.decode({...fixture,address:'0x'+'0'.repeat(40)}),null);
assert.equal(sales.decode({...fixture,data:fixture.data+'00'}),null);
assert.equal(sales.decode({...fixture,data:fixture.data.slice(0,-2)+'ff'}),null);
assert.equal(sales.amount('25000000000000000000001'),'25,000.000000000000000001');
assert.deepEqual(sales.dates('2026-08-02','2026-08-02'),{start:1785600000,end:1785686400});
assert.throws(()=>sales.dates('2026-08-03','2026-08-02'));

(async()=>{
    const epoch=1785600000,head=60000,calls=[],progress=[],found=[];
    const log=(n,index=30)=>({...fixture,transactionHash:'0x'+n.toString(16).padStart(64,'0'),blockNumber:'0x'+n.toString(16),logIndex:'0x'+index.toString(16)});
    const events=[log(19999),log(20000),log(59999),log(60000)];
    async function rpc(method,params,signal){
        signal?.throwIfAborted();
        if(method==='eth_blockNumber')return '0x'+head.toString(16);
        if(method==='eth_getBlockByNumber')return {timestamp:'0x'+(epoch+Number(BigInt(params[0]))).toString(16)};
        if(method==='eth_getLogs'){
            const from=Number(BigInt(params[0].fromBlock)),to=Number(BigInt(params[0].toBlock));calls.push([from,to]);
            return events.filter(e=>Number(BigInt(e.blockNumber))>=from&&Number(BigInt(e.blockNumber))<=to);
        }
        throw Error('Unexpected method');
    }
    const result=await sales.scan({code:'30424029',start:epoch+19999,end:epoch+60000,rpc,onProgress:p=>progress.push(p),onMatch:r=>found.push(r)});
    assert.equal(result.complete,true);assert.equal(result.blocks,40001);assert.equal(found.length,3);
    assert.deepEqual(calls.sort((a,b)=>a[0]-b[0]),[[19999,39998],[39999,59998],[59999,59999]]);
    assert.equal(progress.at(-1).done,40001);assert.equal(progress.at(-1).total,40001);
    assert.deepEqual(result.matches.map(r=>r.block),[59999,20000,19999]);
    assert.equal((await sales.scan({code:'1',start:epoch+70000,end:epoch+80000,rpc})).blocks,0);
    await assert.rejects(sales.scan({code:'Sindri Shoes',start:epoch,end:epoch+1,rpc}),/numeric item code/);
    await assert.rejects(sales.scan({code:'30424029',start:epoch,end:epoch+20,rpc:async(method,p,s)=>method==='eth_getLogs'?Promise.reject(Error('provider unavailable')):rpc(method,p,s)}),/provider unavailable/);
    const abort=new AbortController();abort.abort();await assert.rejects(sales.scan({code:'30424029',start:epoch,end:epoch+20,rpc,signal:abort.signal}),{name:'AbortError'});
    // A provider-sized response must be split, with deduplication by transaction plus log index.
    let capped=0;
    const cappedRpc=async(method,p,s)=>{
        if(method!=='eth_getLogs')return rpc(method,p,s);
        const a=Number(BigInt(p[0].fromBlock)),b=Number(BigInt(p[0].toBlock));capped++;
        if(b-a>1)return Array(5000).fill(log(a));
        return [log(a),log(a),log(a,31)];
    };
    const split=await sales.scan({code:'30424029',start:epoch,end:epoch+4,rpc:cappedRpc});
    assert.equal(capped,3);assert.equal(split.matches.length,4);assert.equal(split.blocks,4);
    console.log('Item purchase checks passed: real Sindri receipt decoding, exact amounts, PHT dates, date boundaries, full range coverage, provider caps, errors and cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
