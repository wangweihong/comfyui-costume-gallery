/* The galleries keep their own filters and rendering; editing operates on those cards. */
(function () {
  'use strict';
  function mount(config) {
    let language = config.language, editing = false, available = false;
    const selected = new Set();
    const word = (zh, en) => language === 'en' ? en : zh;
    const create = (tag, className) => {const node=document.createElement(tag);if(className)node.className=className;return node;};
    const edit=create('button','asset-edit-toggle');edit.type='button';edit.id='gallery-edit-toggle';edit.hidden=true;config.toolbar.append(edit);
    const bar=create('div','gallery-edit-toolbar');bar.hidden=true;bar.id='gallery-edit-toolbar';
    const count=create('span'),all=create('button'),clear=create('button'),remove=create('button','edit-delete');
    [all,clear,remove].forEach(node=>node.type='button');remove.id='gallery-delete-selected';bar.append(count,all,clear,remove);const area=create('div','asset-edit-area');config.grid.before(area);area.append(bar);
    const actions=create('div','viewer-asset-actions'),deleteCurrent=create('button','asset-delete'),replaceCurrent=create('button');actions.hidden=true;
    deleteCurrent.type=replaceCurrent.type='button';deleteCurrent.id='delete-current-asset';replaceCurrent.id='replace-current-asset';actions.append(deleteCurrent,replaceCurrent);config.openLink.after(actions);
    const manager=window.AssetLibraryManager.mount({language,toolbar:config.toolbar,feedback:area,translate:config.translate,
      async onChanged(value){await config.reload(value);paint();}
    });
    function paint(){
      const records=config.records(),byId=new Map(records.map(row=>[row.id,row]));
      for(const id of [...selected])if(!byId.has(id))selected.delete(id);
      edit.hidden=!available;edit.textContent=editing?word('完成','Done'):word('编辑','Edit');edit.setAttribute('aria-pressed',String(editing));
      bar.hidden=!editing;count.textContent=word(`已选 ${selected.size} 张素材`,`${selected.size} assets selected`);
      all.textContent=word('全选当前结果','Select filtered assets');clear.textContent=word('取消选择','Clear selection');remove.textContent=word('删除选中素材','Delete selected assets');remove.disabled=!selected.size;
      for(const card of config.grid.querySelectorAll(config.cardSelector)){
        const row=byId.get(card.dataset.id);card.classList.toggle('asset-edit-card',editing&&row?.origin==='builtin');card.classList.toggle('is-selected',editing&&selected.has(row?.id));
        let label=card.querySelector('.asset-selection');
        if(!editing||row?.origin!=='builtin'){label?.remove();continue;}
        if(!label){label=create('label','asset-selection');const input=create('input'),caption=create('span');input.type='checkbox';input.dataset.selectAsset=row.id;label.append(input,caption);card.append(label);}
        label.querySelector('input').checked=selected.has(row.id);label.querySelector('span').textContent=word('选择','Select');
      }
      const row=config.current();actions.hidden=!available||!row||row.origin!=='builtin';deleteCurrent.textContent=word('删除','Delete');replaceCurrent.textContent=word('替换','Replace');
    }
    function toggle(id){if(selected.has(id))selected.delete(id);else selected.add(id);queueMicrotask(paint);}
    config.grid.addEventListener('click',event=>{
      if(!editing)return;const card=event.target.closest(config.cardSelector);if(!card)return;
      if(event.target.closest('.asset-selection')){event.stopImmediatePropagation();return;}
      event.preventDefault();event.stopImmediatePropagation();
      const row=config.records().find(row=>row.id===card.dataset.id);if(row?.origin==='builtin')toggle(row.id);
    },true);
    config.grid.addEventListener('change',event=>{
      const input=event.target.closest('[data-select-asset]');if(!input)return;
      if(input.checked)selected.add(input.dataset.selectAsset);else selected.delete(input.dataset.selectAsset);paint();
    },true);
    edit.onclick=()=>{editing=!editing;selected.clear();paint();};
    all.onclick=()=>{config.visible().filter(row=>row.origin==='builtin').forEach(row=>selected.add(row.id));paint();};
    clear.onclick=()=>{selected.clear();paint();};
    remove.onclick=()=>manager.deleteAssets(config.records().filter(row=>selected.has(row.id)));
    deleteCurrent.onclick=()=>manager.deleteAssets([config.current()]);replaceCurrent.onclick=()=>manager.replaceAsset(config.current());
    fetch(new URL('manage/summary',location.href),{cache:'no-store'}).then(response=>{
      available=response.ok;manager.setAvailable(available);paint();
    }).catch(()=>{available=false;manager.setAvailable(false);paint();});
    document.addEventListener('keydown',event=>{
      if(document.querySelector('.pose-action-dialog[open]')&&['ArrowLeft','ArrowRight'].includes(event.key))event.stopImmediatePropagation();
    },true);
    paint();
    return {paint,setLanguage(value){language=value;manager.setLanguage(value);paint();},get available(){return available;}};
  }
  window.GalleryAssetEditor={mount};
})();
