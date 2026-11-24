function activityWallet(value) {
    const wallet=String(value||'').trim().toLowerCase();
    return /^0x[0-9a-f]{40}$/.test(wallet)?wallet:'';
}
function activityEscape(value) {
    return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function activityWei(value) {
    const text=String(value||'0').trim().replaceAll(',','');
    if(!/^\d+(?:\.\d{1,18})?$/.test(text))throw Error('Enter a positive WEMIX amount with at most 18 decimal places.');
    const [whole,fraction='']=text.split('.');
    return BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));
}
function activityAmount(value) {
    if(value===null||value===undefined)return '—';
    const amount=BigInt(value),whole=amount/(10n**18n),fraction=(amount%(10n**18n)).toString().padStart(18,'0').replace(/0+$/,'');
    return whole.toLocaleString('en-US')+(fraction?'.'+fraction:'');
}
function activityDirection(row,wallet) {
    return row.from===wallet&&row.to===wallet?'self':row.from===wallet?'sent':row.to===wallet?'received':'unrelated';
}
function validateActivity(rows) {
    if(!Array.isArray(rows))throw Error('Wallet snapshot is missing its transaction list.');
    const unique=new Map();
    for(const row of rows) {
        if(!['regular','internal'].includes(row.kind)||!/^0x[0-9a-f]{64}$/.test(row.tx_hash||'')
           ||!activityWallet(row.from)||row.to&&!activityWallet(row.to)||!/^\d+$/.test(row.amount_wei||'')
           ||!Number.isFinite(row.at)||!['success','failed','reported','unknown'].includes(row.status)
           ||row.fee_wei!==null&&row.fee_wei!==undefined&&!/^\d+$/.test(row.fee_wei))throw Error('Wallet snapshot has an invalid transaction record.');
        const id=row.kind+':'+row.tx_hash+':'+(row.trace_id||'');
        if(row.kind==='internal'&&(!row.trace_id||String(row.trace_id)==='0'))throw Error('Internal snapshot contains an invalid or duplicate root call.');
        unique.set(id,{...row,id});
    }
    return [...unique.values()];
}
function filterActivity(rows,wallet,{tab='all',direction='all',sort='amount',minimum='0',after='',before='',includeFailed=false}={}) {
    const threshold=activityWei(minimum);
    const start=after?Date.parse(after+'T00:00:00+08:00')/1000:-Infinity;
    const end=before?Date.parse(before+'T23:59:59.999+08:00')/1000:Infinity;
    if(Number.isNaN(start)||Number.isNaN(end)||start>end)throw Error('Choose a valid date range.');
    const selected=rows.filter(row=>{
        const way=activityDirection(row,wallet);
        return way!=='unrelated'&&(tab==='all'||row.kind===tab)&&(direction==='all'||way===direction)
            &&(includeFailed||row.status!=='failed')&&BigInt(row.amount_wei)>=threshold&&row.at>=start&&row.at<=end
            &&(sort!=='fee'||row.kind==='regular'&&row.from===wallet&&row.fee_wei!==null&&row.fee_wei!==undefined);
    });
    const key=row=>sort==='fee'?BigInt(row.fee_wei):sort==='newest'?BigInt(Math.floor(row.at)):BigInt(row.amount_wei);
    return selected.sort((a,b)=>key(a)>key(b)?-1:key(a)<key(b)?1:b.at-a.at||a.id.localeCompare(b.id));
}
function summarizeActivity(rows,wallet) {
    let sent=0n,received=0n,fees=0n,feeRecords=0;
    for(const row of rows) {
        if(row.kind==='regular'&&row.from===wallet&&row.fee_wei!==null&&row.fee_wei!==undefined){fees+=BigInt(row.fee_wei);feeRecords++;}
        if(row.status==='failed'||row.status==='unknown')continue;
        const way=activityDirection(row,wallet);
        if(way==='sent')sent+=BigInt(row.amount_wei);
        if(way==='received')received+=BigInt(row.amount_wei);
    }
    return {count:rows.length,sent:sent.toString(),received:received.toString(),fees:fees.toString(),feeRecords};
}
if(typeof module!=='undefined')module.exports={activityWallet,activityEscape,activityWei,activityAmount,activityDirection,validateActivity,filterActivity,summarizeActivity};
