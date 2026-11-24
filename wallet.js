let activityData=null,activitySelected='',activityTab='all',activityPage=1,activityRequest=0;
const walletElement=id=>document.getElementById(id);
const walletDate=at=>new Date(at*1000).toLocaleString(undefined,{timeZone:'Asia/Manila'});
const shortWallet=value=>value?value.slice(0,9)+'…'+value.slice(-6):'Contract creation';
function walletOptions() {
    return {tab:activityTab,direction:walletElement('walletDirection').value,sort:walletElement('walletSort').value,
        minimum:walletElement('walletMinimum').value,after:walletElement('walletAfter').value,before:walletElement('walletBefore').value,
        includeFailed:walletElement('walletFailures').checked};
}
function walletShareUrl() {
    const url=new URL(location.href);url.searchParams.set('wallet',activitySelected);url.searchParams.set('tab',activityTab);
    for(const [key,id] of [['after','walletAfter'],['before','walletBefore'],['min','walletMinimum'],['sort','walletSort'],['direction','walletDirection']])url.searchParams.set(key,walletElement(id).value);
    history.replaceState(null,'',url);
}
function renderWallet() {
    for(const [id,tab] of [['tabAll','all'],['tabRegular','regular'],['tabInternal','internal']])walletElement(id).setAttribute('aria-selected',String(activityTab===tab));
    if(!activityData)return;
    try {
        const filtered=filterActivity(activityData.transactions,activitySelected,walletOptions());
        walletElement('walletFocus').textContent=`Showing ${walletElement('walletAfter').value||'the earliest loaded date'} through ${walletElement('walletBefore').value||'the latest loaded date'} · at least ${walletElement('walletMinimum').value||'0'} WEMIX. The high-outlier preset uses a 1,000 WEMIX cutoff; adjust the minimum to widen the view.`;
        const totals=summarizeActivity(filtered,activitySelected),pages=Math.max(1,Math.ceil(filtered.length/25));
        activityPage=Math.max(1,Math.min(pages,activityPage));
        walletElement('walletTotals').innerHTML=[['Filtered records',totals.count.toLocaleString()],['Sent · WEMIX',activityAmount(totals.sent)],['Received · WEMIX',activityAmount(totals.received)],['Gas paid · known fees',totals.feeRecords?activityAmount(totals.fees):'Not collected']]
            .map(([label,value])=>`<article><small>${label}</small><strong>${activityEscape(value)}</strong></article>`).join('');
        walletElement('walletRows').innerHTML=filtered.slice((activityPage-1)*25,activityPage*25).map(row=>{
            const direction=activityDirection(row,activitySelected),other=direction==='received'?row.from:row.to;
            const status=row.status==='reported'?'Trace reported':row.status==='unknown'?'Result unknown':row.status==='failed'?'Failed · value not transferred':'Succeeded';
            return `<tr><td>${activityEscape(walletDate(row.at))}</td><td><span class="wallet-badge ${direction}">${direction==='self'?'Self':direction==='sent'?'Sent':'Received'}</span><small>${row.kind==='internal'?'Internal trace':'Regular transaction'}</small></td>
                <td class="wallet-amount">${activityEscape(activityAmount(row.amount_wei))}</td><td>${activityEscape(activityAmount(row.fee_wei))}${row.kind==='internal'?'<small>Included in parent tx fee</small>':row.fee_wei==null?'<small>Not collected</small>':''}</td>
                <td>${other?`<a class="wallet-address" title="${other}" href="https://scan.wemix.com/address/${other}" target="_blank" rel="noopener noreferrer">${shortWallet(other)}</a><br><a href="wallet.html?wallet=${other}">View wallet activity</a>`:'Contract creation'}</td>
                <td><a class="wallet-tx" title="${row.tx_hash}" href="https://scan.wemix.com/tx/${row.tx_hash}" target="_blank" rel="noopener noreferrer">${row.tx_hash.slice(0,10)}…${row.tx_hash.slice(-6)} ↗</a><small>${activityEscape(status)}${row.trace_id?' · trace '+activityEscape(row.trace_id):''}</small></td></tr>`;
        }).join('')||'<tr><td colspan="6">No loaded records match these filters. Missing history is not proof of no transactions.</td></tr>';
        walletElement('walletPagination').innerHTML=`<span>${filtered.length.toLocaleString()} records · Page ${activityPage} of ${pages}</span>${activityPage>1?'<button type="button" data-page="'+(activityPage-1)+'">Previous</button>':''}${activityPage<pages?'<button type="button" data-page="'+(activityPage+1)+'">Next</button>':''}`;
        walletElement('walletStatus').textContent=`${activityData.transactions.length.toLocaleString()} loaded records for ${activitySelected}. ${activityData.cacheOnly?'Transfer-only cache: regular calls, gas fees and internal histories have not been fully collected.':'Regular and internal records are shown separately below.'}`;
        walletShareUrl();
    }catch(error){walletElement('walletStatus').textContent=error.message;}
}
function renderWalletCoverage() {
    const coverage=activityData.coverage||{};
    walletElement('walletCoverage').innerHTML=['regular','internal'].map(kind=>{
        const item=coverage[kind],name=kind==='regular'?'Regular transactions':'Internal transactions';
        if(!item)return `<p><strong>${name}:</strong> Not collected${kind==='regular'&&activityData.cacheOnly?' · only successful positive-value transfers are cached':''}.</p>`;
        return `<p><strong>${name}:</strong> ${item.complete&&!item.error?'Full history reported by the source':'Partial history'}${item.checked_at?' · last checked '+activityEscape(new Date(item.checked_at).toLocaleString(undefined,{timeZone:'Asia/Manila'}))+' PHT':''}${item.error?' · last attempt: '+activityEscape(item.error):''}.</p>`;
    }).join('');
}
async function loadWallet(event) {
    if(event)event.preventDefault();
    const request=++activityRequest,wallet=activityWallet(walletElement('walletAddress').value);
    activityData=null;activitySelected=wallet;activityPage=1;
    for(const id of ['walletRows','walletPagination','walletTotals','walletCoverage','walletRefresh'])walletElement(id).innerHTML='';
    walletElement('loadWallet').disabled=false;
    if(!wallet){walletElement('walletStatus').textContent='Enter a complete 0x wallet address (40 hexadecimal characters).';return;}
    walletElement('walletStatus').textContent='Loading collected wallet history…';
    walletElement('loadWallet').disabled=true;
    try {
        const fetchJson=async path=>{const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw Error('The wallet data could not be loaded. Wait for the deployment to finish and try again.');return response.json();};
        const index=await fetchJson('wallet-data/index.json');
        let payload;
        if(index.snapshots?.[wallet]) {
            const filename=index.snapshots[wallet];
            if(!/^snapshot-0x[0-9a-f]{40}\.json$/.test(filename))throw Error('Invalid wallet snapshot index.');
            payload=await fetchJson('wallet-data/'+filename);
            if(payload.wallet!==wallet)throw Error('Wallet snapshot does not match the requested address.');
        }else {
            const bucket=await fetchJson('wallet-data/funding-'+wallet.slice(2,4)+'.json');
            payload={wallet,transactions:bucket[wallet]||[],coverage:{},cacheOnly:true};
        }
        if(request!==activityRequest)return;
        activityData={...payload,transactions:validateActivity(payload.transactions)};
        renderWalletCoverage();renderWallet();
        walletElement('walletRefresh').innerHTML=`<h2>Refresh or collect this wallet</h2><p>The site searches saved snapshots. To collect a new wallet or refresh its regular and internal history, open the workflow, choose <strong>Run workflow</strong>, and paste this address into <strong>Wallet address (optional)</strong>:</p><p class="wallet-address">${wallet}</p><p><a href="https://github.com/lyurgg/ymir-nft-character-search/actions/workflows/deploy.yml" target="_blank" rel="noopener noreferrer">Open refresh workflow ↗</a> · <a href="https://scan.wemix.com/address/${wallet}" target="_blank" rel="noopener noreferrer">Open WEMIX Scan ↗</a> · <a href="graph.html?root=${wallet}&amp;view=transfers">Explore ownership connections</a></p><p>Collection is bounded. Busy wallets may retain partial history; previously collected evidence is preserved. The nightly workflow also refreshes tracked wallets.</p>`;
    }catch(error){if(request===activityRequest)walletElement('walletStatus').textContent=error.message;}
    finally{if(request===activityRequest)walletElement('loadWallet').disabled=false;}
}
walletElement('walletForm').addEventListener('submit',loadWallet);
function walletPreset(highs) {
    walletElement('walletAfter').value=highs?'2026-10-30':'';
    walletElement('walletBefore').value=highs?new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}):'';
    walletElement('walletMinimum').value=highs?'1000':'0';
    walletElement('walletSort').value='amount';walletElement('walletDirection').value='all';walletElement('walletFailures').checked=false;
    activityPage=1;renderWallet();
}
walletElement('walletHighs').addEventListener('click',()=>walletPreset(true));
walletElement('walletAllDates').addEventListener('click',()=>walletPreset(false));
for(const id of ['walletDirection','walletSort','walletMinimum','walletAfter','walletBefore','walletFailures'])walletElement(id).addEventListener('change',()=>{
    activityPage=1;if(id==='walletSort'&&walletElement(id).value==='fee')activityTab='regular';renderWallet();
});
for(const [id,tab] of [['tabAll','all'],['tabRegular','regular'],['tabInternal','internal']])walletElement(id).addEventListener('click',()=>{
    activityTab=tab;activityPage=1;if(tab==='internal'&&walletElement('walletSort').value==='fee')walletElement('walletSort').value='amount';renderWallet();
});
walletElement('walletPagination').addEventListener('click',event=>{const button=event.target.closest('[data-page]');if(button){activityPage=Number(button.dataset.page);renderWallet();}});
const walletParams=new URLSearchParams(location.search);
if(['all','regular','internal'].includes(walletParams.get('tab')))activityTab=walletParams.get('tab');
walletElement('walletAddress').value=walletParams.get('wallet')||'0xbeaabc38996609c58c1de8d30acd368ef47d5b63';
if(activityWallet(walletElement('walletAddress').value)==='0xbeaabc38996609c58c1de8d30acd368ef47d5b63'&&!walletParams.has('min')&&!walletParams.has('after'))walletPreset(true);
for(const [key,id] of [['after','walletAfter'],['before','walletBefore'],['min','walletMinimum'],['sort','walletSort'],['direction','walletDirection']])if(walletParams.has(key))walletElement(id).value=walletParams.get(key);
loadWallet();
