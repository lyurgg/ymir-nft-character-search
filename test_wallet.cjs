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
 const fetch=async path=>{
  urls.push(path);const file='wallet-data/'+path.split('wallet-data/')[1];
  return {ok:true,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};
 };
 const context=vm.createContext({document:{getElementById:get},fetch,URL,URLSearchParams,location:{href:'https://example.test/project/wallet.html',search:'?wallet='+target},history:{replaceState(){}}});
 const run=code=>vm.runInContext(code,context);run(script);
 // Calling again also checks that an older asynchronous response cannot replace the latest search.
 await run('loadWallet()');
 assert.match(get('walletRows').innerHTML,/25,000/);
 assert.match(get('walletRows').innerHTML,/20,000/);
 assert.match(get('walletRows').innerHTML,/16,302.8151/);
 assert.doesNotMatch(get('walletRows').innerHTML,/e957cbd4a0/,'August transfers must stay outside the focused period');
 assert.equal((get('walletRows').innerHTML.match(/<tr>/g)||[]).length,4);
 assert.match(get('walletCoverage').innerHTML,/Regular transactions/);
 assert.match(get('walletCoverage').innerHTML,/Internal transactions/);
 get('tabInternal').listeners.click();
 assert.equal(get('tabInternal').attributes['aria-selected'],'true');
 assert.doesNotMatch(get('walletRows').innerHTML,/Regular transaction/);
 get('tabRegular').listeners.click();
 assert.doesNotMatch(get('walletRows').innerHTML,/Internal trace/);
 get('walletAllDates').listeners.click();
 assert.match(get('walletRows').innerHTML,/78,639/);
 assert.match(get('walletPagination').innerHTML,/data-page="2"/);
 get('walletPagination').listeners.click({target:{closest:()=>({dataset:{page:'2'}})}});
 assert.match(get('walletPagination').innerHTML,/Page 2 of/);
 get('walletSort').value='fee';get('walletSort').listeners.change();
 assert.equal(run('activityTab'),'regular');
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
