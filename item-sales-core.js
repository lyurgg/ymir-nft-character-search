(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ItemSales=factory();})(typeof globalThis==='object'?globalThis:this,()=>{
    'use strict';
    const MARKET='0x24640d0fe98d8e971fff31fd7eca4c71f2dc7e12';
    const TOPIC='0x5655c42d8c06c9070cd603d30d7fd3447bb4eba3333535deecff35aa91a085d7';
    const SERVICE='0x4c4f59547261646545786368616e676572323232000000000000000000000000';
    const RPC='https://api.wemix.com';
    function decode(log) {
        if(!log||log.removed||log.address?.toLowerCase()!==MARKET||log.topics?.[0]?.toLowerCase()!==TOPIC||log.topics?.[1]?.toLowerCase()!==SERVICE)return null;
        if(!/^0x[0-9a-f]{256}$/i.test(log.data)||!/^0x[0-9a-f]{64}$/i.test(log.transactionHash)||!/^0x[0-9a-f]+$/i.test(log.blockNumber)||!/^0x[0-9a-f]+$/i.test(log.logIndex))return null;
        const words=log.data.slice(2).match(/.{64}/g);
        if(!/^0{24}/.test(words[0])||!/^0{24}/.test(words[1]))return null;
        const bytes=words[3].match(/../g).map(n=>parseInt(n,16));
        const zero=bytes.indexOf(0),end=zero<0?bytes.length:zero;
        if(bytes.slice(end).some(b=>b!==0))return null;
        const code=String.fromCharCode(...bytes.slice(0,end));
        if(!/^\d{1,20}$/.test(code))return null;
        return {code,seller:'0x'+words[0].slice(24).toLowerCase(),buyer:'0x'+words[1].slice(24).toLowerCase(),amount_wei:BigInt('0x'+words[2]).toString(),tx_hash:log.transactionHash.toLowerCase(),block:Number(BigInt(log.blockNumber)),log_index:Number(BigInt(log.logIndex))};
    }
    function amount(wei) {
        const n=BigInt(wei),whole=n/10n**18n,part=(n%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');
        return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')+(part?'.'+part:'');
    }
    function dates(after,before) {
        const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
        if(!valid(after)||!valid(before))throw Error('Choose valid start and end dates.');
        const start=Date.parse(after+'T00:00:00+08:00')/1000,end=Date.parse(before+'T00:00:00+08:00')/1000+86400;
        if(start>=end)throw Error('The end date must be on or after the start date.');
        return {start,end};
    }
    function client(fetcher=fetch) {
        let id=0;
        return async function rpc(method,params,signal) {
            let last;
            for(let attempt=0;attempt<3;attempt++) {
                signal?.throwIfAborted();
                try {
                    const response=await fetcher(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(30000)])});
                    if(!response.ok)throw Error('WEMIX endpoint returned HTTP '+response.status);
                    const data=await response.json();
                    if(data.error)throw Error(data.error.message||'WEMIX query failed');
                    if(!Object.hasOwn(data,'result'))throw Error('WEMIX returned an incomplete response');
                    return data.result;
                } catch(error) {
                    signal?.throwIfAborted();last=error;
                    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
                }
            }
            throw last;
        };
    }
    async function scan({code,start,end,rpc=client(),signal,onProgress=()=>{},onMatch=()=>{}}) {
        if(!/^\d{1,20}$/.test(code))throw Error('Enter one numeric item code, or choose Find purchases from the item dictionary.');
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=end)throw Error('Invalid date range');
        const halt=new AbortController();signal=AbortSignal.any([halt.signal,...(signal?[signal]:[])]);
        const cache=new Map();
        async function block(n) {
            if(!cache.has(n))cache.set(n,rpc('eth_getBlockByNumber',['0x'+n.toString(16),false],signal).then(b=>{
                if(!b||!/^0x[0-9a-f]+$/i.test(b.timestamp))throw Error('A block timestamp was unavailable; the scan is incomplete.');
                return Number(BigInt(b.timestamp));
            }));
            return cache.get(n);
        }
        const head=Number(BigInt(await rpc('eth_blockNumber',[],signal))),latest=await block(head);
        if(start>latest)return {matches:[],blocks:0,latest,head,complete:true};
        async function lowerBound(time) {
            if(time>latest)return head+1;
            let lo=0,hi=head;
            while(lo<hi) {
                signal?.throwIfAborted();
                const mid=Math.floor((lo+hi)/2);
                if(await block(mid)<time)lo=mid+1;else hi=mid;
            }
            return lo;
        }
        onProgress({phase:'dates',done:0,total:0});
        const from=await lowerBound(start),until=await lowerBound(end),to=Math.min(head,until-1);
        const total=Math.max(0,to-from+1),matches=[],seen=new Set();let cursor=from,done=0;
        async function range(first,last) {
            signal?.throwIfAborted();
            let logs;
            try {
                logs=await rpc('eth_getLogs',[{address:MARKET,topics:[TOPIC,SERVICE],fromBlock:'0x'+first.toString(16),toBlock:'0x'+last.toString(16)}],signal);
                if(!Array.isArray(logs))throw Error('Invalid event-log response');
                // Split possible provider caps rather than treating a full response as complete.
                if(logs.length>=5000){
                    if(first===last)throw Error('The event provider limit was reached in one block; the scan is incomplete.');
                    const mid=Math.floor((first+last)/2);await range(first,mid);await range(mid+1,last);return;
                }
            } catch(error) {
                signal?.throwIfAborted();
                if(last-first>=1000){const mid=Math.floor((first+last)/2);await range(first,mid);await range(mid+1,last);return;}
                throw error;
            }
            for(const raw of logs) {
                const row=decode(raw);
                if(!row||row.code!==code||row.block<first||row.block>last)continue;
                const identity=row.tx_hash+':'+row.log_index;
                if(seen.has(identity))continue;
                row.at=await block(row.block);
                if(row.at<start||row.at>=end)continue;
                seen.add(identity);matches.push(row);onMatch(row);
            }
            done+=last-first+1;onProgress({phase:'logs',done,total,found:matches.length});
        }
        async function worker() {
            while(cursor<=to){const first=cursor,last=Math.min(to,first+19999);cursor=last+1;await range(first,last);}
        }
        // Wait for both workers even when one fails; a failed scan never keeps adding rows afterward.
        let failure;
        const guarded=()=>worker().catch(error=>{if(!failure)failure=error;halt.abort();throw error;});
        await Promise.allSettled([guarded(),guarded()]);if(failure)throw failure;
        matches.sort((a,b)=>b.at-a.at||b.log_index-a.log_index);
        return {matches,blocks:total,latest,head,complete:true};
    }
    return {MARKET,TOPIC,SERVICE,decode,amount,dates,client,scan};
});
