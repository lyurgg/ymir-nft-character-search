const assert=require('node:assert/strict');
const {fundingPurchases,validateFundingData,commonFundingSources,fundingDiscoveries,fundingGraph,wemixAmount}=require('./funding-core.js');
const [A,B,C,D]=['a','b','c','d'].map(c=>'0x'+c.repeat(40));
const chars=[
 {nft_id:1358,character_name:'Bunn1eSSS',market:{owner:D},transfers:[{event:'Auction-Buy',chain:'mainnet',to:B,at:1000000,tx_hash:'0x'+'3'.repeat(64),price:'58,000'}]},
 {nft_id:3871,character_name:'GèenWoo',market:{owner:A},transfers:[{event:'Offer-Bid-Buy',chain:'mainnet',to:C,at:2000000,tx_hash:'0x'+'4'.repeat(64),price:'57,000'}]},
];
const purchases=fundingPurchases(chars,[1358,3871]);
assert.equal(purchases[0].buyer,B);
const row=(to,at,hash)=>({from:A,to,at,tx_hash:'0x'+hash.repeat(64),asset:'WEMIX',chain_id:1111,amount_wei:'58000000000000000000000'});
const dataset=validateFundingData({schema_version:1,asset:'WEMIX',chain_id:1111,transfers:[row(B,999999,'1'),row(C,1999999,'2')]});
const matches=commonFundingSources(purchases,dataset.transfers);
assert.equal(matches.length,1);
assert.equal(matches[0].source,A);
assert.equal(commonFundingSources(purchases,dataset.transfers,{excluded:new Set([A])}).length,0);
assert.equal(commonFundingSources(purchases,dataset.transfers.map(t=>({...t,at:2000100}))).length,0);
assert.equal(commonFundingSources(purchases,dataset.transfers.map(t=>({...t,amount_wei:'1'}))).length,0);
assert.equal(commonFundingSources(purchases,dataset.transfers.map(t=>({...t,asset:'WWEMIX'}))).length,0);
const graph=fundingGraph(matches,chars);
assert.equal(graph.edges.size,4);
assert.equal(graph.nodes.size,5);
assert.equal(graph.edges.get('0x'+'1'.repeat(64)).target,'wallet:'+B);
assert.equal(wemixAmount('58000000000000000000001'),'58,000.000000000000000001');
assert.throws(()=>validateFundingData({...dataset,chain_id:1}));
assert.throws(()=>validateFundingData({...dataset,transfers:[{...dataset.transfers[0],amount_wei:'-5'}]}));
assert.throws(()=>validateFundingData({...dataset,transfers:[dataset.transfers[0],{...dataset.transfers[0],amount_wei:'2'}]}));
console.log('Funding checks passed: common source, actual purchase buyers, chronology, exclusions, minimum amounts, native-asset separation and exact values.');
const [X,Y,Z]=['e','f','9'].map(c=>'0x'+c.repeat(40));
const hop=(from,to,at,key)=>({...row(to,at,key),from});
const upstream=[hop(A,X,999000,'5'),hop(X,B,999500,'6'),hop(A,Y,1999000,'7'),hop(Y,C,1999500,'8')];
assert.equal(commonFundingSources(purchases,upstream).length,0);
const two=commonFundingSources(purchases,upstream,{maxDepth:2});
assert.equal(two.length,1);assert.equal(two[0].source,A);
assert.deepEqual(two[0].evidence.map(e=>e.depth),[2,2]);
assert.equal(two[0].evidence[0].path[0].from,A);
assert.equal(two[0].evidence[0].path.at(-1).to,B);
assert.ok(two.searchedWallets.includes(X)&&two.searchedWallets.includes(Y));
assert.equal(fundingGraph(two,chars).edges.size,6);
assert.equal(fundingGraph(two,chars).nodes.size,7);
assert.equal(commonFundingSources(purchases,upstream,{maxDepth:2,excluded:new Set([X])}).length,0);
const wrongOrder=upstream.map(e=>e.from===A?{...e,at:e.at+600}:e);
assert.equal(commonFundingSources(purchases,wrongOrder,{maxDepth:2}).length,0);
const three=[...upstream,hop(Z,A,998000,'a')];
assert.ok(!commonFundingSources(purchases,three,{maxDepth:2}).some(m=>m.source===Z));
assert.ok(commonFundingSources(purchases,three,{maxDepth:3,days:30}).some(m=>m.source===Z));
const cycle=[...upstream,hop(B,X,998500,'b')];
assert.ok(commonFundingSources(purchases,cycle,{maxDepth:3}).every(m=>m.evidence.every(e=>new Set([e.path[0].from,...e.path.map(h=>h.to)]).size===e.path.length+1)));
assert.equal(commonFundingSources(purchases,upstream,{maxDepth:3,maxSearchSteps:1}).searchTruncated,true);
assert.throws(()=>commonFundingSources(purchases,upstream,{maxDepth:4}));
console.log('Upstream funding checks passed: depth boundaries, chronological paths, intermediates, exclusions, cycles and search-budget disclosure.');
// A purchase buyer may itself fund the other buyer: zero hops on one branch.
const direct=[hop(C,B,999900,'c')];
assert.equal(commonFundingSources(purchases,direct).length,0);
const roots=commonFundingSources(purchases,direct,{includeBuyerRoots:true});
assert.equal(roots.length,1);assert.equal(roots[0].source,C);
assert.deepEqual(roots[0].evidence.map(e=>e.depth).sort(),[0,1]);
assert.equal(roots[0].evidence.find(e=>e.depth===0).funding,null);
assert.equal(fundingGraph(roots,chars).edges.size,3);
assert.equal(commonFundingSources(purchases,direct,{includeBuyerRoots:true,excluded:new Set([C])}).length,0);
assert.equal(commonFundingSources(purchases.map(p=>({...p,buyer:B})),[],{includeBuyerRoots:true}).length,1);
console.log('Zero-hop checks passed: optional purchase-buyer roots, honest evidence and directed funding edges.');
// Replay captured, RPC-verified Kufuking/Bunn1eSSS evidence without network calls.
const actual=require('./funding_case_report.json');
const captured=validateFundingData({schema_version:1,...actual});
for(const testCase of actual.cases) {
    const selected=actual.purchases.filter(p=>testCase.nft_ids.includes(p.nft_id));
    const found=commonFundingSources(selected,captured.transfers,{days:testCase.days,maxDepth:testCase.max_depth,includeBuyerRoots:true});
    const signature=matches=>matches.map(m=>[m.source,m.evidence.map(e=>[e.purchase.nft_id,e.depth]).sort()]).sort();
    assert.deepEqual(signature(found),signature(testCase.matches));
}
assert.equal(actual.rpc_verification.length,captured.transfers.length);
console.log('Real-case replay passed: Kufuking, Kufuking2 and Geenwoo/Kufuking3 versus Bunn1eSSS at depths 1–3, including zero-hop roots.');
// Discovery must retain only sources that connect to the focused NFT.
const focused=commonFundingSources(actual.purchases,captured.transfers,{focusNftId:1358,maxDepth:3,days:90,includeBuyerRoots:true});
const discoveries=fundingDiscoveries(focused,1358);
assert.deepEqual(discoveries.map(r=>r.nft_id).sort((a,b)=>a-b),[1154,3433,3871]);
assert.ok(!discoveries.some(r=>r.nft_id===1358));
for(const related of discoveries) {
    const pair=commonFundingSources(actual.purchases.filter(p=>[1358,related.nft_id].includes(p.nft_id)),captured.transfers,{maxDepth:3,days:90,includeBuyerRoots:true});
    assert.deepEqual(related.sources.slice().sort(),pair.map(m=>m.source).sort());
}
const irrelevant=commonFundingSources([...purchases,{nft_id:9,buyer:D,at:2000000}],dataset.transfers,{focusNftId:9});
assert.equal(irrelevant.length,0,'Other NFTs sharing a funder must not become matches for an unrelated focus');
const sameBuyer=[{nft_id:1,buyer:B,at:1000000},{nft_id:2,buyer:B,at:1000000},{nft_id:3,buyer:C,at:1000000}];
const triple=commonFundingSources(sameBuyer,[row(B,999999,'1'),row(C,999999,'2')],{focusNftId:1});
assert.deepEqual(fundingDiscoveries(triple,1).map(r=>r.nft_id),[3],'A third buyer must not make the same-buyer pair a funding match');
const onlyBuyer=commonFundingSources(sameBuyer,[],{focusNftId:1,includeBuyerRoots:true});
assert.equal(fundingDiscoveries(onlyBuyer,1)[0].buyerOnly,true);
assert.deepEqual(fundingDiscoveries(onlyBuyer,1).map(r=>r.nft_id),[2]);
assert.equal(commonFundingSources(actual.purchases,captured.transfers,{focusNftId:1358,maxDepth:3,days:90,excluded:new Set([B]),maxSearchSteps:1}).searchTruncated,true);
assert.ok(commonFundingSources(actual.purchases,captured.transfers,{focusNftId:1358,maxDepth:3,days:90,maxSearchSteps:1}).searchedNfts.includes(1358),'The focus must be searched before other NFTs');
assert.equal(fundingPurchases(chars).length,2);
const excludeFocus=commonFundingSources(actual.purchases,captured.transfers,{focusNftId:1358,maxDepth:3,days:90,includeBuyerRoots:true,excluded:new Set(['0x61f41cf8304d52085bb03d9f1b66921a24e9f54d'])});
assert.equal(fundingDiscoveries(excludeFocus,1358).length,0);
const excludeSource=commonFundingSources(actual.purchases,captured.transfers,{focusNftId:1358,maxDepth:3,days:90,includeBuyerRoots:true,excluded:new Set(['0x647a24b0281444b747bb0d5372324ed0905be0e5'])});
assert.ok(excludeSource.every(m=>m.source!=='0x647a24b0281444b747bb0d5372324ed0905be0e5'));
console.log('Discovery checks passed: one focused NFT, all related characters, pair parity, unrelated-source rejection, zero-hop labels and bounded focus-first search.');
