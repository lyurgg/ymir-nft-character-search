(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./item-sales-core.js'));else root.WalletItems=factory(root.ItemSales);})(typeof globalThis==='object'?globalThis:this,Sales=>{
    'use strict';
    const address=value=>/^0x[0-9a-f]{40}$/i.test(String(value||'').trim())&&!/^0x0{40}$/i.test(String(value).trim())?String(value).trim().toLowerCase():'';
    const side=(row,wallet)=>row.buyer===wallet&&row.seller===wallet?'self':row.buyer===wallet?'bought':row.seller===wallet?'sold':'';
    const order=(a,b)=>b.block-a.block||b.log_index-a.log_index;
    const accepts=(value,filter)=>filter==='all'||value===filter||value==='self';
    async function scan({wallet,names,days=30,limit=20,direction='all',rpc=Sales.client(),signal,onMatch=()=>{},onProgress=()=>{}}) {
        wallet=address(wallet);
        if(!wallet)throw Error('Enter a full WEMIX wallet address (0x followed by 40 hexadecimal characters).');
        if(![7,30,90,365].includes(days)||![20,50,100].includes(limit)||!['all','bought','sold'].includes(direction))throw Error('Choose a supported search range, result limit and direction.');
        if(!names||typeof names!=='object')throw Error('The item-name database is unavailable.');
        const halt=new AbortController();signal=AbortSignal.any([halt.signal,...(signal?[signal]:[])]);
        const blocks=new Map(),hex=n=>'0x'+n.toString(16);
        async function at(n) {
            if(!blocks.has(n))blocks.set(n,rpc('eth_getBlockByNumber',[hex(n),false],signal).then(block=>{
                if(!block||!/^0x[0-9a-f]+$/i.test(block.timestamp))throw Error('A block timestamp was unavailable. Results are incomplete.');
                return Number(BigInt(block.timestamp));
            }));
            return blocks.get(n);
        }
        onProgress({phase:'dates'});
        const head=Number(BigInt(await rpc('eth_blockNumber',[],signal))),latest=await at(head),start=latest-days*86400;
        let low=0,high=head;
        while(low<high){signal.throwIfAborted();const mid=Math.floor((low+high)/2);if(await at(mid)<start)low=mid+1;else high=mid;}
        const first=low,total=head-first+1,rows=[],seen=new Set();let cursor=head,checked=0,unknown=0,oldestBlock=head,oldestAt=latest;
        async function logs(from,to) {
            signal.throwIfAborted();
            try {
                const result=await rpc('eth_getLogs',[{address:Sales.MARKET,topics:[Sales.TOPIC,Sales.SERVICE],fromBlock:hex(from),toBlock:hex(to)}],signal);
                if(!Array.isArray(result))throw Error('Invalid event-log response');
                if(result.length>=5000){if(from===to)throw Error('The event provider reached its per-block limit.');const mid=Math.floor((from+to)/2);return [...await logs(mid+1,to),...await logs(from,mid)];}
                return result;
            }catch(error){
                signal.throwIfAborted();
                if(to-from>=1000){const mid=Math.floor((from+to)/2);return [...await logs(mid+1,to),...await logs(from,mid)];}
                throw error;
            }
        }
        while(cursor>=first&&rows.length<limit){
            signal.throwIfAborted();
            const ranges=[];
            for(let i=0;i<2&&cursor>=first;i++){const from=Math.max(first,cursor-19999);ranges.push([from,cursor]);cursor=from-1;}
            let failure;
            const batches=await Promise.allSettled(ranges.map(([from,to])=>logs(from,to).catch(error=>{if(!failure)failure=error;halt.abort();throw error;})));
            if(failure)throw failure;
            const candidates=[];
            for(let i=0;i<batches.length;i++)for(const raw of batches[i].value){
                const row=Sales.decode(raw),[from,to]=ranges[i];
                if(!row||row.block<from||row.block>to)continue;
                const identity=row.tx_hash+':'+row.log_index,kind=side(row,wallet);
                if(!kind||seen.has(identity)||!accepts(kind,direction))continue;
                seen.add(identity);
                if(!Object.hasOwn(names,row.code)||typeof names[row.code]!=='string'||!names[row.code].trim()){unknown++;continue;}
                candidates.push({...row,direction:kind,name:names[row.code]});
            }
            candidates.sort(order);
            for(const row of candidates){
                if(rows.length>=limit)break;
                row.at=await at(row.block);if(row.at<start||row.at>latest)continue;
                rows.push(row);onMatch(row);
            }
            checked+=ranges.reduce((sum,[from,to])=>sum+to-from+1,0);
            oldestBlock=ranges.at(-1)[0];oldestAt=await at(oldestBlock);
            onProgress({phase:'logs',head,latest,oldestBlock,oldestAt,checked,total,found:rows.length,unknown});
        }
        return {rows,wallet,head,latest,days,limit,direction,checked,total,oldestBlock,oldestAt,unknown,hitLimit:rows.length>=limit,rangeComplete:cursor<first};
    }
    return {address,side,order,accepts,scan};
});
