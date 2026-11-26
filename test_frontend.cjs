const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const A = '0x' + 'a'.repeat(40), B = '0x' + 'b'.repeat(40), C = '0x' + 'c'.repeat(40), D = '0x' + 'd'.repeat(40);
const now = new Date().toISOString();
const fixtures = [
    {nft_id:1,character_name:'Subject',market:{owner:A},owner_history:[{wallet:B}]},
    {nft_id:2,character_name:'Same current wallet',market:{owner:A}},
    {nft_id:3,character_name:'Former holding',market:{owner:C},owner_history:[{wallet:A}]},
    {nft_id:4,character_name:'Former wallet current holding',market:{owner:B}},
    {nft_id:5,character_name:'Former wallet former holding',market:{owner:D},transfers:[{from:B,to:D,at:100,tx_hash:'0x'+'1'.repeat(64),event:'User-Transfer',chain:'mainnet'}]},
].map((c,i) => ({...c, character_class:i===0?'Archer':'Berserker',server:'Chess',gp:'100,000',starting_price:String((i+1)*100),last_known_price:'90',market:{...c.market,status:'Listed',listed_price:String((i+1)*100),listed_currency:'token',checked_at:now,can_offer:true},name_history:[{name:'<Old & Name>'},{name:c.character_name}]}));
script = script.replace(/const characters = [^\n]+;/, 'const characters = '+JSON.stringify(fixtures)+';');
const elements = {};
for (const id of ['searchInput','sortField','sortDirection','marketFilter','results','resultCount','classFilter','serverFilter','currencyFilter','priceType','minPrice','maxPrice','freshnessFilter','favoritesOnly','pagination','scanSummary','characterDetails','detailsContent']) {
    elements[id] = {value:'',innerHTML:'',textContent:'',checked:false,open:false,addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}};
}
elements.sortField.value='power';
elements.marketFilter.value='all';
const storage = {};
const context = vm.createContext({document:{getElementById:id=>elements[id],addEventListener(){}},localStorage:{getItem:key=>storage[key],setItem:(key,value)=>storage[key]=value}});
const run = code => vm.runInContext(code, context);
run(script);
assert.match(elements.resultCount.innerHTML,/5/);
const groups = JSON.parse(run('JSON.stringify(Object.fromEntries(Object.entries(relatedCharacters(characters[0])).map(([k,v])=>[k,v.map(x=>x.character.nft_id)])))'));
assert.deepEqual(groups,{current_current:[2],current_former:[3],former_current:[4],former_former:[5]});
assert.equal(run('walletIndex.has("0x"+"0".repeat(40))'),false);
elements.searchInput.value=A.toUpperCase(); run('searchCharacters()'); assert.match(elements.resultCount.innerHTML,/3/);
run('clearResults()'); elements.minPrice.value='200'; elements.maxPrice.value='300'; run('searchCharacters()'); assert.match(elements.resultCount.innerHTML,/2/);
run('clearResults()'); elements.classFilter.value='Archer'; run('searchCharacters()'); assert.match(elements.resultCount.innerHTML,/1/);
run('clearResults()'); elements.searchInput.value='old & name'; run('searchCharacters()'); assert.match(elements.resultCount.innerHTML,/5/); assert.doesNotMatch(elements.results.innerHTML,/<Old & Name>/);
assert.equal(run('freshness({market:{checked_at:"2020-01-01"}})'), 'stale');
assert.equal(run('freshness({market:{error:"down",checked_at:new Date().toISOString()}})'), 'failed');
assert.equal(run('freshness({market:{}})'), 'unknown');
assert.equal(run('listingValue(characters[0])'),100);
assert.equal(run('listingValue({gp:"0",market:{listed_price:"100"}})'),null);
run('showDetails(1)'); assert.match(elements.detailsContent.innerHTML,/Current wallet: other currently held characters/); assert.match(elements.detailsContent.innerHTML,/0xaaaa/); assert.equal(elements.characterDetails.open,true);
run('toggleFavorite(1)'); assert.match(storage['ymir-favorites'],/1/);
run('clearResults()'); elements.favoritesOnly.checked=true; run('searchCharacters()'); assert.match(elements.resultCount.innerHTML,/1/);
run('clearResults()'); elements.searchInput.value='not-a-character'; run('searchCharacters()'); assert.match(elements.results.innerHTML,/No characters found/);
run('clearResults(); characters.push(...Array.from({length:120},(_,i)=>({...characters[0],nft_id:100+i}))); showAll();');
assert.equal((elements.results.innerHTML.match(/<tr>/g)||[]).length,101);
run('changePage(1)'); assert.match(elements.pagination.innerHTML,/Page 2 of 2/);
assert.equal((elements.results.innerHTML.match(/<tr>/g)||[]).length,26);
console.log('Frontend checks passed: four wallet relationships, wallet and former-name search, prices, freshness, details, favorites, escaping, and pagination.');

// A pre-bid auction can carry an old provisional deadline, as with real NFT #289.
assert.equal(run(`marketSnapshot({market:{status:'Auction',auction_end:100,auction_countdown_active:false,listed_price:'21,000',can_bid:true}}).listed_price`),'21,000');
assert.equal(run(`marketSnapshot({market:{status:'Auction',auction_end:100,auction_countdown_active:false,listed_price:'21,000',can_bid:true}}).can_bid`),true);
assert.equal(run(`marketSnapshot({market:{status:'Auction',auction_end:100,auction_countdown_active:true,listed_price:'21,000',can_bid:true}}).status`),'Auction ended');
assert.match(run(`marketDetails({market:{status:'Auction',listed_price:'21,000',can_bid:true,can_offer:false,auction_phase:'awaiting_bid'}})`),/Listed: 21,000/);
assert.match(run(`marketDetails({market:{status:'Auction',listed_price:'21,000',can_bid:true,can_offer:false,auction_phase:'awaiting_bid'}})`),/Bid: Available · Offer: Unavailable/);
require('./test_item_sales.cjs');
require('./test_wallet_items.cjs');
