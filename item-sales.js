(() => {
    'use strict';
    const el=id=>document.getElementById(id),params=new URLSearchParams(location.search);
    const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
    const week=new Date(Date.now()+8*3600000-6*86400000).toISOString().slice(0,10);
    el('salesCode').value=params.get('code')||'';el('salesAfter').value=params.get('after')||week;el('salesBefore').value=params.get('before')||today;
    let rows=[],page=0,controller=null,complete=false,search=null;
    const stamp=seconds=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(seconds*1000));
    const name=()=>{el('salesItemName').textContent=itemSaleNames[el('salesCode').value.trim()]||'English name not in this dictionary yet; you can still search the code.';};
    function cell(row,text,url) {
        const td=document.createElement('td');
        if(url){const a=document.createElement('a');a.href=url;a.textContent=text;a.target='_blank';a.rel='noopener noreferrer';td.append(a);}else td.textContent=text;
        row.append(td);
    }
    function render() {
        rows.sort((a,b)=>b.at-a.at||b.log_index-a.log_index);
        page=Math.max(0,Math.min(page,Math.ceil(rows.length/50)-1));
        const body=el('salesRows');body.replaceChildren();
        for(const sale of rows.slice(page*50,page*50+50)){
            const tr=document.createElement('tr');cell(tr,stamp(sale.at));cell(tr,ItemSales.amount(sale.amount_wei));
            for(const wallet of [sale.buyer,sale.seller])cell(tr,wallet.slice(0,10)+'…'+wallet.slice(-6),'https://scan.wemix.com/address/'+wallet);
            cell(tr,'View receipt','https://scan.wemix.com/tx/'+sale.tx_hash+'/event-logs');body.append(tr);
        }
        el('salesCount').textContent=rows.length.toLocaleString()+' purchase'+(rows.length===1?'':'s')+(complete?' · complete':' · incomplete');
        el('salesEmpty').hidden=rows.length>0;el('salesPage').textContent=`Page ${page+1} of ${Math.max(1,Math.ceil(rows.length/50))}`;
        el('salesPrev').disabled=page===0;el('salesNext').disabled=(page+1)*50>=rows.length;el('salesDownload').disabled=rows.length===0;
    }
    el('salesCode').addEventListener('input',name);name();
    el('salesPrev').addEventListener('click',()=>{page--;render();});el('salesNext').addEventListener('click',()=>{page++;render();});
    el('salesStop').addEventListener('click',()=>controller?.abort());
    el('salesForm').addEventListener('submit',async event=>{
        event.preventDefault();if(controller)return;
        const code=el('salesCode').value.trim(),after=el('salesAfter').value,before=el('salesBefore').value;
        let range;try{range=ItemSales.dates(after,before);if(range.start>Date.now()/1000)throw Error('The start date is in the future.');}catch(error){el('salesStatus').textContent=error.message;return;}
        controller=new AbortController();rows=[];page=0;complete=false;search={code,after,before};render();
        el('salesStart').disabled=true;el('salesStop').disabled=false;
        for(const id of ['salesCode','salesAfter','salesBefore'])el(id).disabled=true;
        const url=new URL(location.href);for(const [k,v] of Object.entries(search))url.searchParams.set(k,v);history.replaceState(null,'',url);
        el('salesCaption').textContent=`${itemSaleNames[code]||'Item'} · ${code} · ${after} through ${before} PHT`;
        el('salesStatus').textContent='Finding the blocks for your date range…';el('salesProgress').value=0;el('salesEmpty').textContent='Scanning. Matches appear as they are found.';
        el('salesCoverage').textContent='Scan in progress. Results cover only the batches checked so far and remain incomplete until every batch finishes.';
        let paint=0;
        try{
            const result=await ItemSales.scan({code,...range,signal:controller.signal,
                onMatch:row=>{rows.push(row);},onProgress:p=>{
                    if(p.phase==='logs'){
                        el('salesProgress').max=Math.max(1,p.total);el('salesProgress').value=p.done;
                        el('salesStatus').textContent=`Scanning marketplace · ${p.done.toLocaleString()} of ${p.total.toLocaleString()} blocks · ${p.found} matches so far`;
                        if(Date.now()-paint>250){render();paint=Date.now();}
                    }
                }});
            complete=true;el('salesStatus').textContent=`Complete · ${result.blocks.toLocaleString()} blocks checked · ${rows.length} matching purchases.`;
            el('salesCoverage').textContent=`Checked through block ${result.head.toLocaleString()} (${stamp(result.latest)} PHT). Future dates include only blocks that exist now. Coverage: this marketplace contract’s completed item-purchase events.`;
            el('salesProgress').max=1;el('salesProgress').value=1;el('salesEmpty').textContent='No purchases of this exact code were found in the selected dates.';
        }catch(error){
            el('salesStatus').textContent=controller.signal.aborted?'Stopped · results are incomplete.':`Scan incomplete · ${error.message}. Try again or choose a shorter range.`;
            el('salesCoverage').textContent='Coverage is incomplete. Results include only matching receipts found in the batches checked before the scan stopped or failed.';
            el('salesEmpty').textContent='The scan did not finish. No matching purchases have been found in the blocks checked so far.';
        }finally{
            render();controller=null;el('salesStart').disabled=false;el('salesStop').disabled=true;
            for(const id of ['salesCode','salesAfter','salesBefore'])el(id).disabled=false;
        }
    });
    el('salesDownload').addEventListener('click',()=>{
        if(!search)return;
        const fields=['item_code','english_name','at_pht','gross_wemix','buyer','seller','tx_hash','log_index','after_pht','through_pht','scan_complete'];
        const quote=v=>{const text=String(v),literal=/^[=+\-@\t\r]/.test(text)?"'"+text:text;return '"'+literal.replace(/"/g,'""')+'"';};
        const csv=[fields,...rows.map(r=>[r.code,itemSaleNames[r.code]||'',stamp(r.at),ItemSales.amount(r.amount_wei).replace(/,/g,''),r.buyer,r.seller,r.tx_hash,r.log_index,search.after,search.before,complete])].map(r=>r.map(quote).join(',')).join('\r\n');
        const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download=`ymir-item-${search.code}-${search.after}-${search.before}${complete?'':'-incomplete'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
})();
