const graphCharacters = __GRAPH_DATA__;
const associationNetwork = ownershipGraph(graphCharacters);
const transferNetwork = transferGraph(graphCharacters);
let network = associationNetwork;
let excludedWallets = new Set(), walletNotes = {};
try { excludedWallets = new Set(JSON.parse(localStorage.getItem('ymir-graph-excluded') || '[]').map(graphWallet).filter(Boolean)); walletNotes = JSON.parse(localStorage.getItem('ymir-wallet-notes') || '{}') || {}; } catch (_) {}
const graphById = new Map(graphCharacters.map(character=>[Number(character.nft_id),character]));
const svg = document.getElementById('network');
const viewport = document.getElementById('graphViewport');
const svgNS = 'http://www.w3.org/2000/svg';
let rootId = '', selectedPath = null, positions = new Map(), renderedEdges = [], nodeElements = new Map();
let view = {x:0,y:0,zoom:1}, drag = null;

function graphEscape(value) {
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function graphDate(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? date.toLocaleString(undefined,{timeZone:'Asia/Manila'})+' PHT' : 'date unknown';
}
function nftLabel(nftId, compact=false) {
    const name=String(graphById.get(Number(nftId))?.character_name || 'Unknown IGN');
    const letters=Array.from(name);
    return (compact&&letters.length>20?letters.slice(0,19).join('')+'…':name)+' ('+nftId+')';
}
function nodeLabel(id, full=false) {
    const node=network.nodes.get(id);
    if(!node) return id;
    return node.type==='nft' ? nftLabel(node.nft_id) : full ? node.wallet : node.label;
}
function resolveGraphNode(text) {
    const value=String(text).trim().toLowerCase();
    const wallet=graphWallet(value);
    if(wallet) return network.nodes.has('wallet:'+wallet) ? 'wallet:'+wallet : null;
    const number=value.replace(/^nft\s*#?\s*|^#/,'');
    if(/^\d+$/.test(number)) { const character=graphById.get(Number(number));if(network.directed && character) {const id='wallet:'+graphWallet(character.market?.owner);return network.nodes.has(id)?id:null;}if(network.nodes.has('nft:'+Number(number)))return 'nft:'+Number(number); }
    const matches=graphCharacters.filter(character=>String(character.character_name).toLowerCase()===value);
    if(matches.length!==1)return null;return network.directed?resolveGraphNode(String(matches[0].nft_id)):'nft:'+matches[0].nft_id;
}
function svgElement(name,attributes={}) {
    const element=document.createElementNS(svgNS,name);
    for(const [key,value] of Object.entries(attributes)) element.setAttribute(key,String(value));
    return element;
}
function setGraphView() { viewport.setAttribute('transform',`translate(${view.x},${view.y}) scale(${view.zoom})`); }

function layoutGraph(nodes,edges) {
    // Stable breadth layers, rather than a moving force cluster.
    const result=new Map(),layers=new Map();
    for(const node of nodes) { const depth=node.depth ?? 1;if(!layers.has(depth))layers.set(depth,[]);layers.get(depth).push(node); }
    const levels=[...layers.keys()].sort((a,b)=>a-b);
    const height=Math.max(650,...[...layers.values()].map(layer=>layer.length*80+130));
    svg.setAttribute("viewBox",`0 0 1000 ${height}`);svg.setAttribute("style",`height:${height}px;min-width:1000px`);
    for(const [i,level] of levels.entries()) {
        const layer=layers.get(level).sort((a,b)=>a.label.localeCompare(b.label));
        layer.forEach((node,j)=>result.set(node.id,{x:levels.length===1?500:100+i*800/(levels.length-1),y:65+(j+.5)*(height-130)/layer.length}));
    }
    return result;
}
function updateGraphGeometry() {
    for(const [id,element] of nodeElements) {
        const p=positions.get(id);element.setAttribute('transform',`translate(${p.x},${p.y})`);
    }
    for(const {edge,element,label,curve} of renderedEdges) {
        const a=positions.get(edge.source),b=positions.get(edge.target);
        const dx=b.x-a.x,dy=b.y-a.y,length=Math.max(1,Math.hypot(dx,dy));
        const x1=a.x+dx/length*21,y1=a.y+dy/length*21,x2=b.x-dx/length*23,y2=b.y-dy/length*23;
        const cx=(a.x+b.x)/2-dy/length*curve,cy=(a.y+b.y)/2+dx/length*curve;
        element.setAttribute('d',edge.source===edge.target?`M ${a.x-8} ${a.y-15} C ${a.x-65} ${a.y-90}, ${a.x+65} ${a.y-90}, ${a.x+8} ${a.y-15}`:`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
        if(label) { label.setAttribute('x',(a.x+b.x)/4+cx/2);label.setAttribute('y',(a.y+b.y)/4+cy/2-6); }
    }
}
function renderGraph(subgraph) {
    viewport.replaceChildren();nodeElements=new Map();renderedEdges=[];
    const defs=svgElement('defs'),marker=svgElement('marker',{id:'transferArrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});
    marker.appendChild(svgElement('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#617e75'}));defs.appendChild(marker);viewport.appendChild(defs);
    const pathEdges=new Set((selectedPath?.edges || []).map(edge=>edge.id));
    const pathNodes=new Set(selectedPath?.nodes || []);
    positions=layoutGraph(subgraph.nodes,subgraph.edges);
    for(const edge of subgraph.edges) {
        const line=svgElement('path',{class:`graph-edge ${edge.current?'current':'former'} ${pathEdges.has(edge.id)?'in-path':''}`,tabindex:0,'data-edge':edge.id,'marker-end':network.directed?'url(#transferArrow)':'','aria-label':`${nodeLabel(edge.source)} ${network.directed?'sends '+nftLabel(edge.nft_id)+' to':edge.current?'current owner snapshot':'historical ownership'} ${nodeLabel(edge.target)}`});
        const title=svgElement('title');title.textContent=network.directed?`${nftLabel(edge.nft_id)}: ${nodeLabel(edge.source,true)} to ${nodeLabel(edge.target,true)} · ${graphDate(edge.at*1000)}`:`${edge.current?'Current owner snapshot':'Historical ownership'}: ${nodeLabel(edge.target,true)}`;line.appendChild(title);
        viewport.appendChild(line);
        let label=null;
        if(network.directed && subgraph.edges.length<=45) { label=svgElement('text',{class:'edge-label','text-anchor':'middle','data-open-nft':edge.nft_id,role:'link',tabindex:0});label.textContent=nftLabel(edge.nft_id,true)+' · '+new Date(edge.at*1000).toISOString().slice(0,10);viewport.appendChild(label); }
        const parallels=subgraph.edges.filter(other=>other.source===edge.source&&other.target===edge.target);
        const curve=parallels.length>1?(parallels.indexOf(edge)-(parallels.length-1)/2)*38:14;
        renderedEdges.push({edge,element:line,label,curve});
    }
    for(const node of subgraph.nodes) {
        const group=svgElement('g',{class:`graph-node ${node.type} ${node.id===rootId?'root':''} ${pathNodes.has(node.id)?'in-path':''} ${walletNotes[node.wallet]?.tag?'tagged':''}`,tabindex:0,role:'button','data-node':node.id,'aria-label':nodeLabel(node.id,true)});
        group.appendChild(svgElement('circle',{r:node.type==='nft'?19:14}));
        const label=svgElement('text',{y:node.type==='nft'?35:30,'text-anchor':'middle'});
        const full=walletNotes[node.wallet]?.name || nodeLabel(node.id);label.textContent=node.type==='nft'?nftLabel(node.nft_id,true):full.length>27?full.slice(0,25)+'…':full;group.appendChild(label);
        const title=svgElement('title');title.textContent=nodeLabel(node.id,true);group.appendChild(title);
        viewport.appendChild(group);nodeElements.set(node.id,group);
    }
    updateGraphGeometry();view={x:0,y:0,zoom:1};setGraphView();
}
function nodeUrl(id) {
    const node=network.nodes.get(id);
    return node?.type==='wallet'?'https://scan.wemix.com/address/'+node.wallet:node?.type==='nft'?'index.html?nft='+node.nft_id:null;
}
function openGraphNode(id) { const url=nodeUrl(id);if(url)window.open(url,'_blank','noopener,noreferrer'); }
function nodeActions(node) {
    const url=nodeUrl(node.id);
    let html=`<p><a href="${graphEscape(url)}" target="_blank" rel="noopener noreferrer">${node.type==='wallet'?'Open WEMIX Scan':'Open character info'}</a></p><button data-focus-node="${node.id}">Center this node</button>`;
    if(node.type!=='wallet')return html;
    const stats=walletActivity(network.directed?network:transferNetwork,node.wallet),note=walletNotes[node.wallet] || {};
    html+=`<div class="wallet-stats"><span><b>${stats.nfts}</b> NFTs</span><span><b>${stats.sources}</b> sources</span><span><b>${stats.destinations}</b> destinations</span></div>
        <p>${stats.possibleIntermediary?'<strong>Possible intermediary pattern</strong><br>':''}${stats.forwarded} distinct NFTs received and later sent to a different wallet.</p>
        <details><summary>How this hint works</summary><p>Flagged only when at least 3 NFTs were passed onward, with at least 2 distinct source and 2 destination wallets. This can also describe custody, exchange or personal transfers. It is not proof of a middleman or shared player.</p></details>
        <label>Wallet nickname<input id="walletNickname" maxlength="60" value="${graphEscape(note.name || '')}"></label>
        <label>Your tag<select id="walletTag"><option value="">No tag</option>${['Possible intermediary','Custody / exchange','Known wallet'].map(tag=>`<option ${note.tag===tag?'selected':''}>${tag}</option>`).join('')}</select></label>
        <button data-save-wallet="${node.wallet}">Save local note</button><button data-exclude-wallet="${node.wallet}">Exclude from graph</button>`;
    return html;
}
function inspectGraphNode(id) {
    const node=network.nodes.get(id);
    if(!node) return;
    const related=(network.adjacent.get(id)||[]).map(key=>{const edge=network.edges.get(key);return {id:edge.source===id?edge.target:edge.source,edge};});
    const character=node.type==='nft'?graphById.get(Number(node.nft_id)):null;
    const check=character?.transfer_check || {};
    document.getElementById('nodeInfo').innerHTML=`<h2>${node.type==='nft'?'Character':'Wallet'}</h2><p class="${node.type==='wallet'?'wallet':''}">${graphEscape(nodeLabel(id,true))}</p>
        ${node.type==='nft'?`<p><a href="index.html?nft=${node.nft_id}">View character details</a></p><p>Owner snapshot: ${graphEscape(graphDate(character?.market?.checked_at))}</p><p>Transfer history: ${check.checked_at?graphEscape(graphDate(check.checked_at)):'not yet fetched'}${check.error?' · latest check failed':''}${check.all_returned===false?' · partial response':''}</p>`:''}
        <p>${related.length} recorded links. Use Inspect to review a node without opening another page.</p>${nodeActions(node)}<ul>${related.slice(0,50).map(next=>`<li><a href="${graphEscape(nodeUrl(next.id))}" target="_blank" rel="noopener noreferrer">${graphEscape(nodeLabel(next.id))}</a> <button data-inspect-node="${next.id}">Inspect</button> · ${network.directed?(next.edge.source===id?'Sent':'Received')+' '+graphEscape(nftLabel(next.edge.nft_id)):next.edge.current?'current owner snapshot':'historical ownership'}</li>`).join('')}</ul>`;
}
function inspectGraphEdge(id) {
    const edge=network.edges.get(id);
    if(!edge) return;
    document.getElementById('nodeInfo').innerHTML=`<h2>${network.directed?graphEscape(nftLabel(edge.nft_id))+' transfer':edge.current?'Current owner snapshot':'Historical ownership'}</h2><p><b>From</b><br><span class="wallet">${graphEscape(nodeLabel(edge.source,true))}</span></p><p><b>To</b><br><span class="wallet">${graphEscape(nodeLabel(edge.target,true))}</span></p>${network.directed?`<p><a href="index.html?nft=${edge.nft_id}" target="_blank">View ${graphEscape(nftLabel(edge.nft_id))}</a> · ${graphEscape(graphDate(edge.at*1000))}</p>`:""}${network.directed?'':`<p>Last owner check: ${graphEscape(graphDate(edge.checked_at))}</p>`}<h3>Recorded evidence</h3><ul>${edge.evidence.map(item=>`<li>${graphEscape(item.kind)}<br>${graphEscape(graphDate(item.at))}${item.last_seen?'<br>Last seen '+graphEscape(graphDate(item.last_seen)):''}${item.tx_hash?'<br><span class="transaction">'+graphEscape(item.tx_hash)+'</span>':''}</li>`).join('')}</ul>`;
}
function renderConnectionPath(path) {
    const panel=document.getElementById('connectionPath');
    if(!path) { panel.innerHTML='';return; }
    const walletDistance=path.nodes.filter(id=>id.startsWith('wallet:')).length-1;
    const walletEndpoints=path.nodes[0].startsWith('wallet:')&&path.nodes.at(-1).startsWith('wallet:');
    panel.innerHTML=`<h2>${path.temporal?"Chronological transfer path":"Shortest recorded connection"}</h2><p>${path.edges.length} ownership edges${walletEndpoints?' · '+walletDistance+' wallet-to-wallet steps through NFTs':''}.</p>${path.edges.length?`<ol>${path.edges.map((edge,i)=>`<li><strong>${graphEscape(nodeLabel(path.nodes[i],true))}</strong><br>${path.temporal?'Sent '+graphEscape(nftLabel(edge.nft_id))+' · '+graphEscape(graphDate(edge.at*1000)):edge.current?'Current owner snapshot':'Historical ownership'}${path.temporal?'':' · last owner check '+graphEscape(graphDate(edge.checked_at))}<br><strong>${graphEscape(nodeLabel(path.nodes[i+1],true))}</strong></li>`).join('')}</ol>`:'<p>Start and destination are the same node.</p>'}<p class="muted">${path.temporal?"Each arrow follows a recorded transfer forward in time. This finds an earliest-arrival path, not necessarily the fewest steps. Same-second transfers are not chained without a known ordering.":"This is the shortest association path; ownership dates may differ."} A path may span different NFTs and does not imply a shared player.</p>`;
}
function exploreGraph(event) {
    if(event) event.preventDefault();
    const mode=document.getElementById('graphMode').value;
    const directed=mode==='transfers';
    const after=document.getElementById('afterDate').value,before=document.getElementById('beforeDate').value;
    network=filterGraph(directed?transferNetwork:associationNetwork,{excluded:excludedWallets,
        after:directed&&after?Date.parse(after+'T00:00:00Z')/1000:-Infinity,
        before:directed&&before?Date.parse(before+'T23:59:59.999Z')/1000:Infinity});
    document.getElementById('currentOnly').disabled=directed;
    document.getElementById('afterDate').disabled=!directed;document.getElementById('beforeDate').disabled=!directed;
    let root=resolveGraphNode(document.getElementById('graphRoot').value);
    let context='';
    if(directed) {
        const value=document.getElementById('graphRoot').value.trim().replace(/^nft\s*#?\s*|^#/i,'');
        const character=graphById.get(Number(value)) || graphCharacters.find(item=>item.character_name.toLowerCase()===value.toLowerCase());
        if(character) {
            const candidates=[character.market?.owner,...(character.transfers||[]).flatMap(item=>[item.from,item.to])];
            root=candidates.map(graphWallet).filter(Boolean).map(wallet=>'wallet:'+wallet).find(id=>network.nodes.has(id)) || null;
            context=`${nftLabel(character.nft_id)}: showing transfer connections around its latest available wallet. `;
        }
    }
    const targetText=document.getElementById('graphTarget').value.trim();
    const target=targetText?resolveGraphNode(targetText):null;
    const status=document.getElementById('graphStatus');
    if(!root || (targetText&&!target)) {
        status.textContent='NFT or wallet not found in the indexed records. Use an NFT ID, exact unique name, or full wallet address.';
        viewport.replaceChildren();document.getElementById('connectionPath').innerHTML='';return;
    }
    rootId=root;
    const currentOnly=!directed&&document.getElementById('currentOnly').checked;
    const depth=Number(document.getElementById('graphDepth').value)||2;
    document.getElementById('graphLegend').innerHTML=directed?'<span><i class="wallet-dot"></i>Wallet (click to open Scan)</span><span>Arrow: source → destination</span><span>NFT label: click for character info</span><span><i class="path-line"></i>Chronological path</span>':'<span><i class="nft-dot"></i>NFT</span><span><i class="wallet-dot"></i>Wallet</span><span><i class="current-line"></i>Current owner snapshot</span><span><i class="former-line"></i>Historical ownership</span><span><i class="path-line"></i>Association path</span>';
    selectedPath=target?graphPath(network,root,target,currentOnly):null;
    const subgraph=graphNeighborhood(network,root,depth,40,currentOnly);
    if(selectedPath) {
        const displayed=new Set(subgraph.nodes.map(node=>node.id));
        for(const [step,id] of selectedPath.nodes.entries()) { if(!displayed.has(id)) { subgraph.nodes.push({...network.nodes.get(id),depth:step});displayed.add(id); } else { subgraph.nodes.find(node=>node.id===id).depth=step; } }
        const included=new Set(subgraph.edges.map(edge=>edge.id));
        for(const edge of selectedPath.edges) if(!included.has(edge.id)) subgraph.edges.push(edge);
    }
    renderGraph(subgraph);renderConnectionPath(selectedPath);inspectGraphNode(root);
    status.textContent=`${context}${subgraph.nodes.length} nodes and ${subgraph.edges.length} ${directed?'directed transfers':'ownership links'} shown. ${subgraph.truncated?'Display capped at 40 neighborhood nodes; search uses all non-excluded records. ':''}${target&&!selectedPath?'No '+(directed?'time-respecting transfer':'association')+' path was found in the filtered records. ':''}${subgraph.edges.length===0?'No links available in this view. ':''}`;
    const url=new URL(location.href);url.searchParams.set('root',root.replace(/^nft:|^wallet:/,''));
    targetText?url.searchParams.set('to',targetText):url.searchParams.delete('to');
    url.searchParams.set('view',directed?'transfers':'associations');
    history.replaceState(null,'',url);
}

function saveGraphPreferences() {
    try { localStorage.setItem('ymir-graph-excluded',JSON.stringify([...excludedWallets]));localStorage.setItem('ymir-wallet-notes',JSON.stringify(walletNotes)); }catch(_){}
}
function renderExclusions() {
    document.getElementById('excludedCount').textContent=excludedWallets.size;
    document.getElementById('exclusionList').innerHTML=[...excludedWallets].map(wallet=>`<p class="wallet">${graphEscape(wallet)} <button data-restore-wallet="${wallet}">Restore</button></p>`).join('');
}
function excludeWallet(wallet) {
    const address=graphWallet(wallet);if(!address)return;
    excludedWallets.add(address);saveGraphPreferences();renderExclusions();exploreGraph();
}
document.getElementById('addExclusion').addEventListener('click',()=>excludeWallet(document.getElementById('excludeWallet').value.trim()));
document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    const data=button.dataset;
    if(data.inspectNode)inspectGraphNode(data.inspectNode);
    if(data.focusNode){document.getElementById('graphRoot').value=data.focusNode.replace(/^wallet:|^nft:/,'');document.getElementById('graphTarget').value='';exploreGraph();}
    if(data.excludeWallet)excludeWallet(data.excludeWallet);
    if(data.restoreWallet){excludedWallets.delete(data.restoreWallet);saveGraphPreferences();renderExclusions();exploreGraph();}
    if(data.saveWallet){const wallet=graphWallet(data.saveWallet);if(!wallet)return;walletNotes[wallet]={name:document.getElementById('walletNickname').value.trim().slice(0,60),tag:document.getElementById('walletTag').value};saveGraphPreferences();exploreGraph();if(network.nodes.has('wallet:'+wallet))inspectGraphNode('wallet:'+wallet);}
});

document.getElementById('graphForm').addEventListener('submit',exploreGraph);
document.getElementById('fitGraph').addEventListener('click',()=>{view={x:0,y:0,zoom:1};setGraphView();});
document.getElementById('graphRoot').addEventListener('input',event=>{
    const value=event.target.value.toLowerCase();
    document.getElementById('characterSuggestions').innerHTML=graphCharacters.filter(character=>String(character.nft_id).includes(value)||String(character.character_name).toLowerCase().includes(value)).slice(0,25).map(character=>`<option value="${character.nft_id}">${graphEscape(nftLabel(character.nft_id))}</option>`).join('');
});
function pointerPosition(event) {
    const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
}
svg.addEventListener('pointerdown',event=>{
    const node=event.target.closest('[data-node]');
    const point=pointerPosition(event);
    drag={id:node?.dataset.node || null,edge:event.target.closest('[data-edge]')?.dataset.edge || null,nft:event.target.closest('[data-open-nft]')?.dataset.openNft || null,start:point,previous:point,moved:false};
    svg.setPointerCapture(event.pointerId);
});
svg.addEventListener('pointermove',event=>{
    if(!drag) return;
    const point=pointerPosition(event),dx=point.x-drag.previous.x,dy=point.y-drag.previous.y;
    if(Math.hypot(point.x-drag.start.x,point.y-drag.start.y)>3) drag.moved=true;
    if(drag.id) {
        const position=positions.get(drag.id);position.x+=dx/view.zoom;position.y+=dy/view.zoom;updateGraphGeometry();
    } else { view.x+=dx;view.y+=dy;setGraphView(); }
    drag.previous=point;
});
svg.addEventListener('pointerup',event=>{
    if(drag&&!drag.moved) {
        if(drag.id) {inspectGraphNode(drag.id);openGraphNode(drag.id);}else if(drag.nft)window.open('index.html?nft='+Number(drag.nft),'_blank','noopener,noreferrer');else if(drag.edge) inspectGraphEdge(drag.edge);
    }
    drag=null;
});
svg.addEventListener('pointercancel',()=>{drag=null;});
svg.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ') return;
    const node=event.target.closest('[data-node]'),edge=event.target.closest('[data-edge]');
    if(node) {inspectGraphNode(node.dataset.node);openGraphNode(node.dataset.node);}else if(event.target.closest('[data-open-nft]'))window.open('index.html?nft='+Number(event.target.closest('[data-open-nft]').dataset.openNft),'_blank','noopener,noreferrer');else if(edge) inspectGraphEdge(edge.dataset.edge);
    event.preventDefault();
});
svg.addEventListener('wheel',event=>{
    event.preventDefault();const point=pointerPosition(event),zoom=Math.max(.25,Math.min(4,view.zoom*Math.exp(-event.deltaY*.001)));
    view.x=point.x-(point.x-view.x)*zoom/view.zoom;view.y=point.y-(point.y-view.y)*zoom/view.zoom;view.zoom=zoom;setGraphView();
},{passive:false});
const ownerCount=graphCharacters.filter(character=>graphWallet(character.market?.owner)).length;
const historyCount=graphCharacters.filter(character=>character.transfer_check?.checked_at).length;
document.getElementById('coverage').textContent=`${graphCharacters.length.toLocaleString()} indexed characters · ${ownerCount} owner snapshots · ${historyCount} fetched transfer histories. Directed arrows represent recorded transfers; the ownership view shows associations. Wallet graphs can contain cycles; chronological paths always move forward in time.`;
const params=new URLSearchParams(location.search);
document.getElementById('graphRoot').value=params.get('root') || String(graphCharacters.find(character=>character.nft_id===8&&character.market?.owner)?.nft_id || graphCharacters.find(character=>character.market?.owner)?.nft_id || graphCharacters[0]?.nft_id || '');
document.getElementById('graphTarget').value=params.get('to') || '';
if(params.get('view'))document.getElementById('graphMode').value=params.get('view');
renderExclusions();
exploreGraph();
