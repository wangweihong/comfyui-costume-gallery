const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),uid='u-'+'a'.repeat(32);
async function setup({fetchImpl,legacyI18n=false}={}){
  let extension,changes=0;
  class Element{constructor(){this.style={};this.children=[];this.attributes={};}append(...children){this.children.push(...children);}setAttribute(k,v){this.attributes[k]=v;}}
  const origin={name:'origin',value:'all'},language={name:'language',value:'zh'},selection={name:'costume_id',value:''},lock={name:'locked',value:false},section={name:'section',value:'all'};
  class Node{constructor(){this.widgets=[origin,language,selection,lock];this.dom={};this.properties={};this.outputs=Array.from({length:7},()=>({}));this.title='RandomCostumeGallery';}addDOMWidget(name,type,el){this.dom[name]=el;}setSize(){}setDirtyCanvas(){}addOutput(name,type){this.outputs.push({name,type});}}
  const context=vm.createContext({...fetchImpl?{fetch:fetchImpl}:{},window:{},URLSearchParams,localStorage:{getItem:()=>null,setItem(){}},document:{createElement:()=>new Element()},api:{apiURL:p=>'/api'+p},app:{registerExtension:e=>{extension=e;},graph:{change(){changes++;}},queuePrompt(){throw Error('Must never enqueue a task');}}});
  vm.runInContext(fs.readFileSync(path.join(root,'web/i18n.mjs'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'web/random_i18n.mjs'),'utf8'),context);
  if(legacyI18n){delete context.window.CostumeI18n.loadCatalog;delete context.window.RandomCostumeI18n.loadCatalog;}
  vm.runInContext(fs.readFileSync(path.join(root,'web/random_costume_gallery.js'),'utf8').replace(/^import .*;\s*$/gm,''),context);
  class Original{}await extension.beforeRegisterNodeDef(Original,{name:'CostumeGallery'});assert.equal(Original.prototype.onNodeCreated,undefined);
  await extension.beforeRegisterNodeDef(Node,{name:'RandomCostumeGallery'});const node=new Node();node.onNodeCreated();
  return{node,origin,language,selection,lock,section,dice:node.dom.random_dice.children[0],image:node.dom.random_costume_preview.children[0],status:node.dom.random_costume_preview.children[1],get changes(){return changes;}};
}
test('only new random node receives execution preview; origin and input values stay unchanged',async()=>{
  const s=await setup();s.node.onExecuted({costume_id:[uid],name:['My costume']});s.image.onload();
  assert.equal(s.image.src,`/api/costume_gallery/assets/png/${uid}.png`);assert.equal(s.node.properties.last_costume_id,uid);assert.equal(s.origin.value,'all');assert.equal(s.language.value,'zh');assert.match(s.status.textContent,/My costume/);assert.equal(s.changes,1);
});
test('saved preview and English interface are restored without queuing or freezing the pool',async()=>{
  const s=await setup();s.node.properties={last_costume_id:uid,last_costume_name:'Saved hair'};s.node.onConfigure({widgets_values:['user','en']});s.image.onload();
  assert.equal(s.image.src,`/api/costume_gallery/assets/png/${uid}.png`);assert.equal(s.status.textContent,'Saved hair');assert.equal(s.language.value,'en');assert.equal(s.changes,0);
});
test('stale image callbacks cannot replace a newer random result',async()=>{
  const s=await setup();s.node.onExecuted({costume_id:[uid]});const stale=s.image.onerror;
  s.node.onExecuted({costume_id:['h-next']});s.image.onload();stale();assert.equal(s.image.style.display,'block');assert.doesNotMatch(s.status.textContent,/失败/);
});

test('random preview names switch immediately with the selected output language',async()=>{
 const s=await setup();s.node.onExecuted({costume_id:[uid],name:['我的参考'],name_zh:['我的参考'],name_en:['My reference']});
 s.language.callback('en');assert.match(s.status.textContent,/My reference/);assert.doesNotMatch(s.status.textContent,/[\u3400-\u9fff]/);
 s.language.callback('zh');assert.match(s.status.textContent,/我的参考/);
});

test('saved nodes gain the name output without changing existing connections',async()=>{
 const s=await setup();s.node.outputs.pop();s.node.outputs[4].links=[17];const original=s.node.outputs.slice();
 s.node.onConfigure({widgets_values:['all','en']});assert.equal(s.node.outputs.length,7);assert.equal(s.node.outputs[6].name,'costume');
 assert.equal(s.node.outputs[6].label,'Costume name');original.forEach((output,i)=>assert.equal(s.node.outputs[i],output));assert.deepEqual(s.node.outputs[4].links,[17]);
});

test('older cached translations cannot abort restoring a workflow with a saved preview',async()=>{
 const s=await setup({legacyI18n:true,fetchImpl:async()=>({ok:true,json:async()=>[{id:uid,name_zh:'旧名称',name_en:'Restored reference'}]})});
 s.node.properties={last_costume_id:uid,last_costume_name:'旧名称'};
 assert.doesNotThrow(()=>s.node.onConfigure({widgets_values:['all','en']}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(s.status.textContent,/Restored reference/);assert.equal(s.changes,0);
});

test('preview catalog failures do not throw from workflow loading',async()=>{
 for(const fetchImpl of [()=>{throw Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({invalid:true})})]){
  const s=await setup({legacyI18n:true,fetchImpl});
  s.node.properties={last_costume_id:uid,last_costume_name:'Saved reference'};
  assert.doesNotThrow(()=>s.node.onConfigure({widgets_values:['all','en']}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(s.status.textContent,/Saved reference/);assert.equal(s.node.properties.last_costume_id,uid);assert.equal(s.changes,0);
 }
});
test('restoring previews shares one catalog request without changing node inputs',async()=>{
 let calls=0;const s=await setup({legacyI18n:true,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>[{id:uid,name_zh:"旧名称",name_en:"Restored reference"}]};}});
 s.node.properties={last_costume_id:uid,last_costume_name:'旧名称'};
 s.node.onConfigure({widgets_values:['all','en']});s.node.onConfigure({widgets_values:['all','en']});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);assert.equal(s.origin.value,'all');assert.equal(s.language.value,'en');assert.equal(s.changes,0);
});


test('dice updates the selected input without running or queuing a workflow',async()=>{
 let requested,calls=0;const s=await setup({fetchImpl:async url=>{calls++;requested=url;return {ok:true,json:async()=>({costume_id:uid,name_zh:'我的参考',name_en:'My reference'})};}});
 s.origin.value='user';s.section.value='custom';s.language.callback('en');await s.dice.onclick();
 const params=new URL(requested,'http://localhost').searchParams;
 assert.equal(params.get('origin'),'user');assert.equal(params.get('language'),'en');assert.equal(params.has('section'),false);
 assert.equal(calls,1);assert.equal(s.selection.value,uid);assert.equal(s.node.properties.last_costume_id,uid);assert.equal(s.status.textContent,'My reference');assert.equal(s.dice.disabled,false);
});

test('locked dice never requests another reference or accepts a stale execution',async()=>{
 let calls=0;const s=await setup({fetchImpl:async()=>{calls++;throw Error('Must not fetch');}});
 s.node.onExecuted({costume_id:[uid],name_zh:['我的参考'],name_en:['My reference']});s.lock.callback(true);
 assert.equal(s.lock.value,true);assert.equal(s.dice.disabled,true);await s.dice.onclick();assert.equal(calls,0);
 s.node.onExecuted({costume_id:['stale-result']});assert.equal(s.selection.value,uid);
 s.lock.callback(false);assert.equal(s.dice.disabled,false);
});

test('locking requires a selection and does not invent one',async()=>{
 const s=await setup();s.lock.callback(true);assert.equal(s.lock.value,false);assert.match(s.status.textContent,/先点击骰子/);assert.equal(s.selection.value,'');
});

test('late requests are ignored after locking, filtering, configuring or removal',async()=>{
 for(const change of [s=>s.lock.callback(true),s=>s.origin.callback('builtin'),s=>s.node.onConfigure({widgets_values:['all','zh']}),s=>s.node.onRemoved()]){
  let resolve;const pending=new Promise(done=>{resolve=done;});const s=await setup({fetchImpl:()=>pending});
  s.node.onExecuted({costume_id:[uid],name_zh:['我的参考'],name_en:['My reference']});const task=s.dice.onclick();assert.equal(s.dice.disabled,true);
  change(s);resolve({ok:true,json:async()=>({costume_id:'too-late',name_zh:'过期',name_en:'Too late'})});await task;assert.equal(s.selection.value,uid);
 }
});

test('failed or duplicate dice requests keep the choice and can be retried',async()=>{
 let resolve,calls=0;const pending=new Promise(done=>{resolve=done;});const s=await setup({fetchImpl:()=>{calls++;return pending;}});
 s.node.onExecuted({costume_id:[uid],name_zh:['我的参考'],name_en:['My reference']});const first=s.dice.onclick();await s.dice.onclick();assert.equal(calls,1);
 resolve({ok:false,json:async()=>({error:'No available originals'})});await first;
 assert.equal(s.selection.value,uid);assert.equal(s.dice.disabled,false);assert.match(s.status.textContent,/No available originals/);
 await s.dice.onclick();assert.equal(calls,2);
});

test('English labels, lock state, outputs and tooltips follow the node language',async()=>{
 const s=await setup();s.node.onExecuted({costume_id:[uid],name_zh:['我的参考'],name_en:['My reference']});s.lock.callback(true);s.language.callback('en');
 assert.equal(s.dice.textContent,'🔒 Locked');assert.equal(s.selection.label,'Current costume ID');assert.equal(s.lock.label,'🔒 Lock random selection');assert.equal(s.node.outputs[3].label,'Costume ID');assert.doesNotMatch(s.node.outputs.map(output=>output.label).join(' '),/[\u3400-\u9fff]/);
 for(const widget of [s.origin,s.language,s.selection,s.lock]){assert.ok(widget.tooltip);assert.doesNotMatch(widget.label+' '+widget.tooltip,/[\u3400-\u9fff]/);}
 assert.equal(s.status.textContent,'My reference');assert.equal(s.dice.disabled,true);
 s.language.callback('zh');assert.equal(s.dice.textContent,'🔒 已锁定');assert.equal(s.status.textContent,'我的参考');
});

test('saved locks restore the actual selection and keep name-only previews',async()=>{
 const s=await setup();s.selection.value=uid;s.lock.value=true;
 s.node.properties={last_costume_id:uid,last_costume_name:'我的参考',last_costume_names:{zh:'我的参考',en:'My reference'}};
 s.node.onConfigure({widgets_values:['all','en']});assert.equal(s.selection.value,uid);assert.equal(s.lock.value,true);assert.equal(s.dice.disabled,true);assert.equal(s.dice.textContent,'🔒 Locked');assert.equal(s.status.textContent,'My reference');
 s.lock.callback(false);assert.equal(s.dice.disabled,false);assert.equal(s.status.textContent,'My reference');
});


test('legacy DOM placeholders cannot turn the new lock input into an invalid value',async()=>{
 const s=await setup();s.lock.value='';s.node.properties={last_costume_id:uid,last_costume_names:{zh:'我的参考',en:'My reference'}};
 s.node.onConfigure({widgets_values:['builtin','en','','']});assert.equal(s.lock.value,false);assert.equal(s.dice.disabled,false);assert.equal(s.selection.value,uid);
});
