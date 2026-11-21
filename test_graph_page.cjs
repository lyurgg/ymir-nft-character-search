const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('graph.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements=new Map();
class Element {
    constructor(){this.value='';this.checked=false;this.innerHTML='';this.textContent='';this.children=[];this.listeners={};this.attributes={};}
    setAttribute(key,value){this.attributes[key]=value;}
    appendChild(child){this.children.push(child);}
    replaceChildren(){this.children=[];}
    addEventListener(key,handler){this.listeners[key]=handler;}
}
const get=id=>{if(!elements.has(id)) elements.set(id,new Element());return elements.get(id);};
get('graphDepth').value='4';
get('graphMode').value='associations';
get('showNFTLabels').checked=true;
const opened=[],storage={},clickHandlers=[];
const context=vm.createContext({document:{getElementById:get,createElementNS:()=>new Element(),addEventListener:(name,handler)=>clickHandlers.push(handler)},window:{open:(...args)=>opened.push(args)},localStorage:{getItem:key=>storage[key],setItem:(key,value)=>storage[key]=value},URL,URLSearchParams,location:{href:'https://example.test/graph.html',search:''},history:{replaceState(){}}});
const run=code=>vm.runInContext(code,context);
run(script);
run('const shippedFundingData=fundingData;');
assert.match(get('coverage').textContent,/indexed characters/);
assert.ok(get('graphViewport').children.length>0,'SVG nodes must render');
assert.match(get('nodeInfo').innerHTML,/Character/);
assert.equal(get('graphDepthControl').hidden,false);
assert.equal(get('fundingDepthControl').hidden,true);
assert.match(html,/<label id="graphDepthControl">[\s\S]*?<option value="3">3 steps<\/option>/);
const ownedId=run('graphCharacters.find(character=>graphWallet(character.market?.owner))?.nft_id');
if(ownedId!==undefined) {
    get('graphRoot').value=String(ownedId);
    get('graphTarget').value=run(`graphById.get(${Number(ownedId)}).market.owner`);
    run('exploreGraph()');
    assert.match(get('connectionPath').innerHTML,/Shortest recorded connection/);
    assert.match(get('connectionPath').innerHTML,/1 ownership edges/);
    assert.match(get('connectionPath').innerHTML,/Current owner snapshot/);
    run(`openGraphNode('wallet:'+graphById.get(${Number(ownedId)}).market.owner)`);
    assert.match(opened.at(-1)[0],/^https:\/\/scan.wemix.com\/address\/0x/);
    run(`openGraphNode('nft:${Number(ownedId)}')`);
    assert.equal(opened.at(-1)[0],`index.html?nft=${ownedId}`);
    const wallet=run(`graphById.get(${Number(ownedId)}).market.owner`);
    run(`excludeWallet(${JSON.stringify(wallet)})`);
    assert.equal(run(`network.nodes.has('wallet:'+${JSON.stringify(wallet)})`),false);
    assert.match(storage['ymir-graph-excluded'],/0x/);
    run('excludedWallets.clear();saveGraphPreferences();');
}
get('graphMode').value='transfers';get('graphTarget').value='';get('graphRoot').value='8';run('exploreGraph()');
assert.equal(run('network.directed'),true);
assert.match(get('graphLegend').innerHTML,/source → destination/);
assert.match(get('nodeInfo').innerHTML,/Wallet/);
assert.ok(get('graphViewport').children.some(item=>item.attributes['marker-end']==='url(#transferArrow)'));
// Regression: the old 45-edge threshold suppressed every name/ID in large graphs.
run(`{
 const edge=[...network.edges.values()][0];
 renderGraph({nodes:[network.nodes.get(edge.source),network.nodes.get(edge.target)],edges:Array.from({length:60},(_,i)=>({...edge,id:'label-regression-'+i}))});
 view={x:12,y:34,zoom:2};setGraphView();
}`);
assert.equal(get('graphViewport').children.filter(item=>item.attributes.class==='edge-label').length,60);
assert.equal(get('network').attributes['data-nft-labels'],'shown');
const transform=get('graphViewport').attributes.transform;
get('showNFTLabels').checked=false;get('showNFTLabels').listeners.change();
assert.equal(get('network').attributes['data-nft-labels'],'hidden');
assert.equal(get('graphViewport').attributes.transform,transform);
get('showNFTLabels').checked=true;get('showNFTLabels').listeners.change();
assert.equal(get('network').attributes['data-nft-labels'],'shown');
get('graphMode').value='funding';get('graphRoot').value='1358';get('graphTarget').value='3871';
run('fundingData=null;');
get('graphMode').listeners.change();
assert.equal(get('graphDepthControl').hidden,true);
assert.equal(get('fundingDepthControl').hidden,false);
assert.equal(get('fundingDaysControl').hidden,false);
assert.equal(get('fundingDepth').disabled,false);
assert.match(get('graphStatus').textContent,/not collected yet/);
assert.doesNotMatch(get('graphStatus').textContent,/0 shared/);
run(`fundingData={schema_version:1,chain_id:1111,asset:'WEMIX',source:'Test records',transfers:[],coverage:[]};exploreGraph();`);
assert.match(get('graphStatus').textContent,/incomplete/);
// UI-only fixture: exercise the positive shared-source view without writing any
// fabricated transfers to the shipped funding dataset.
get('fundingDays').value='7';
run(`{
 const purchases=fundingPurchases(graphCharacters,[1358,3871]);
 const chosen=[purchases.find(p=>p.nft_id===1358),purchases.find(p=>p.nft_id===3871)];
 fundingData={schema_version:1,chain_id:1111,asset:'WEMIX',source:'Test fixture',coverage:[],
  transfers:chosen.map((p,i)=>({from:'0x'+'a'.repeat(40),to:p.buyer,at:p.at-60,amount_wei:'1000000000000000000',asset:'WEMIX',chain_id:1111,tx_hash:'0x'+String(i+1).repeat(64)}))};
 exploreGraph();
}`);
assert.match(get('graphStatus').textContent,/1 shared funding sources/);
assert.match(get('connectionPath').innerHTML,/Funding evidence before each purchase/);
assert.match(get('connectionPath').innerHTML,/not independently verified/);
assert.equal(run('network.kind'),'funding');
assert.equal(run('[...network.edges.values()].filter(e=>e.kind==="funding").length'),2);
assert.equal(run('[...network.edges.values()].filter(e=>e.kind==="purchase").length'),2);
run(`inspectGraphEdge([...network.edges.keys()][0]);`);
assert.match(get('nodeInfo').innerHTML,/WEMIX/);
// Deeper view must report missing intermediate histories even when buyers are complete.
run(`{
 const chosen=fundingPurchases(graphCharacters,[1358,3871]);
 const buyers=[chosen.find(p=>p.nft_id===1358),chosen.find(p=>p.nft_id===3871)];
 const source='0x'+'a'.repeat(40),via=['0x'+'e'.repeat(40),'0x'+'f'.repeat(40)];
 fundingData={schema_version:1,chain_id:1111,asset:'WEMIX',source:'Test fixture',coverage:buyers.map(p=>({wallet:p.buyer,complete:true})),
  transfers:buyers.flatMap((p,i)=>[
   {from:source,to:via[i],at:p.at-120,amount_wei:'2000000000000000000',asset:'WEMIX',chain_id:1111,tx_hash:'0x'+String(i+5).repeat(64)},
   {from:via[i],to:p.buyer,at:p.at-60,amount_wei:'1000000000000000000',asset:'WEMIX',chain_id:1111,tx_hash:'0x'+String(i+7).repeat(64)}])};
}`);
get('fundingDepth').value='1';run('exploreGraph()');
assert.match(get('graphStatus').textContent,/0 shared funding sources/);
get('fundingDepth').value='2';run('exploreGraph()');
assert.match(get('graphStatus').textContent,/1 shared funding sources/);
assert.match(get('graphStatus').textContent,/up to 2 hops/);
assert.match(get('graphStatus').textContent,/2 wallets without complete histories/);
assert.match(get('connectionPath').innerHTML,/2 hops from this source/);
assert.equal(run('[...network.edges.values()].filter(e=>e.kind==="funding").length'),4);
// Captured mainnet evidence exercises the real pair with 0-hop buyer roots.
run('fundingData='+JSON.stringify({schema_version:1,...JSON.parse(fs.readFileSync('funding_case_report.json','utf8'))}));
get('fundingBuyerRoots').checked=true;get('fundingDepth').value='3';get('fundingDays').value='90';run('exploreGraph()');
assert.match(get('graphStatus').textContent,/2 shared funding sources/);
assert.match(get('connectionPath').innerHTML,/0 hops from this source/);
assert.match(get('connectionPath').innerHTML,/No incoming funding transfer is implied/);
assert.match(get('connectionPath').innerHTML,/60,025/);
assert.ok(run('network.edges.has("0xa87c6a96569d836496757cae73c32d77d9d866df218b8f493e890e4952e38e62")'));
get('fundingBuyerRoots').checked=false;run('exploreGraph()');
assert.match(get('graphStatus').textContent,/1 shared funding sources/);
assert.doesNotMatch(get('connectionPath').innerHTML,/0 hops from this source/);
// A single NFT discovers related characters; the real loaded snapshot is retained.
get('fundingBuyerRoots').checked=true;get('graphTarget').value='';
run('fundingData=shippedFundingData;exploreGraph();');
assert.match(get('graphStatus').textContent,/related NFTs found for/);
assert.ok(get('graphStatus').textContent.includes(run('nftLabel(1358)')));
assert.match(get('fundingResults').innerHTML,/data-funding-target="1154"/);
assert.match(get('fundingResults').innerHTML,/data-funding-target="3871"/);
assert.match(get('fundingResults').innerHTML,/data-funding-page="2"/);
assert.ok(run('network.nodes.has("nft:1358")'));
const clickData=dataset=>clickHandlers.forEach(handler=>handler({target:{closest:()=>({dataset})}}));
clickData({fundingPage:'2'});
assert.match(get('fundingResults').innerHTML,/Page 2 of/);
clickData({fundingTarget:'3871'});
assert.equal(get('graphTarget').value,'3871');
assert.match(get('graphStatus').textContent,/2 shared funding sources/);
assert.match(get('fundingResults').innerHTML,/Find other NFTs with shared funders/);
clickData({fundingDiscover:'true'});
assert.equal(get('graphTarget').value,'');
assert.match(get('fundingResults').innerHTML,/Characters connected to/);
// Invalid targets are reported, rather than silently treated as discovery.
get('graphTarget').value='no-such-nft';run('exploreGraph()');
assert.match(get('graphStatus').textContent,/comparison must be a different NFT/);
assert.equal(get('fundingResults').innerHTML,'');
// Discovery with missing funding data never claims no connection.
get('graphTarget').value='';run('fundingData=null;exploreGraph();');
assert.match(get('graphStatus').textContent,/not collected yet/);
assert.equal(get('fundingResults').innerHTML,'');
get('graphMode').value='transfers';
get('graphTarget').value='not-indexed';
run('exploreGraph()');
assert.match(get('graphStatus').textContent,/not found/);
assert.equal(get('graphViewport').children.length,0);
assert.equal(get('fundingResults').innerHTML,'');
assert.equal(get('graphDepthControl').hidden,false);
assert.equal(get('fundingDepthControl').hidden,true);
assert.equal(get('fundingDaysControl').hidden,true);
console.log('Graph page integration passed: directed arrows, real data, wallet/NFT links, persisted exclusions, association paths and unknown-node handling.');
