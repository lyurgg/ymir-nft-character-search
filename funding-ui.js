let fundingData=__FUNDING_DATA__;

function fundingCharacter(value) {
    const text=value.trim().replace(/^nft\s*#?\s*|^#/i,'');
    return graphById.get(Number(text))||graphCharacters.find(c=>String(c.character_name).toLowerCase()===text.toLowerCase());
}

function fundingDiscoveryHtml(related,focus,page) {
    const size=20,totalPages=Math.max(1,Math.ceil(related.length/size));
    page=Math.max(1,Math.min(totalPages,page));
    const shown=related.slice((page-1)*size,page*size);
    const html=`<h2>Characters connected to ${graphEscape(nftLabel(focus.nft_id))}</h2>
        <p>${related.length} related characters found in the loaded history. Shorter branches appear first, then characters with more shared sources. Choose View connection to inspect one pair.</p>
        <ul class="funding-discoveries">${shown.map(item=>`<li><div><a class="funding-character" href="index.html?nft=${item.nft_id}" target="_blank" rel="noopener noreferrer">${graphEscape(nftLabel(item.nft_id))}</a>
            <p>${item.buyerOnly?'Same recorded purchase buyer · 0 hops':`${item.sources.length} shared source${item.sources.length===1?'':'s'} · shortest connection up to ${item.depth} hop${item.depth===1?'':'s'} per branch`}</p>
            <div class="funding-source-links">${item.sources.slice(0,3).map(source=>`<a class="wallet" href="https://scan.wemix.com/address/${source}" target="_blank" rel="noopener noreferrer">${graphEscape(walletNotes[source]?.name||source.slice(0,8)+'…'+source.slice(-5))}</a>`).join(' · ')}${item.sources.length>3?` · ${item.sources.length-3} more`:''}</div>
            </div><button type="button" data-funding-target="${item.nft_id}">View connection</button></li>`).join('')}</ul>
        ${related.length?`<div class="funding-pagination"><span>Page ${page} of ${totalPages} · showing ${(page-1)*size+1}–${Math.min(page*size,related.length)}</span>${page>1?`<button type="button" data-funding-page="${page-1}">Previous</button>`:''}${page<totalPages?`<button type="button" data-funding-page="${page+1}">Next</button>`:''}</div><p>The graph and evidence below show this page of results.</p>`:'<p>No matches found with these settings. Try a longer lookback or greater depth, or load more funding history.</p>'}`;
    return {html,shown};
}

function exploreFunding(page=1) {
    const status=document.getElementById('graphStatus'),panel=document.getElementById('connectionPath');
    const results=document.getElementById('fundingResults');results.innerHTML='';
    const targetText=document.getElementById('graphTarget').value.trim(),discover=!targetText;
    const a=fundingCharacter(document.getElementById('graphRoot').value),b=fundingCharacter(document.getElementById('graphTarget').value);
    viewport.replaceChildren();panel.innerHTML='';selectedPath=null;
    network={nodes:new Map(),edges:new Map(),adjacent:new Map(),directed:true,kind:'funding'};
    document.getElementById('currentOnly').disabled=true;document.getElementById('afterDate').disabled=true;document.getElementById('beforeDate').disabled=true;document.getElementById('graphDepth').disabled=true;
    document.getElementById('graphLegend').innerHTML='<span>Source wallet → buyer wallet: WEMIX funding</span><span>Buyer wallet → character: NFT purchase</span>';
    document.getElementById('nodeInfo').innerHTML='<h2>Shared funding sources</h2><p>Compare actual purchase buyers, including former owners. Matching sources are evidence of funding connections; they do not establish identity or prove which coins paid for an NFT.</p>';
    if(!a){status.textContent='Choose a focused NFT by ID or exact character name. Leave Compare with blank to discover other NFTs with shared funders.';return;}
    if(!discover&&(!b||a.nft_id===b.nft_id)){status.textContent='The comparison must be a different NFT by ID or exact character name. Clear Compare with to discover related NFTs automatically.';return;}
    const maxDepth=Number(document.getElementById('fundingDepth').value)||1;
    const days=Number(document.getElementById('fundingDays').value)||7;
    const includeBuyerRoots=document.getElementById('fundingBuyerRoots').checked;
    const url=new URL(location.href);url.searchParams.set('root',a.nft_id);if(discover)url.searchParams.delete('to');else url.searchParams.set('to',b.nft_id);url.searchParams.set('view','funding');url.searchParams.set('fundingDepth',maxDepth);url.searchParams.set('fundingDays',days);url.searchParams.set('buyerRoots',includeBuyerRoots?'1':'0');history.replaceState(null,'',url);
    if(!fundingData||!Array.isArray(fundingData.transfers)){status.textContent='WEMIX funding history is not collected yet. Import native-transfer history to compare these purchases. NFT ownership records alone cannot establish a common funding source.';return;}
    const purchases=fundingPurchases(graphCharacters,discover?undefined:[Number(a.nft_id),Number(b.nft_id)]);
    if(!purchases.some(p=>p.nft_id===Number(a.nft_id))||!discover&&!purchases.some(p=>p.nft_id===Number(b.nft_id))){status.textContent='A recorded purchase is needed for the focused NFT and any comparison NFT. A user-transfer or current-owner snapshot cannot identify a purchase buyer.';return;}
    let matches=commonFundingSources(purchases,fundingData.transfers,{days,excluded:excludedWallets,maxDepth,includeBuyerRoots,focusNftId:discover?Number(a.nft_id):null});
    const required=new Set(matches.searchedWallets);
    const coverage=(fundingData.coverage||[]).filter(c=>required.has(c.wallet));
    const missing=[...required].filter(wallet=>!coverage.some(c=>c.wallet===wallet&&c.complete===true&&!c.error));
    const incomplete=missing.length||matches.searchTruncated;
    const coverageText=incomplete?`Buyer/intermediate history or search coverage is incomplete (${missing.length} wallets without complete histories${matches.searchTruncated?'; search limit reached':''}); absence of a match does not establish no connection.`:'All external native-transfer histories for the searched buyer and intermediate wallets were reported complete by the source. Internal transfers and WWEMIX are outside this dataset.';
    status.textContent=`${matches.length} shared funding sources found within ${days} days before the purchases, up to ${maxDepth} hop${maxDepth===1?'':'s'} per buyer branch (minimum 1 WEMIX per hop). ${includeBuyerRoots?'Buyer wallets included as 0-hop sources. ':''}${coverageText} Source: ${fundingData.source||'Imported records'}.`;
    if(fundingData.refresh) {
        const refresh=fundingData.refresh;
        status.textContent+=` Last funding refresh attempt: ${graphDate(refresh.finished_at||fundingData.checked_at)}. ${Number(refresh.wallets_checked)||0} wallets checked${refresh.wallets_remaining?`; ${Number(refresh.wallets_remaining)} await another refresh`:''}${refresh.wallets_failed?`; ${Number(refresh.wallets_failed)} queries failed`:''}. Existing evidence is retained between refreshes.`;
    }else if(fundingData.checked_at)status.textContent+=` Funding history snapshot: ${graphDate(fundingData.checked_at)}.`;
    if(discover) {
        const related=fundingDiscoveries(matches,Number(a.nft_id));
        const {html,shown}=fundingDiscoveryHtml(related,a,page);results.innerHTML=html;
        status.textContent=`${related.length} related NFTs found for ${nftLabel(a.nft_id)}. ${matches.searchedNfts.length} of ${new Set(purchases.map(p=>p.nft_id)).size} NFTs with recorded purchases visited. `+status.textContent;
        const ids=new Set([Number(a.nft_id),...shown.map(r=>r.nft_id)]);
        matches=matches.map(match=>({...match,evidence:match.evidence.filter(row=>ids.has(row.purchase.nft_id))})).filter(match=>new Set(match.evidence.map(row=>row.purchase.nft_id)).size>=2);
    }else results.innerHTML=`<p>Comparing ${graphEscape(nftLabel(a.nft_id))} with ${graphEscape(nftLabel(b.nft_id))}.</p><button type="button" data-funding-discover="true">Find other NFTs with shared funders</button>`;
    if(!matches.length)return;
    network=fundingGraph(matches,graphCharacters);rootId=discover?'nft:'+a.nft_id:'wallet:'+matches[0].source;
    const subgraph=graphNeighborhood(network,rootId,maxDepth+1,80);
    // Show all matching source branches, not just the first source's component.
    const displayed=new Map(subgraph.nodes.map(n=>[n.id,n]));
    for(const match of matches)for(const node of graphNeighborhood(network,'wallet:'+match.source,maxDepth+1,80).nodes)displayed.set(node.id,node);
    const nodes=[...displayed.values()].slice(0,80),ids=new Set(nodes.map(n=>n.id));
    const edges=[...network.edges.values()].filter(e=>ids.has(e.source)&&ids.has(e.target));
    renderGraph({nodes,edges});
    panel.innerHTML=`<h2>Funding evidence before each purchase</h2><p>${graphEscape(coverageText)}</p><p>Imported data is not independently verified by this page. Funding before a purchase does not prove that those exact coins were spent, or that the wallets share an owner. Exchange and custody wallets may fund unrelated buyers.</p>${matches.map(match=>`<details open><summary>Shared source: <span class="wallet">${graphEscape(walletNotes[match.source]?.name||match.source)}</span>${walletNotes[match.source]?.tag?' · '+graphEscape(walletNotes[match.source].tag):''}</summary>${match.evidence.map(row=>`<article class="funding-evidence"><h3>${graphEscape(nftLabel(row.purchase.nft_id))}</h3><p>Purchase buyer: <span class="wallet">${graphEscape(row.purchase.buyer)}</span></p><p><strong>${row.depth??1} hop${(row.depth??1)===1?"":"s"} from this source to the buyer</strong></p>${row.depth===0?'<p>This source wallet is the purchase buyer (0 hops). No incoming funding transfer is implied for this branch.</p>':''}<ol>${(row.path||[row.funding]).map(hop=>`<li><span class="wallet">${graphEscape(hop.from)}</span> → <span class="wallet">${graphEscape(hop.to)}</span><br><strong>${graphEscape(wemixAmount(hop.amount_wei))} WEMIX</strong> · ${graphEscape(graphDate(hop.at*1000))}<br><a href="https://scan.wemix.com/tx/${hop.tx_hash}" target="_blank" rel="noopener noreferrer">Funding transaction</a></li>`).join("")}</ol><p>Purchase: ${graphEscape(graphDate(row.purchase.at*1000))} · recorded price ${graphEscape(row.purchase.price||'unknown')}.</p><p><a href="https://scan.wemix.com/tx/${row.purchase.tx_hash}" target="_blank" rel="noopener noreferrer">Purchase transaction</a></p></article>`).join('')}</details>`).join('')}`;
    if(network.nodes.size>80)status.textContent+=` Display limited to 80 nodes; the evidence list includes every match${discover?' on this result page':''}.`;
}

function fundingNodeActions(node) {
    return `<p><a href="${graphEscape(nodeUrl(node.id))}" target="_blank" rel="noopener noreferrer">${node.type==='wallet'?'Open WEMIX Scan':'Open character info'}</a></p>${node.type==='wallet'?`<p><a href="wallet.html?wallet=${node.wallet}">View wallet activity</a></p><button data-exclude-wallet="${node.wallet}">Exclude this wallet</button><p>Use the ownership/transfer inspector to add a local nickname or custody/exchange tag.</p>`:''}`;
}

document.getElementById('fundingImport').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try {
        if(file.size>20*1024*1024)throw Error('Funding history file is limited to 20 MB.');
        fundingData=validateFundingData(JSON.parse(await file.text()));
        fundingData.source='Imported records (not independently verified)';
        document.getElementById('graphMode').value='funding';exploreGraph();
    }catch(error){document.getElementById('graphStatus').textContent='Cannot import funding history: '+error.message;}
    event.target.value='';
});
