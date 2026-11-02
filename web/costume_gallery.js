import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import "./i18n.mjs";

app.registerExtension({
  name: "comfyui-costume-gallery.browser",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "CostumeGallery") return;
    const originalCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      originalCreated?.apply(this, arguments);
      const node=this, I=window.CostumeI18n;
      const widget=node.widgets.find(value=>value.name==='costume_id');
      const langWidget=node.widgets.find(value=>value.name==='language');
      let language=I.preferred(),dialog=null,frame=null,requestId=0,headerTitle=null,done=null;
      if(langWidget)langWidget.value=language;
      const t=(source,values)=>I.translate(source,language,values);
      const box=document.createElement('div');
      box.style.cssText='position:relative;width:100%;height:100%;background:#f7f5f0;border-radius:8px;overflow:hidden;';
      const image=document.createElement('img');image.style.cssText='display:block;width:100%;height:100%;object-fit:contain;';
      const error=document.createElement('div');error.setAttribute('role','status');
      error.style.cssText='display:none;position:absolute;inset:15px;place-items:center;color:#9a493c;font:13px/1.7 sans-serif;overflow-wrap:anywhere;';
      box.append(image,error);
      const errorText=()=>t('服装原图加载失败：{path}。请检查完整素材库，重启 ComfyUI 并刷新页面。',{path:`library/png/${widget.value}.png`});
      const update=()=>{
        const current=++requestId;image.style.display='block';error.style.display='none';
        image.onload=()=>{if(current===requestId){image.style.display='block';error.style.display='none';}};
        image.onerror=()=>{if(current===requestId){image.style.display='none';error.textContent=errorText();error.style.display='grid';}};
        image.src=api.apiURL(`/costume_gallery/assets/png/${encodeURIComponent(String(widget.value))}.png`);image.title=widget.value;
      };
      const close=()=>{window.removeEventListener('message',receive);dialog?.remove();dialog=null;frame=null;headerTitle=null;done=null;};
      const setLanguage=(value,notify=true)=>{
        language=I.normalize(value);I.persist(language);if(langWidget)langWidget.value=language;
        image.alt=t('所选服装预览');browse.textContent=t('浏览服装图库 · 搜索 / 分类 / 关键词');
        toggle.textContent=language==='en'?'中文':'English';toggle.setAttribute('aria-label',language==='en'?'切换到中文':'Switch to English');
        widget.label=t('服装编号');if(langWidget)langWidget.label=t('界面与输出语言');
        const outputLabels=['图像','宽度','高度','服装编号','描述','英文关键词','服装名称'];
        node.outputs?.forEach((output,i)=>{output.label=t(outputLabels[i]||output.name);});
        if(['Costume Gallery 服装图库','Costume Gallery','CostumeGallery'].includes(node.title))node.title=language==='en'?'Costume Gallery':'Costume Gallery 服装图库';
        if(headerTitle)headerTitle.textContent=t('Costume Gallery · 搜索并选择服装后，点击「使用此服装」');
        if(done)done.textContent=t('关闭');if(frame)frame.title=t('服装参考图库');
        if(error.style.display==='grid')error.textContent=errorText();
        if(notify&&frame)frame.contentWindow.postMessage({type:'costume-gallery-language',language},location.origin);
        node.setDirtyCanvas(true,true);
      };
      const receive=event=>{
        if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
        if(event.data?.type==='costume-gallery-ready'){
          frame.contentWindow.postMessage({type:'costume-gallery-current',id:widget.value},location.origin);
          frame.contentWindow.postMessage({type:'costume-gallery-language',language},location.origin);
        }
        if(event.data?.type==='costume-gallery-language'&&['zh','en'].includes(event.data.language)){
          setLanguage(event.data.language,false);app.graph.change();return;
        }
        if(event.data?.type!=='costume-gallery-select'||typeof event.data.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(event.data.id))return;
        widget.value=event.data.id;widget.callback?.(widget.value);node.setDirtyCanvas(true,true);app.graph.change();close();
      };
      const callback=widget.callback;widget.callback=function(){callback?.apply(this,arguments);update();};
      if(langWidget){const original=langWidget.callback;langWidget.callback=function(value){original?.apply(this,arguments);setLanguage(value);app.graph.change();};}
      const browse=document.createElement('button');browse.type='button';
      browse.style.cssText='flex:1;min-width:0;height:36px;border:1px solid #b6c1aa;background:#e9ecdf;color:#343c2d;border-radius:6px;cursor:pointer;font:12px sans-serif;';
      const toggle=document.createElement('button');toggle.type='button';
      toggle.style.cssText='width:65px;flex-shrink:0;height:36px;border:1px solid #b6c1aa;background:#fff;color:#343c2d;border-radius:6px;cursor:pointer;font:12px sans-serif;';
      toggle.onclick=()=>{setLanguage(language==='en'?'zh':'en');app.graph.change();};
      browse.addEventListener('click',()=>{
        if(dialog)return;dialog=document.createElement('dialog');
        dialog.style.cssText='width:96vw;height:94vh;max-width:1800px;max-height:96vh;padding:0;border:1px solid #c6c9bb;border-radius:12px;background:#f7f5f0;';
        const header=document.createElement('div');header.style.cssText='height:46px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 18px;color:#343c2d;background:#e9ecdf;font:13px sans-serif;';
        headerTitle=document.createElement('strong');done=document.createElement('button');done.onclick=close;
        done.style.cssText='padding:5px 13px;border:1px solid #bdc5ae;background:#fff;color:#343c2d;border-radius:5px;cursor:pointer;';header.append(headerTitle,done);
        frame=document.createElement('iframe');frame.src=api.apiURL('/costume_gallery/gallery')+'?lang='+language;
        frame.style.cssText='width:100%;height:calc(100% - 46px);border:0;';dialog.append(header,frame);window.addEventListener('message',receive);
        dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
        dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
        document.body.append(dialog);setLanguage(language,false);dialog.showModal();
      });
      const toolbar=document.createElement('div');toolbar.style.cssText='width:100%;height:42px;display:flex;align-items:center;gap:6px;';toolbar.append(browse,toggle);
      node.addDOMWidget('costume_browser','button',toolbar,{serialize:false,hideOnZoom:false,getMinHeight:()=>42,getMaxHeight:()=>42});
      node.addDOMWidget('costume_preview','image',box,{serialize:false,hideOnZoom:false,getMinHeight:()=>300,getMaxHeight:()=>500});
      const configured=node.onConfigure;node.onConfigure=function(config){configured?.apply(this,arguments);if(node.outputs?.length===6&&!node.outputs.some(output=>output.name==='costume'))node.addOutput('costume','STRING');if(langWidget){const saved=config?.widgets_values?.[1];setLanguage(['zh','en'].includes(saved)?saved:'zh');}update();};
      const removed=node.onRemoved;node.onRemoved=function(){close();removed?.apply(this,arguments);};
      node.setSize([420,565]);setLanguage(language,false);update();
    };
  },
});
