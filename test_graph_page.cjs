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
const context=vm.createContext({document:{getElementById:get,createElementNS:()=>new Element()},URL,URLSearchParams,location:{href:'https://example.test/graph.html',search:''},history:{replaceState(){}}});
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
}
get('graphTarget').value='not-indexed';
run('exploreGraph()');
assert.match(get('graphStatus').textContent,/not found/);
assert.equal(get('graphViewport').children.length,0);
console.log('Graph page integration passed: real embedded data, SVG rendering, ownership evidence, shortest-path form and unknown-node handling.');
