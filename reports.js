(() => {
    const form=document.getElementById('reportFilters');
    const body=document.getElementById('reportPurchases');
    const rows=Array.from(body.querySelectorAll('tr'));
    const count=document.getElementById('reportFilterCount');
    function update() {
        const minimum=Number(document.getElementById('reportMinimum').value);
        const recipient=document.getElementById('reportRecipient').value;
        const sort=document.getElementById('reportSort').value;
        rows.sort((a,b)=>sort==='amount'?Number(b.dataset.amount)-Number(a.dataset.amount):Number(b.dataset.at)-Number(a.dataset.at));
        let visible=0,total=0;
        for(const row of rows) {
            const amount=Number(row.dataset.amount);
            row.hidden=!(amount>=minimum&&(!recipient||row.dataset.recipient===recipient));
            if(!row.hidden){visible++;total+=amount;}
            body.appendChild(row);
        }
        count.textContent=`${visible} of ${rows.length} purchases · ${total.toLocaleString('en-US')} WEMIX shown`;
        document.getElementById('reportNoResults').hidden=visible>0;
    }
    form.addEventListener('input',update);
    form.addEventListener('change',update);
    form.addEventListener('submit',event=>event.preventDefault());
    form.addEventListener('reset',()=>{for(const input of form.elements)if(input.tagName==='SELECT')input.value=input.options[0].value;update();});
    update();
})();
