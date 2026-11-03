import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import "./i18n.mjs";
import "./random_i18n.mjs?v=dice-labels-20261104-2";

// Preview-name restoration must not depend on the version of the shared UI module.
// Start inside a promise so failures cannot escape onConfigure and abort graph loading.
let previewCatalogPromise;
function loadPreviewCatalog() {
  if (!previewCatalogPromise) {
    previewCatalogPromise = Promise.resolve()
      .then(() => fetch(api.apiURL('/costume_gallery/catalog')))
      .then(response => {
        if (!response.ok) throw new Error('Cannot load preview names');
        return response.json();
      })
      .then(rows => {
        if (!Array.isArray(rows)) throw new Error('Invalid preview catalog');
        return rows;
      })
      .catch(error => { previewCatalogPromise = null; throw error; });
  }
  return previewCatalogPromise;
}

app.registerExtension({
  name:'comfyui-costume-gallery.random-preview',
  async beforeRegisterNodeDef(nodeType,nodeData){
    if(nodeData.name!=='RandomCostumeGallery')return;
    const created=nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated=function(){
      created?.apply(this,arguments);
      const node=this,I=window.RandomCostumeI18n;
      const langWidget=node.widgets.find(w=>w.name==='language');
      const originWidget=node.widgets.find(w=>w.name==='origin');
      const costumeWidget=node.widgets.find(w=>w.name==='costume_id');
      const lockWidget=node.widgets.find(w=>w.name==='locked');
      let language=I.preferred(),lastId='',lastName='',lastNames={},imageFailed=false,removed=false,imageVersion=0;
      let drawing=false,drawVersion=0,drawError='';
      node.properties??={};
      if(langWidget)langWidget.value=language;
      const t=source=>I.translate(source,language);
      const selectors = ["origin"].map(name => {
        const widget=node.widgets.find(w=>w.name===name);
        return widget ? {widget} : null;
      }).filter(Boolean);
      const box=document.createElement('div');box.style.cssText='display:flex;flex-direction:column;gap:8px;width:100%;height:100%;background:#f7f5f0;color:#343c2d;border-radius:8px;padding:10px;box-sizing:border-box;';
      const image=document.createElement('img');image.alt=t('本次随机服装预览');image.style.cssText='display:none;width:100%;flex:1;min-height:0;object-fit:contain;';
      const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='font:12px/1.6 sans-serif;overflow-wrap:anywhere;margin:0;';
      const id=document.createElement('code');id.style.cssText='font:11px/1.5 monospace;overflow-wrap:anywhere;';
      box.append(image,status,id);
      const toggle=document.createElement('button');toggle.type='button';toggle.style.cssText='width:100%;height:36px;border:1px solid #b6c1aa;background:#e9ecdf;color:#343c2d;border-radius:6px;cursor:pointer;font:12px sans-serif;';
      const dice=document.createElement('button');dice.type='button';dice.style.cssText=toggle.style.cssText;
      const isLocked=()=>lockWidget?.value===true;
      function render(){
        status.textContent=drawError|| (drawing?t('正在抽取服装…'):imageFailed?t('随机服装预览加载失败，请检查素材原图。'):lastId?(lastNames[language]||t(lastName)):t('点击骰子预览，或运行工作流自动抽取服装'));
        status.style.display=status.textContent?'block':'none';
        id.textContent=lastId;
        dice.textContent=t(isLocked()?'🔒 已锁定':'🎲 随机');
        dice.disabled=isLocked()||drawing;
        dice.title=t('仅更新此节点预览，不运行工作流');
        dice.setAttribute('aria-label',t('随机服装'));
        image.alt=t('本次随机服装预览');
        toggle.textContent=language==='en'?'中文':'English';
        toggle.setAttribute('aria-label',language==='en'?'切换到中文':'Switch to English');
        if(langWidget)langWidget.label=t('界面与输出语言');
        if(originWidget)originWidget.label=t('随机来源');
        if(costumeWidget)costumeWidget.label=t('当前服装编号');
        if(lockWidget)lockWidget.label=t('🔒 锁定随机');
        const tooltips={
          origin:'all：全部；builtin：内置；user：自定义。',
          language:'控制界面与文本输出语言，随工作流保存。',
          costume_id:'当前选择的服装，锁定后运行工作流使用此图。',
          locked:'保持当前服装并禁用骰子。',
        };
        node.widgets.forEach(widget=>{if(tooltips[widget.name])widget.tooltip=t(tooltips[widget.name]);});
        const labels=["图像", "宽度", "高度", "服装编号", "描述", "英文关键词", "服装名称"];
        node.outputs?.forEach((output,i)=>{output.label=t(labels[i]||output.name);});
        if(['RandomCostumeGallery','Random Costume Gallery','Random Costume Gallery 随机服装图库'].includes(node.title))node.title=language==='en'?'Random Costume Gallery':'Random Costume Gallery 随机服装图库';
        node.setDirtyCanvas(true,true);
      }
      function setLanguage(value){language=I.normalize(value);I.persist(language);if(langWidget)langWidget.value=language;render();}
      function showResult(value,name='',names={}){
        if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value))return false;
        lastId=value;lastName=typeof name==='string'?name:'';lastNames=names;imageFailed=false;
        if(costumeWidget)costumeWidget.value=lastId;
        node.properties.last_costume_id=lastId;node.properties.last_costume_name=lastName;node.properties.last_costume_names=lastNames;
        const token=++imageVersion;
        image.onload=()=>{if(!removed&&token===imageVersion){image.style.display='block';imageFailed=false;render();}};
        image.onerror=()=>{if(!removed&&token===imageVersion){image.style.display='none';imageFailed=true;render();}};
        image.src=api.apiURL(`/costume_gallery/assets/png/${encodeURIComponent(lastId)}.png`);image.title=lastId;render();
        // Older saved workflows contain only the Chinese preview name.
        if(!lastNames.en && typeof fetch === 'function') {
          const requestedId = lastId;
          loadPreviewCatalog().then(rows => {
            if(removed || requestedId !== lastId) return;
            const row = rows.find(item => item.id === requestedId);
            if(row) {
              lastNames = {zh:row.name_zh || row.title, en:row.name_en};
              node.properties.last_costume_names = lastNames;
              render();
            }
          }).catch(() => {});
        }
        return true;
      }
      function cancelDraw(){drawVersion++;drawing=false;drawError='';}
      dice.onclick=async()=>{
        if(removed||isLocked()||drawing)return;
        const version=++drawVersion;
        drawing=true;drawError='';render();
        const params=new URLSearchParams({language,exclude_id:lastId});
        for(const name of ["origin"]){
          const widget=node.widgets.find(w=>w.name===name);
          params.set(name,widget?.serializeValue?widget.serializeValue():widget?.value??'all');
        }
        try{
          const response=await fetch(api.apiURL(`/costume_gallery/random?${params}`));
          const result=await response.json();
          if(removed||version!==drawVersion||isLocked())return;
          if(!response.ok)throw new Error(result.error||t('随机失败，请重试'));
          if(!showResult(result.costume_id,result.name,{zh:result.name_zh,en:result.name_en}))throw new Error(t('随机失败，请重试'));
          app.graph.change();
        }catch(error){
          if(!removed&&version===drawVersion&&!isLocked())drawError=t('随机失败，请重试')+' · '+error.message;
        }finally{
          if(!removed&&version===drawVersion){drawing=false;render();}
        }
      };
      if(lockWidget){const previous=lockWidget.callback;lockWidget.callback=function(value){
        previous?.apply(this,arguments);cancelDraw();
        lockWidget.value=value===true;
        if(isLocked()&&!lastId){lockWidget.value=false;drawError=t('请先点击骰子选择服装，再锁定');}
        render();app.graph.change();
      };}
      if(costumeWidget){const previous=costumeWidget.callback;costumeWidget.callback=function(value){
        previous?.apply(this,arguments);cancelDraw();
        if(!showResult(value)){costumeWidget.value=lastId;drawError=t('无效的服装编号');}
        render();app.graph.change();
      };}
      selectors.forEach(({widget})=>{const previous=widget.callback;widget.callback=function(){
        previous?.apply(this,arguments);cancelDraw();render();
      };});
      toggle.onclick=()=>{setLanguage(language==='en'?'zh':'en');app.graph.change();};
      if(langWidget){const previous=langWidget.callback;langWidget.callback=function(value){previous?.apply(this,arguments);setLanguage(value);app.graph.change();};}
      node.addDOMWidget('random_language','button',toggle,{serialize:false,hideOnZoom:false,getMinHeight:()=>40,getMaxHeight:()=>40});
      // Keep the existing language widget in place for saved workflows.
      const diceToolbar=document.createElement('div');diceToolbar.style.cssText='width:100%;';diceToolbar.append(dice);
      node.addDOMWidget('random_dice','button',diceToolbar,{serialize:false,hideOnZoom:false,getMinHeight:()=>40,getMaxHeight:()=>40});
      node.addDOMWidget('random_costume_preview','image',box,{serialize:false,hideOnZoom:false,getMinHeight:()=>310,getMaxHeight:()=>500});
      const executed=node.onExecuted;node.onExecuted=function(message){
        executed?.apply(this,arguments);if(removed)return;
        // A result queued before the user locked a newer choice must not replace it.
        if(isLocked()&&message?.costume_id?.[0]!==costumeWidget?.value)return;
        cancelDraw();
        if(showResult(message?.costume_id?.[0],message?.name?.[0],{zh:message?.name_zh?.[0],en:message?.name_en?.[0]}))app.graph.change();
      };
      const configured=node.onConfigure;node.onConfigure=function(config){
        configured?.apply(this,arguments);
        cancelDraw();
        // Older workflows saved empty placeholders for DOM-only widgets.
        if(lockWidget)lockWidget.value=isLocked();
        if(node.outputs?.length===6&&!node.outputs.some(output=>output.name==='costume'))node.addOutput('costume','STRING');
        setLanguage(config?.widgets_values?.[1]);
        const savedId=costumeWidget?.value||node.properties.last_costume_id;
        if(savedId)showResult(savedId,node.properties.last_costume_name,node.properties.last_costume_names);
        render();
      };
      const originalRemoved=node.onRemoved;node.onRemoved=function(){removed=true;imageVersion++;cancelDraw();originalRemoved?.apply(this,arguments);};
      node.setSize([420,665]);render();
    };
  },
});
