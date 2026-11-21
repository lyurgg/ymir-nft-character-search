// A bipartite graph: wallet <-> NFT. Edges express ownership records only.
function graphWallet(value) {
    const address = String(value || '').toLowerCase();
    return /^0x[0-9a-f]{40}$/.test(address) && !/^0x0{40}$/.test(address) ? address : '';
}

function ownershipGraph(characters) {
    const nodes = new Map(), edges = new Map(), adjacent = new Map();
    const addNode = node => { if (!nodes.has(node.id)) { nodes.set(node.id, node); adjacent.set(node.id, []); } };
    for (const character of characters) {
        const id = 'nft:' + character.nft_id;
        addNode({id, type:'nft', nft_id:character.nft_id, label:character.character_name || '#' + character.nft_id});
        const market = character.market || {};
        const currentOwner = graphWallet(market.owner);
        const records = [];
        if (currentOwner) records.push({wallet:currentOwner, kind:'Latest owner snapshot', at:market.checked_at || null});
        for (const item of character.owner_history || []) {
            records.push({wallet:item.wallet, kind:'Archive owner observation', at:item.first_seen, last_seen:item.last_seen});
        }
        for (const item of character.transfers || []) {
            for (const side of ['from','to']) records.push({wallet:item[side], kind:item.event + ' (' + side + ')', at:typeof item.at === 'number' ? new Date(item.at * 1000).toISOString() : null, tx_hash:item.tx_hash});
        }
        for (const record of records) {
            const wallet = graphWallet(record.wallet);
            if (!wallet) continue;
            const walletId = 'wallet:' + wallet;
            addNode({id:walletId,type:'wallet',wallet,label:wallet.slice(0,8) + '…' + wallet.slice(-5)});
            const edgeId = id + '|' + walletId;
            if (!edges.has(edgeId)) {
                edges.set(edgeId,{id:edgeId,source:id,target:walletId,current:wallet === currentOwner,checked_at:market.checked_at || null,evidence:[]});
                adjacent.get(id).push(edgeId);
                adjacent.get(walletId).push(edgeId);
            }
            edges.get(edgeId).evidence.push(record);
        }
    }
    return {nodes,edges,adjacent};
}

function graphNeighbors(graph, id, currentOnly = false) {
    return (graph.adjacent.get(id) || []).map(key => graph.edges.get(key))
        .filter(edge => (!currentOnly || edge.current) && (!graph.directed || edge.source === id))
        .map(edge => ({id:edge.source === id ? edge.target : edge.source,edge}));
}

function graphPath(graph, from, to, currentOnly = false) {
    if (graph.directed) return temporalPath(graph, from, to);
    if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null;
    const previous = new Map([[from,null]]), queue = [from];
    for (let i=0;i<queue.length;i++) {
        const id=queue[i];
        if (id===to) {
            const nodes=[],edges=[];
            let cursor=to;
            while (cursor !== null) {
                nodes.push(cursor);
                const step=previous.get(cursor);
                if (!step) break;
                edges.push(step.edge); cursor=step.from;
            }
            return {nodes:nodes.reverse(),edges:edges.reverse()};
        }
        for (const next of graphNeighbors(graph,id,currentOnly)) {
            if (!previous.has(next.id)) { previous.set(next.id,{from:id,edge:next.edge}); queue.push(next.id); }
        }
    }
    return null;
}

function graphNeighborhood(graph, root, depth=2, limit=180, currentOnly=false) {
    const depths=new Map(),queue=[];
    if (graph.nodes.has(root)) { depths.set(root,0); queue.push(root); }
    let truncated=false;
    for(let i=0;i<queue.length;i++) {
        const id=queue[i],level=depths.get(id);
        if(level>=depth) continue;
        const neighbors = graph.directed ? (graph.adjacent.get(id) || []).map(key => graph.edges.get(key)).map(edge => ({id:edge.source===id?edge.target:edge.source,edge})) : graphNeighbors(graph,id,currentOnly);
        for(const next of neighbors) {
            if(depths.has(next.id)) continue;
            if(depths.size>=limit) { truncated=true; continue; }
            depths.set(next.id,level+1); queue.push(next.id);
        }
    }
    const edges=[...graph.edges.values()].filter(edge=>depths.has(edge.source)&&depths.has(edge.target)&&(!currentOnly||edge.current));
    return {nodes:[...depths.keys()].map(id=>({...graph.nodes.get(id),depth:depths.get(id)})),edges,truncated};
}

function transferGraph(characters) {
    const nodes=new Map(),edges=new Map(),adjacent=new Map();
    for(const character of characters) for(const event of character.transfers || []) {
        const from=graphWallet(event.from),to=graphWallet(event.to);
        if(!from || !to || !Number.isFinite(event.at)) continue;
        for(const wallet of [from,to]) {
            const id='wallet:'+wallet;
            if(!nodes.has(id)) { nodes.set(id,{id,type:'wallet',wallet,label:wallet.slice(0,8)+'…'+wallet.slice(-5)});adjacent.set(id,[]); }
        }
        const id=[character.nft_id,event.chain,event.tx_hash,event.event,from,to].join('|');
        if(edges.has(id)) continue;
        const edge={id,source:'wallet:'+from,target:'wallet:'+to,nft_id:character.nft_id,
            nft_name:character.character_name,at:event.at,event:event.event,
            evidence:[{kind:event.event,at:new Date(event.at*1000).toISOString(),tx_hash:event.tx_hash}]};
        edges.set(id,edge);adjacent.get(edge.source).push(id);if(from!==to) adjacent.get(edge.target).push(id);
    }
    return {nodes,edges,adjacent,directed:true};
}

function filterGraph(graph,{excluded=new Set(),after=-Infinity,before=Infinity}={}) {
    const nodes=new Map([...graph.nodes].filter(([id,node])=>!excluded.has(node.wallet)));
    const edges=new Map([...graph.edges].filter(([id,e])=>nodes.has(e.source)&&nodes.has(e.target)&&(!graph.directed || (e.at>=after&&e.at<=before))));
    const adjacent=new Map([...nodes.keys()].map(id=>[id,[]]));
    for(const [id,e] of edges) { adjacent.get(e.source).push(id);if(e.source!==e.target)adjacent.get(e.target).push(id); }
    return {nodes,edges,adjacent,directed:graph.directed};
}

// Earliest-arrival search: every transfer in a path must be strictly later than
// its predecessor. Same-second events lack reliable ordering, so are not chained.
function temporalPath(graph,from,to) {
    if(!graph.nodes.has(from)||!graph.nodes.has(to))return null;
    const arrivals=new Map([[from,-Infinity]]),previous=new Map();
    for(const edge of [...graph.edges.values()].sort((a,b)=>a.at-b.at)) {
        if(arrivals.has(edge.source)&&arrivals.get(edge.source)<edge.at&&(!arrivals.has(edge.target)||edge.at<arrivals.get(edge.target))) {
            arrivals.set(edge.target,edge.at);previous.set(edge.target,edge);
        }
    }
    if(!arrivals.has(to))return null;
    const nodes=[to],edges=[];let cursor=to;
    while(cursor!==from) { const edge=previous.get(cursor);if(!edge)return null;edges.push(edge);cursor=edge.source;nodes.push(cursor); }
    return {nodes:nodes.reverse(),edges:edges.reverse(),temporal:true};
}

function walletActivity(graph,wallet) {
    const id='wallet:'+graphWallet(wallet),sources=new Set(),destinations=new Set(),nfts=new Set(),forwarded=new Set(),receipts=new Map();
    for(const edge of [...graph.edges.values()].sort((a,b)=>a.at-b.at)) {
        if(edge.target===id&&edge.source!==id) { sources.add(edge.source);nfts.add(edge.nft_id);receipts.set(edge.nft_id,{from:edge.source,at:edge.at}); }
        if(edge.source===id&&edge.target!==id) {
            destinations.add(edge.target);nfts.add(edge.nft_id);const receipt=receipts.get(edge.nft_id);
            if(receipt&&receipt.at<edge.at&&receipt.from!==edge.target)forwarded.add(edge.nft_id);
        }
    }
    return {nfts:nfts.size,sources:sources.size,destinations:destinations.size,forwarded:forwarded.size,
        possibleIntermediary:forwarded.size>=3&&sources.size>=2&&destinations.size>=2};
}

if(typeof module !== 'undefined') module.exports={ownershipGraph,transferGraph,filterGraph,graphPath,graphNeighborhood,graphWallet,walletActivity};
