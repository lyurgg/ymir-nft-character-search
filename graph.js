const graphCharacters = __GRAPH_DATA__;
const network = ownershipGraph(graphCharacters);
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
function nodeLabel(id, full=false) {
    const node=network.nodes.get(id);
    if(!node) return id;
    return node.type==='nft' ? '#'+node.nft_id+' '+node.label : full ? node.wallet : node.label;
}
function resolveGraphNode(text) {
    const value=String(text).trim().toLowerCase();
    const wallet=graphWallet(value);
    if(wallet) return network.nodes.has('wallet:'+wallet) ? 'wallet:'+wallet : null;
    const number=value.replace(/^nft\s*#?\s*|^#/,'');
    if(/^\d+$/.test(number) && network.nodes.has('nft:'+Number(number))) return 'nft:'+Number(number);
    const matches=graphCharacters.filter(character=>String(character.character_name).toLowerCase()===value);
    return matches.length===1 ? 'nft:'+matches[0].nft_id : null;
}
function svgElement(name,attributes={}) {
    const element=document.createElementNS(svgNS,name);
    for(const [key,value] of Object.entries(attributes)) element.setAttribute(key,String(value));
    return element;
}
function setGraphView() { viewport.setAttribute('transform',`translate(${view.x},${view.y}) scale(${view.zoom})`); }

function layoutGraph(nodes,edges) {
    const result=new Map();
    nodes.forEach((node,i)=>{
        const angle=i*2.399963229728653;
        const radius=node.id===rootId ? 0 : 80+Math.sqrt(i)*25;
        result.set(node.id,{x:500+Math.cos(angle)*radius,y:325+Math.sin(angle)*radius});
    });
    for(let iteration=0;iteration<100;iteration++) {
        const forces=new Map(nodes.map(node=>[node.id,{x:0,y:0}]));
        for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) {
            const a=result.get(nodes[i].id),b=result.get(nodes[j].id);
            const dx=a.x-b.x || .1,dy=a.y-b.y || .1,distance=Math.max(10,Math.hypot(dx,dy));
            const force=Math.min(8,1800/(distance*distance));
            forces.get(nodes[i].id).x+=dx/distance*force;forces.get(nodes[i].id).y+=dy/distance*force;
            forces.get(nodes[j].id).x-=dx/distance*force;forces.get(nodes[j].id).y-=dy/distance*force;
        }
        for(const edge of edges) {
            const a=result.get(edge.source),b=result.get(edge.target);
            const dx=b.x-a.x,dy=b.y-a.y,distance=Math.max(1,Math.hypot(dx,dy));
            const force=(distance-110)*.025;
            forces.get(edge.source).x+=dx/distance*force;forces.get(edge.source).y+=dy/distance*force;
            forces.get(edge.target).x-=dx/distance*force;forces.get(edge.target).y-=dy/distance*force;
        }
        for(const node of nodes) {
            const position=result.get(node.id),force=forces.get(node.id);
            if(node.id===rootId) continue;
            position.x=Math.max(45,Math.min(950,position.x+force.x+(500-position.x)*.003));
            position.y=Math.max(45,Math.min(600,position.y+force.y+(325-position.y)*.003));
        }
    }
    return result;
}
function updateGraphGeometry() {
    for(const [id,element] of nodeElements) {
        const p=positions.get(id);element.setAttribute('transform',`translate(${p.x},${p.y})`);
    }
    for(const {edge,element} of renderedEdges) {
        const a=positions.get(edge.source),b=positions.get(edge.target);
        element.setAttribute('x1',a.x);element.setAttribute('y1',a.y);element.setAttribute('x2',b.x);element.setAttribute('y2',b.y);
    }
}
function renderGraph(subgraph) {
    viewport.replaceChildren();nodeElements=new Map();renderedEdges=[];
    const pathEdges=new Set((selectedPath?.edges || []).map(edge=>edge.id));
    const pathNodes=new Set(selectedPath?.nodes || []);
    positions=layoutGraph(subgraph.nodes,subgraph.edges);
    for(const edge of subgraph.edges) {
        const line=svgElement('line',{class:`graph-edge ${edge.current?'current':'former'} ${pathEdges.has(edge.id)?'in-path':''}`,tabindex:0,'data-edge':edge.id,'aria-label':`${nodeLabel(edge.source)}: ${edge.current?'current owner snapshot':'historical ownership'} ${nodeLabel(edge.target)}`});
        const title=svgElement('title');title.textContent=`${edge.current?'Current owner snapshot':'Historical ownership'}: ${nodeLabel(edge.target,true)}`;line.appendChild(title);
        viewport.appendChild(line);renderedEdges.push({edge,element:line});
    }
    for(const node of subgraph.nodes) {
        const group=svgElement('g',{class:`graph-node ${node.type} ${node.id===rootId?'root':''} ${pathNodes.has(node.id)?'in-path':''}`,tabindex:0,role:'button','data-node':node.id,'aria-label':nodeLabel(node.id,true)});
        group.appendChild(svgElement('circle',{r:node.type==='nft'?19:14}));
        const label=svgElement('text',{y:node.type==='nft'?35:30,'text-anchor':'middle'});
        const full=nodeLabel(node.id);label.textContent=full.length>27?full.slice(0,25)+'…':full;group.appendChild(label);
        const title=svgElement('title');title.textContent=nodeLabel(node.id,true);group.appendChild(title);
        viewport.appendChild(group);nodeElements.set(node.id,group);
    }
    updateGraphGeometry();view={x:0,y:0,zoom:1};setGraphView();
}
function inspectGraphNode(id) {
    const node=network.nodes.get(id);
    if(!node) return;
    const related=graphNeighbors(network,id,document.getElementById('currentOnly').checked);
    const character=node.type==='nft'?graphById.get(Number(node.nft_id)):null;
    const check=character?.transfer_check || {};
    document.getElementById('nodeInfo').innerHTML=`<h2>${node.type==='nft'?'Character':'Wallet'}</h2><p class="${node.type==='wallet'?'wallet':''}">${graphEscape(nodeLabel(id,true))}</p>
        ${node.type==='nft'?`<p><a href="index.html?nft=${node.nft_id}">View character details</a></p><p>Owner snapshot: ${graphEscape(graphDate(character?.market?.checked_at))}</p><p>Transfer history: ${check.checked_at?graphEscape(graphDate(check.checked_at)):'not yet fetched'}${check.error?' · latest check failed':''}${check.all_returned===false?' · partial response':''}</p>`:''}
        <p>${related.length} recorded ownership links. Select a link for its dates and evidence.</p><ul>${related.map(next=>`<li>${graphEscape(nodeLabel(next.id))} · ${next.edge.current?'current owner snapshot':'historical ownership'}</li>`).join('')}</ul>`;
}
function inspectGraphEdge(id) {
    const edge=network.edges.get(id);
    if(!edge) return;
    document.getElementById('nodeInfo').innerHTML=`<h2>${edge.current?'Current owner snapshot':'Historical ownership'}</h2><p>${graphEscape(nodeLabel(edge.source))}</p><p class="wallet">${graphEscape(nodeLabel(edge.target,true))}</p><p>Last owner check: ${graphEscape(graphDate(edge.checked_at))}</p><h3>Recorded evidence</h3><ul>${edge.evidence.map(item=>`<li>${graphEscape(item.kind)}<br>${graphEscape(graphDate(item.at))}${item.last_seen?'<br>Last seen '+graphEscape(graphDate(item.last_seen)):''}${item.tx_hash?'<br><span class="transaction">'+graphEscape(item.tx_hash)+'</span>':''}</li>`).join('')}</ul>`;
}
function renderConnectionPath(path) {
    const panel=document.getElementById('connectionPath');
    if(!path) { panel.innerHTML='';return; }
    const walletDistance=path.nodes.filter(id=>id.startsWith('wallet:')).length-1;
    const walletEndpoints=path.nodes[0].startsWith('wallet:')&&path.nodes.at(-1).startsWith('wallet:');
    panel.innerHTML=`<h2>Shortest recorded connection</h2><p>${path.edges.length} ownership edges${walletEndpoints?' · '+walletDistance+' wallet-to-wallet steps through NFTs':''}.</p>${path.edges.length?`<ol>${path.edges.map((edge,i)=>`<li><strong>${graphEscape(nodeLabel(path.nodes[i],true))}</strong><br>${edge.current?'Current owner snapshot':'Historical ownership'} · last owner check ${graphEscape(graphDate(edge.checked_at))}<br><strong>${graphEscape(nodeLabel(path.nodes[i+1],true))}</strong></li>`).join('')}</ol>`:'<p>Start and destination are the same node.</p>'}<p class="muted">This is the shortest path in the available records. Ownership dates may differ; a path does not imply simultaneous ownership or a shared player.</p>`;
}
function exploreGraph(event) {
    if(event) event.preventDefault();
    const root=resolveGraphNode(document.getElementById('graphRoot').value);
    const targetText=document.getElementById('graphTarget').value.trim();
    const target=targetText?resolveGraphNode(targetText):null;
    const status=document.getElementById('graphStatus');
    if(!root || (targetText&&!target)) {
        status.textContent='NFT or wallet not found in the indexed records. Use an NFT ID, exact unique name, or full wallet address.';
        viewport.replaceChildren();document.getElementById('connectionPath').innerHTML='';return;
    }
    rootId=root;
    const currentOnly=document.getElementById('currentOnly').checked;
    const depth=Number(document.getElementById('graphDepth').value);
    selectedPath=target?graphPath(network,root,target,currentOnly):null;
    const subgraph=graphNeighborhood(network,root,depth,180,currentOnly);
    if(selectedPath) {
        const displayed=new Set(subgraph.nodes.map(node=>node.id));
        for(const id of selectedPath.nodes) if(!displayed.has(id)) { subgraph.nodes.push({...network.nodes.get(id)});displayed.add(id); }
        const included=new Set(subgraph.edges.map(edge=>edge.id));
        for(const edge of selectedPath.edges) if(!included.has(edge.id)) subgraph.edges.push(edge);
    }
    renderGraph(subgraph);renderConnectionPath(selectedPath);inspectGraphNode(root);
    status.textContent=`${subgraph.nodes.length} nodes and ${subgraph.edges.length} ownership links shown. ${subgraph.truncated?'Display capped at 180 neighborhood nodes; connection search still uses the full indexed graph. ':''}${target&&!selectedPath?'No path was found in the available '+(currentOnly?'current-owner':'ownership')+' records. ':''}${subgraph.edges.length===0?'No ownership data is available for this NFT yet. ':''}`;
    const url=new URL(location.href);url.searchParams.set('root',root.replace(/^nft:|^wallet:/,''));
    targetText?url.searchParams.set('to',targetText):url.searchParams.delete('to');
    history.replaceState(null,'',url);
}

document.getElementById('graphForm').addEventListener('submit',exploreGraph);
document.getElementById('fitGraph').addEventListener('click',()=>{view={x:0,y:0,zoom:1};setGraphView();});
document.getElementById('graphRoot').addEventListener('input',event=>{
    const value=event.target.value.toLowerCase();
    document.getElementById('characterSuggestions').innerHTML=graphCharacters.filter(character=>String(character.nft_id).includes(value)||String(character.character_name).toLowerCase().includes(value)).slice(0,25).map(character=>`<option value="${character.nft_id}">${graphEscape(character.character_name)}</option>`).join('');
});
function pointerPosition(event) {
    const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
}
svg.addEventListener('pointerdown',event=>{
    const node=event.target.closest('[data-node]');
    const point=pointerPosition(event);
    drag={id:node?.dataset.node || null,edge:event.target.closest('[data-edge]')?.dataset.edge || null,start:point,previous:point,moved:false};
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
        if(drag.id) inspectGraphNode(drag.id);else if(drag.edge) inspectGraphEdge(drag.edge);
    }
    drag=null;
});
svg.addEventListener('pointercancel',()=>{drag=null;});
svg.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ') return;
    const node=event.target.closest('[data-node]'),edge=event.target.closest('[data-edge]');
    if(node) inspectGraphNode(node.dataset.node);else if(edge) inspectGraphEdge(edge.dataset.edge);
    event.preventDefault();
});
svg.addEventListener('wheel',event=>{
    event.preventDefault();const point=pointerPosition(event),zoom=Math.max(.25,Math.min(4,view.zoom*Math.exp(-event.deltaY*.001)));
    view.x=point.x-(point.x-view.x)*zoom/view.zoom;view.y=point.y-(point.y-view.y)*zoom/view.zoom;view.zoom=zoom;setGraphView();
},{passive:false});
const ownerCount=graphCharacters.filter(character=>graphWallet(character.market?.owner)).length;
const historyCount=graphCharacters.filter(character=>character.transfer_check?.checked_at).length;
document.getElementById('coverage').textContent=`${graphCharacters.length.toLocaleString()} indexed characters · ${ownerCount} owner snapshots · ${historyCount} fetched transfer histories · ${network.nodes.size-graphCharacters.length} connected wallets. Coverage grows after each full collection run.`;
const params=new URLSearchParams(location.search);
document.getElementById('graphRoot').value=params.get('root') || String(graphCharacters.find(character=>character.nft_id===8&&character.market?.owner)?.nft_id || graphCharacters.find(character=>character.market?.owner)?.nft_id || graphCharacters[0]?.nft_id || '');
document.getElementById('graphTarget').value=params.get('to') || '';
exploreGraph();
