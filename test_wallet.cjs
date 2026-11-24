const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {activityWei,activityAmount,validateActivity,filterActivity,summarizeActivity}=require('./wallet-core.js');
const A='0x'+'a'.repeat(40),B='0x'+'b'.repeat(40),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const row=(n,kind='regular',extra={})=>({id:kind+':'+hash(n)+':'+(kind==='internal'?'0_'+n:''),kind,tx_hash:hash(n),trace_id:kind==='internal'?'0_'+n:'',
 from:A,to:B,amount_wei:String(BigInt(n)*10n**18n),fee_wei:kind==='regular'?'2100000000000000':null,at:1793550000+n,status:'success',...extra});
const records=validateActivity([row(1),row(10),row(9,'internal',{from:B,to:A,status:'reported'}),row(11,'internal',{from:B,to:A,tx_hash:hash(9)}),row(20,'regular',{status:'failed',amount_wei:'0'})]);
assert.equal(activityWei('78,639.000000000000000001'),78639000000000000000001n);
assert.equal(activityAmount('78639000000000000000001'),'78,639.000000000000000001');
assert.throws(()=>activityWei('1.0000000000000000001'));
assert.deepEqual(filterActivity(records,A).map(r=>r.amount_wei),['11000000000000000000','10000000000000000000','9000000000000000000','1000000000000000000']);
assert.equal(filterActivity(records,A,{tab:'internal'}).length,2);
assert.equal(filterActivity(records,A,{tab:'regular'}).length,2);
assert.equal(filterActivity(records,A,{direction:'received'}).length,2);
assert.equal(filterActivity(records,A,{minimum:'10'}).length,2);
assert.equal(filterActivity(records,A,{includeFailed:true}).length,5);
assert.equal(filterActivity(records,A,{sort:'fee'}).length,2);
assert.throws(()=>filterActivity(records,A,{after:'2026-12-01',before:'2026-01-01'}));
assert.equal(filterActivity(records,A,{after:'2020-01-01',before:'2020-01-02'}).length,0);
const totals=summarizeActivity(records,A);
assert.equal(totals.sent,'11000000000000000000');assert.equal(totals.received,'20000000000000000000');
assert.equal(totals.fees,'6300000000000000','A failed regular transaction still costs gas');
assert.equal(summarizeActivity([row(1,'regular',{fee_wei:null})],A).feeRecords,0);
assert.throws(()=>validateActivity([row(1,'internal',{trace_id:'0'})]));
assert.equal(validateActivity([row(1),row(1)]).length,1);
console.log('Wallet core passed: exact values, regular/internal separation, trace identity, directions, gas fees, failures and filters.');

async function pageChecks() {
 const html=fs.readFileSync('wallet.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const elements=new Map();
 class Element {constructor(){this.value='';this.checked=false;this.disabled=false;this.innerHTML='';this.textContent='';this.listeners={};this.attributes={};}addEventListener(k,fn){this.listeners[k]=fn;}setAttribute(k,v){this.attributes[k]=v;}}
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 get('walletDirection').value='all';get('walletSort').value='amount';get('walletMinimum').value='0';
 const target='0xbeaabc38996609c58c1de8d30acd368ef47d5b63',urls=[];
 let simulateGrowth=false;
 const fetch=async path=>{
  urls.push(path);const file='wallet-data/'+path.split('wallet-data/')[1];
  return {ok:true,json:async()=>{
   const data=JSON.parse(fs.readFileSync(file,'utf8'));
   if(simulateGrowth&&data.wallet===target)data.transactions.push(...Array.from({length:35},(_,i)=>row(1000+i,'regular',{from:target,amount_wei:String(BigInt(1000000+i)*10n**18n)})));
   return data;
  }};
 };
 const context=vm.createContext({document:{getElementById:get},fetch,URL,URLSearchParams,location:{href:'https://example.test/project/wallet.html',search:'?wallet='+target},history:{replaceState(){}}});
 const run=code=>vm.runInContext(code,context);run(script);
 // Calling again also checks that an older asynchronous response cannot replace the latest search.
 await run('loadWallet()');
 const focused=run('filterActivity(activityData.transactions,activitySelected,walletOptions())');
 const expectedHighs=['0xec88a04d75ab1affba8e304cd3431a2b436884952ce1b681aec881036cc51ed2','0x7c637391069cb5594ab7d62a163857afb78f7cfceadc404956b96e1199b8e0ab','0x02a2d4b0ab0d6286643c604b1fe15606a5ec7f27b283b62c8b4a422b1d077320','0x619db1428be5f89366783158d383a32d168513199d444a51db3df2c4f32e467a'];
 for(const tx of expectedHighs)assert.ok(focused.some(row=>row.tx_hash===tx),'Captured high transfer must remain discoverable: '+tx);
 for(const row of focused.slice(0,25))assert.ok(get('walletRows').innerHTML.includes(row.tx_hash),'The first page must contain the highest current records');
 assert.doesNotMatch(get('walletRows').innerHTML,/e957cbd4a0/,'August transfers must stay outside the focused period');
 assert.equal((get('walletRows').innerHTML.match(/<tr>/g)||[]).length,Math.min(25,focused.length));
 assert.match(get('walletCoverage').innerHTML,/Regular transactions/);
 assert.match(get('walletCoverage').innerHTML,/Internal transactions/);
 get('tabInternal').listeners.click();
 assert.equal(get('tabInternal').attributes['aria-selected'],'true');
 assert.doesNotMatch(get('walletRows').innerHTML,/Regular transaction/);
 get('tabRegular').listeners.click();
 assert.doesNotMatch(get('walletRows').innerHTML,/Internal trace/);
 get('walletAllDates').listeners.click();
 const highestAllTime=run('filterActivity(activityData.transactions,activitySelected,walletOptions())[0]');
 assert.ok(get('walletRows').innerHTML.includes(highestAllTime.tx_hash));
 assert.match(get('walletPagination').innerHTML,/data-page="2"/);
 get('walletPagination').listeners.click({target:{closest:()=>({dataset:{page:'2'}})}});
 assert.match(get('walletPagination').innerHTML,/Page 2 of/);
 get('walletSort').value='fee';get('walletSort').listeners.change();
 assert.equal(run('activityTab'),'regular');
 // New large transfers can push the original four off the first page. They
 // remain discoverable on later pages without requiring a fixed live count.
 simulateGrowth=true;get('tabAll').listeners.click();get('walletHighs').listeners.click();
 await run('loadWallet()');
 assert.equal((get('walletRows').innerHTML.match(/<tr>/g)||[]).length,25);
 assert.doesNotMatch(get('walletRows').innerHTML,new RegExp(expectedHighs[0]));
 get('walletPagination').listeners.click({target:{closest:()=>({dataset:{page:'2'}})}});
 for(const tx of expectedHighs)assert.ok(get('walletRows').innerHTML.includes(tx),'Captured transfer must remain visible on a later page: '+tx);
 simulateGrowth=false;
 assert.ok(urls.every(url=>url.startsWith('wallet-data/')),'Browser requests must stay on the site, not the CORS-blocked Scan API');
 get('walletAddress').value='bad';await run('loadWallet()');
 assert.match(get('walletStatus').textContent,/complete 0x wallet/);
 assert.equal(get('loadWallet').disabled,false);
 get('walletAddress').value='0x'+'f'.repeat(40);await run('loadWallet()');
 assert.match(get('walletStatus').textContent,/Transfer-only cache/);
 assert.match(get('walletRefresh').innerHTML,/Wallet address \(optional\)/);
 get('walletMinimum').value='<script>';get('walletMinimum').listeners.change();
 assert.match(get('walletStatus').textContent,/positive WEMIX/);
 assert.doesNotMatch(get('walletRows').innerHTML,/<script>/);
 console.log('Wallet page passed: real wallet rankings, all/regular/internal tabs, pagination, gas sorting, safe same-origin loading and unknown-wallet guidance.');
}
pageChecks().catch(error=>{console.error(error);process.exitCode=1;});
