(() => {
    'use strict';
    const el=id=>document.getElementById(id),params=new URLSearchParams(location.search);
    const stamp=at=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(at*1000));
    const day=at=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'2-digit'}).format(new Date(at*1000));
    const label=kind=>({bought:'Bought',sold:'Sold',self:'Bought & sold'}[kind]);
    let rows=[],page=0,controller=null,search=null,result=null,progress=null,finished=false;
    el('wiWallet').value=params.get('wallet')||'';
    for(const [id,key,allowed] of [['wiDirection','direction',['all','bought','sold']],['wiDays','days',['7','30','90','365']]])if(allowed.includes(params.get(key)))el(id).value=params.get(key);
    if(params.has('limit'))el('wiLimit').value=params.get('limit');
    function cell(tr,text,url,cls=''){
        const td=document.createElement('td');if(cls)td.className=cls;
        if(url){const a=document.createElement('a');a.textContent=text;a.href=url;a.target='_blank';a.rel='noopener noreferrer';td.append(a);}else td.textContent=text;
        tr.append(td);return td;
    }
    function render(){
        page=Math.max(0,Math.min(page,Math.ceil(rows.length/25)-1));el('wiRows').replaceChildren();
        for(const row of rows.slice(page*25,page*25+25)){
            const tr=document.createElement('tr');cell(tr,stamp(row.at));cell(tr,label(row.direction),null,'wi-'+row.direction);
            const td=document.createElement('td'),name=document.createElement('a'),code=document.createElement('span');
            name.href='items.html?q='+row.code;name.className='wi-item-name';name.textContent=row.name;code.className='wi-item-code';code.textContent='Code '+row.code;td.append(name,code);tr.append(td);
            cell(tr,ItemSales.amount(row.amount_wei));
            const other=row.direction==='sold'?row.buyer:row.seller;
            cell(tr,row.direction==='self'?'Same wallet':other.slice(0,10)+'…'+other.slice(-6),'https://scan.wemix.com/address/'+other);
            cell(tr,'View receipt','https://scan.wemix.com/tx/'+row.tx_hash+'/event-logs');el('wiRows').append(tr);
        }
        el('wiCount').textContent=rows.length.toLocaleString()+' matching trade'+(rows.length===1?'':'s')+(search&&!finished?' · search incomplete':'');
        el('wiEmpty').hidden=rows.length>0;el('wiPage').textContent=`Page ${page+1} of ${Math.max(1,Math.ceil(rows.length/25))}`;
        el('wiPrev').disabled=page===0;el('wiNext').disabled=(page+1)*25>=rows.length;el('wiDownload').disabled=rows.length===0;
    }
    function coverage(p){
        return `Checked marketplace events from ${stamp(p.oldestAt)} through ${stamp(p.latest)} PHT · ${p.checked.toLocaleString()} blocks. ${p.unknown.toLocaleString()} wallet trades skipped because their codes are not in the name database.`;
    }
    async function load(event){
        event?.preventDefault();if(controller)return;
        const wallet=WalletItems.address(el('wiWallet').value);
        if(!wallet){el('wiStatus').textContent='Enter a full WEMIX wallet address (0x followed by 40 hexadecimal characters).';return;}
        let limit;try{limit=WalletItems.resultLimit(el('wiLimit').value);}catch(error){el('wiStatus').textContent=error.message;return;}
        el('wiLimit').value=String(limit);
        search={wallet,direction:el('wiDirection').value,days:Number(el('wiDays').value),limit};
        const url=new URL(location.href);for(const [key,value] of Object.entries(search))url.searchParams.set(key,value);history.replaceState(null,'',url);
        el('wiWallet').value=wallet;el('wiScan').href='https://scan.wemix.com/address/'+wallet;el('wiActivity').href='wallet.html?wallet='+wallet+'&sort=newest';el('wiLinks').hidden=false;
        controller=new AbortController();rows=[];result=null;progress=null;finished=false;page=0;render();
        for(const id of ['wiWallet','wiDirection','wiDays','wiLimit','wiStart'])el(id).disabled=true;el('wiStop').disabled=false;
        el('wiStatus').textContent='Finding the newest marketplace blocks…';el('wiCoverage').textContent='Search in progress. Results are incomplete until the selected result limit or lookback boundary is reached.';
        el('wiCaption').textContent=wallet+' · newest mapped item trades';el('wiEmpty').textContent='Searching. Matches appear as recent blocks are checked.';el('wiProgress').value=0;
        try{
            result=await WalletItems.scan({...search,names:walletItemNames,signal:controller.signal,onMatch:row=>rows.push(row),onProgress:p=>{
                if(p.phase==='logs'){progress=p;el('wiProgress').max=Math.max(1,p.total);el('wiProgress').value=p.checked;
                    el('wiStatus').textContent=`Searching back to ${day(p.oldestAt)} · ${p.found} matching trades found`;el('wiCoverage').textContent=coverage(p);render();}
            }});
            finished=true;
            el('wiStatus').textContent=result.hitLimit?`Found the newest ${rows.length} matching trades.`:`Search finished · ${rows.length} matching trades in the last ${search.days} days.`;
            el('wiCoverage').textContent=coverage(result)+(result.hitLimit?' Stopped at your result limit; older trades are not shown.':' The selected lookback was checked in full.');
            el('wiProgress').max=1;el('wiProgress').value=1;
            el('wiEmpty').textContent=`No mapped purchases or sales found in the last ${search.days} days for this selection. Try a longer lookback or Bought & sold.`;
        }catch(error){
            el('wiStatus').textContent=controller.signal.aborted?'Stopped · results are incomplete.':'Search incomplete · '+error.message;
            el('wiCoverage').textContent=(progress?coverage(progress)+' ':'')+'The search did not finish. Older or unchecked trades may be missing; retry or choose a shorter range.';
            el('wiEmpty').textContent='No mapped trades were found before the search stopped. This is not a completed empty result.';
        }finally{
            render();controller=null;for(const id of ['wiWallet','wiDirection','wiDays','wiLimit','wiStart'])el(id).disabled=false;el('wiStop').disabled=true;
        }
    }
    el('wiForm').addEventListener('submit',load);el('wiStop').addEventListener('click',()=>controller?.abort());
    el('wiPrev').addEventListener('click',()=>{page--;render();});el('wiNext').addEventListener('click',()=>{page++;render();});
    el('wiDownload').addEventListener('click',()=>{
        if(!search||!rows.length)return;
        const quote=value=>{let text=String(value);if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
        const header=['wallet','action','item_code','english_name','trade_date_pht','gross_wemix','buyer','seller','transaction_hash','log_index','lookback_days','requested_limit','search_finished','result_limited'];
        const data=rows.map(r=>[search.wallet,r.direction,r.code,r.name,stamp(r.at),ItemSales.amount(r.amount_wei).replace(/,/g,''),r.buyer,r.seller,r.tx_hash,r.log_index,search.days,search.limit,finished,Boolean(result?.hitLimit)]);
        const blob=new Blob(['\ufeff'+[header,...data].map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download='ymir-wallet-items-'+search.wallet+(finished?'':'-incomplete')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    if(WalletItems.address(params.get('wallet')))load();
})();
