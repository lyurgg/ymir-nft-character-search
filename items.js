(() => {
    const query=document.getElementById('itemQuery'),sort=document.getElementById('itemSort'),body=document.getElementById('itemRows');
    const normalize=value=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const rows=JSON.parse(document.getElementById('itemData').textContent).map(([code,name])=>({code,name,search:normalize(code+' '+name)}));
    const params=new URLSearchParams(location.search);let page=0,lastSort='name';
    query.value=params.get('q')||'';if(params.get('sort')==='code')sort.value='code';
    function render() {
        const terms=normalize(query.value.trim()).split(/\s+/).filter(Boolean);
        if(sort.value!==lastSort){rows.sort((a,b)=>sort.value==='code'?(BigInt(a.code)<BigInt(b.code)?-1:BigInt(a.code)>BigInt(b.code)?1:0):a.name.localeCompare(b.name,'en',{sensitivity:'base'})||Number(a.code)-Number(b.code));lastSort=sort.value;}
        const found=rows.filter(row=>terms.every(term=>row.search.includes(term))),pages=Math.max(1,Math.ceil(found.length/50));page=Math.max(0,Math.min(page,pages-1));
        body.replaceChildren();
        for(const row of found.slice(page*50,page*50+50)){
            const tr=document.createElement('tr');tr.dataset.code=row.code;tr.dataset.name=row.name;
            const codeCell=document.createElement('td'),nameCell=document.createElement('td'),saleCell=document.createElement('td');
            const link=document.createElement('a');link.className='item-code';link.href='items.html?q='+row.code;link.textContent=row.code;link.setAttribute('aria-label','Link to item '+row.code);codeCell.append(link);
            const strong=document.createElement('strong');strong.textContent=row.name;nameCell.append(strong);
            const sales=document.createElement('a');sales.href='item-sales.html?code='+row.code;sales.textContent='Find purchases →';saleCell.append(sales);
            tr.append(codeCell,nameCell,saleCell);body.append(tr);
        }
        document.getElementById('itemResultCount').textContent=terms.length?`${found.length.toLocaleString()} of ${rows.length.toLocaleString()} items`:`${rows.length.toLocaleString()} verified items`;
        document.getElementById('itemEmpty').hidden=found.length>0;
        document.getElementById('itemPage').textContent=`Page ${page+1} of ${pages}`;
        document.getElementById('itemPrev').disabled=page===0;document.getElementById('itemNext').disabled=page+1>=pages;
        const url=new URL(location.href);
        if(query.value.trim())url.searchParams.set('q',query.value.trim());else url.searchParams.delete('q');
        if(sort.value==='code')url.searchParams.set('sort','code');else url.searchParams.delete('sort');history.replaceState(null,'',url);
    }
    document.getElementById('itemSearchForm').addEventListener('submit',event=>{event.preventDefault();page=0;render();});
    query.addEventListener('input',()=>{page=0;render();});sort.addEventListener('change',()=>{page=0;render();});
    document.getElementById('itemClear').addEventListener('click',()=>{query.value='';page=0;render();query.focus();});
    document.getElementById('itemPrev').addEventListener('click',()=>{page--;render();});document.getElementById('itemNext').addEventListener('click',()=>{page++;render();});render();
})();
