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
const opened=[],storage={},clickHandlers=[];
const context=vm.createContext({document:{getElementById:get,createElementNS:()=>new Element(),addEventListener:(name,handler)=>clickHandlers.push(handler)},window:{open:(...args)=>opened.push(args)},localStorage:{getItem:key=>storage[key],setItem:(key,value)=>storage[key]=value},URL,URLSearchParams,location:{href:'https://example.test/graph.html',search:''},history:{replaceState(){}}});
const run=code=>vm.runInContext(code,context);
run(script);
assert.match(get('coverage').textContent,/indexed characters/);
assert.ok(get('graphViewport').children.length>0,'SVG nodes must render');
assert.match(get('nodeInfo').innerHTML,/Character/);
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
get('graphTarget').value='not-indexed';
run('exploreGraph()');
assert.match(get('graphStatus').textContent,/not found/);
assert.equal(get('graphViewport').children.length,0);
console.log('Graph page integration passed: directed arrows, real data, wallet/NFT links, persisted exclusions, association paths and unknown-node handling.');
