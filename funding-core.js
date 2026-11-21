function fundingWallet(value) {
    const address=String(value||'').toLowerCase();
    return /^0x[0-9a-f]{40}$/.test(address)&&!/^0x0{40}$/.test(address)?address:'';
}
function fundingPurchases(characters, ids) {
    const allowed=new Set(['Auction-Buy','Offer-Bid-Buy','Sale-Buy']);
    const selected=ids?new Set(ids.map(Number)):null;
    return characters.filter(c=>!selected||selected.has(Number(c.nft_id))).flatMap(c=>(c.transfers||[])
        .filter(e=>allowed.has(e.event)&&e.chain==='mainnet'&&fundingWallet(e.to)&&Number.isFinite(e.at))
        .map(e=>({nft_id:Number(c.nft_id),buyer:fundingWallet(e.to),at:e.at,tx_hash:e.tx_hash,price:e.price||'',currency:e.currency||''})));
}

function validateFundingData(data) {
    if(!data||data.schema_version!==1||data.chain_id!==1111||data.asset!=='WEMIX'||!Array.isArray(data.transfers))throw Error('Expected native WEMIX history JSON for chain 1111 (schema_version 1).');
    const unique=new Map();
    for(const row of data.transfers) {
        if(!fundingWallet(row.from)||!fundingWallet(row.to)||!/^0x[0-9a-f]{64}$/i.test(row.tx_hash||'')
            ||!/^\d+$/.test(row.amount_wei||'')||BigInt(row.amount_wei)<=0n||!Number.isFinite(row.at)
            ||row.asset!=='WEMIX'||row.chain_id!==1111)throw Error('A funding record has invalid addresses, amount, timestamp or asset.');
        const normalized={...row,from:fundingWallet(row.from),to:fundingWallet(row.to),tx_hash:row.tx_hash.toLowerCase()};
        const previous=unique.get(normalized.tx_hash);
        if(previous&&JSON.stringify(previous)!==JSON.stringify(normalized))throw Error('Conflicting records share a transaction hash.');
        unique.set(normalized.tx_hash,normalized);
    }
    return {...data,transfers:[...unique.values()]};
}

function commonFundingSources(purchases, transfers, {days=7,minWei=10n**18n,excluded=new Set(),maxDepth=1,maxSearchSteps=null,includeBuyerRoots=false,focusNftId=null}={}) {
    if(!Number.isInteger(maxDepth)||maxDepth<1||maxDepth>3)throw Error('Maximum funding depth must be 1, 2, or 3.');
    const incoming=new Map(),sources=new Map(),searchedWallets=new Set();
    for(const funding of transfers) {
        if(funding.asset!=='WEMIX'||funding.chain_id!==1111||funding.from===funding.to
            ||excluded.has(funding.from)||excluded.has(funding.to)||BigInt(funding.amount_wei)<minWei)continue;
        if(!incoming.has(funding.to))incoming.set(funding.to,[]);
        incoming.get(funding.to).push(funding);
    }
    for(const rows of incoming.values())rows.sort((a,b)=>a.at-b.at);
    const lowerBound=(rows,time)=>{let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].at<time)lo=mid+1;else hi=mid;}return lo;};
    const focused=focusNftId!==null;
    maxSearchSteps??=focused?500000:20000;
    if(focused)purchases=[...purchases.filter(p=>p.nft_id===Number(focusNftId)),...purchases.filter(p=>p.nft_id!==Number(focusNftId))];
    let steps=0,truncated=false;
    const searchedNfts=new Set();
    search: for(const purchase of purchases) {
        if(excluded.has(purchase.buyer))continue;
        searchedNfts.add(purchase.nft_id);
        if(includeBuyerRoots) {
            if(!sources.has(purchase.buyer))sources.set(purchase.buyer,new Map());
            sources.get(purchase.buyer).set(purchase.nft_id+':'+purchase.tx_hash,{purchase,funding:null,path:[],depth:0});
        }
        const queue=[{wallet:purchase.buyer,cutoff:purchase.at,path:[],visited:new Set([purchase.buyer])}];
        for(let i=0;i<queue.length;i++) {
            const state=queue[i];searchedWallets.add(state.wallet);
            const rows=incoming.get(state.wallet)||[],end=lowerBound(rows,state.cutoff);
            for(let j=lowerBound(rows,purchase.at-days*86400);j<end;j++) {
                const funding=rows[j];
                if(++steps>maxSearchSteps){truncated=true;break search;}
                if(funding.at<purchase.at-days*86400||funding.at>=state.cutoff||state.visited.has(funding.from))continue;
                const path=[funding,...state.path],depth=path.length;
                if(!sources.has(funding.from))sources.set(funding.from,new Map());
                const key=purchase.nft_id+':'+purchase.tx_hash;
                const prior=sources.get(funding.from).get(key);
                if(!prior||depth<prior.depth)sources.get(funding.from).set(key,{purchase,funding:path[path.length-1],path,depth});
                if(depth<maxDepth)queue.push({wallet:funding.from,cutoff:funding.at,path,visited:new Set([...state.visited,funding.from])});
            }
        }
    }
    const matches=[...sources].map(([source,evidence])=>{
        let rows=[...evidence.values()];
        if(focused) {
            const focus=rows.filter(r=>r.purchase.nft_id===Number(focusNftId));
            const connects=(a,b)=>a.purchase.buyer!==b.purchase.buyer||includeBuyerRoots&&a.depth===0&&b.depth===0;
            const related=rows.filter(r=>r.purchase.nft_id!==Number(focusNftId)&&focus.some(f=>connects(f,r)));
            rows=[...focus.filter(f=>related.some(r=>connects(f,r))),...related];
        }
        return {source,evidence:rows};
    })
        .filter(match=>new Set(match.evidence.map(r=>r.purchase.nft_id)).size>=2&&(new Set(match.evidence.map(r=>r.purchase.buyer)).size>=2||includeBuyerRoots&&match.evidence.every(r=>r.depth===0)));
    matches.searchTruncated=truncated;matches.searchedWallets=[...searchedWallets];matches.searchedNfts=[...searchedNfts];
    return matches;
}

function fundingDiscoveries(matches,focusNftId) {
    const related=new Map();
    for(const match of matches) {
        const focus=match.evidence.filter(r=>r.purchase.nft_id===Number(focusNftId));
        for(const row of match.evidence) {
            if(row.purchase.nft_id===Number(focusNftId))continue;
            const branches=focus.filter(f=>f.purchase.buyer!==row.purchase.buyer||f.depth===0&&row.depth===0);
            if(!branches.length)continue;
            if(!related.has(row.purchase.nft_id))related.set(row.purchase.nft_id,{nft_id:row.purchase.nft_id,sources:new Set(),depth:Infinity,buyerOnly:true});
            const item=related.get(row.purchase.nft_id);
            item.sources.add(match.source);
            item.depth=Math.min(item.depth,...branches.map(f=>Math.max(f.depth,row.depth)));
            if(row.depth!==0||branches.some(f=>f.depth!==0))item.buyerOnly=false;
        }
    }
    return [...related.values()].map(r=>({...r,sources:[...r.sources]}))
        .sort((a,b)=>a.depth-b.depth||b.sources.length-a.sources.length||a.nft_id-b.nft_id);
}

function fundingGraph(matches,characters) {
    const nodes=new Map(),edges=new Map(),adjacent=new Map(),byId=new Map(characters.map(c=>[Number(c.nft_id),c]));
    const wallet=address=>{const id='wallet:'+address;if(!nodes.has(id)){nodes.set(id,{id,type:'wallet',wallet:address,label:address.slice(0,8)+'…'+address.slice(-5)});adjacent.set(id,[]);}return id;};
    const add=edge=>{if(edges.has(edge.id))return;edges.set(edge.id,edge);adjacent.get(edge.source).push(edge.id);adjacent.get(edge.target).push(edge.id);};
    for(const match of matches)for(const row of match.evidence) {
        const {purchase,funding}=row,buyer=wallet(purchase.buyer),nft='nft:'+purchase.nft_id;
        if(!nodes.has(nft)){nodes.set(nft,{id:nft,type:'nft',nft_id:purchase.nft_id,label:byId.get(purchase.nft_id)?.character_name||'Unknown IGN'});adjacent.set(nft,[]);}
        for(const hop of row.path||[funding])add({id:hop.tx_hash,source:wallet(hop.from),target:wallet(hop.to),nft_id:purchase.nft_id,at:hop.at,asset:'WEMIX',amount_wei:hop.amount_wei,kind:'funding',evidence:[{kind:'Native WEMIX transfer before purchase',at:new Date(hop.at*1000).toISOString(),tx_hash:hop.tx_hash}]});
        add({id:'purchase:'+purchase.tx_hash+':'+purchase.nft_id,source:buyer,target:nft,nft_id:purchase.nft_id,at:purchase.at,kind:'purchase',price:purchase.price,evidence:[{kind:'NFT purchase',at:new Date(purchase.at*1000).toISOString(),tx_hash:purchase.tx_hash}]});
    }
    return {nodes,edges,adjacent,directed:true,kind:'funding'};
}

function wemixAmount(wei) {
    const value=BigInt(wei),whole=value/(10n**18n),fraction=(value%(10n**18n)).toString().padStart(18,'0').replace(/0+$/,'');
    return whole.toLocaleString()+(fraction?'.'+fraction:'');
}
if(typeof module!=='undefined')module.exports={fundingPurchases,validateFundingData,commonFundingSources,fundingDiscoveries,fundingGraph,wemixAmount};
