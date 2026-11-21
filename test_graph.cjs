const assert = require('node:assert/strict');
const {ownershipGraph,graphPath,graphNeighborhood} = require('./graph-core.js');
const wallet = n => '0x' + String(n).repeat(40);
// User's example: W1 -- NFT78 -- W2 -- NFT313 -- W7 / W8.
const characters = [
    {nft_id:78,character_name:'First',market:{owner:wallet(1)},owner_history:[{wallet:wallet(2)}]},
    {nft_id:313,character_name:'Second',market:{owner:wallet(7)},transfers:[{from:wallet(8),to:wallet(2),event:'User-Transfer',at:100,tx_hash:'0x'+'a'.repeat(64)}]},
    {nft_id:999,character_name:'No ownership data',market:{}},
];
const graph=ownershipGraph(characters);
const from='wallet:'+wallet(1), to='wallet:'+wallet(7);
const path=graphPath(graph,from,to);
assert.deepEqual(path.nodes,[from,'nft:78','wallet:'+wallet(2),'nft:313',to]);
assert.equal(path.edges.length,4);
assert.deepEqual(path.edges.map(edge=>edge.current),[true,false,false,true]);
assert.equal(graphPath(graph,from,'wallet:'+wallet(8)).edges.length,4);
assert.equal(graphPath(graph,from,to,true),null);
assert.equal(graphPath(graph,from,'nft:999'),null);
assert.equal(graphPath(graph,from,'not-indexed'),null);
assert.equal(graphPath(graph,from,from).edges.length,0);
assert.equal(graphNeighborhood(graph,from,2).nodes.length,3);
assert.equal(graphNeighborhood(graph,from,6,3).truncated,true);
assert.equal(graphNeighborhood(graph,'nft:999').nodes.length,1);
assert.equal(graphNeighborhood(graph,from,6,180,true).nodes.length,2);
assert.equal(ownershipGraph([{nft_id:1,market:{owner:'0x'+'0'.repeat(40)}}]).edges.size,0);
assert.equal(ownershipGraph([{...characters[0],owner_history:[{wallet:wallet(1)},{wallet:wallet(1)}]}]).edges.size,1);
const duplicate=ownershipGraph([{nft_id:1,market:{owner:wallet(1)},transfers:[{from:wallet(1).toUpperCase(),to:wallet(1),event:'Transfer',at:0}]}]);
assert.equal(duplicate.edges.size,1);
console.log('Graph checks passed: exact requested ownership path, W8 branch, current-only mode, disconnected nodes, self path, display cap, wallet normalization and duplicate edges.');
