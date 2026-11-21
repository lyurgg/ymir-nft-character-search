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
        .filter(edge => !currentOnly || edge.current)
        .map(edge => ({id:edge.source === id ? edge.target : edge.source,edge}));
}

function graphPath(graph, from, to, currentOnly = false) {
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
        for(const next of graphNeighbors(graph,id,currentOnly)) {
            if(depths.has(next.id)) continue;
            if(depths.size>=limit) { truncated=true; continue; }
            depths.set(next.id,level+1); queue.push(next.id);
        }
    }
    const edges=[...graph.edges.values()].filter(edge=>depths.has(edge.source)&&depths.has(edge.target)&&(!currentOnly||edge.current));
    return {nodes:[...depths.keys()].map(id=>({...graph.nodes.get(id),depth:depths.get(id)})),edges,truncated};
}

if(typeof module !== 'undefined') module.exports={ownershipGraph,graphPath,graphNeighborhood,graphWallet};
