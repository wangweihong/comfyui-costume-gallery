const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('translations stay isolated when multiple gallery plugins share a ComfyUI page',()=>{
 const sentinel={marker:true},window={PortraitI18n:sentinel,HairstyleI18n:sentinel,localStorage:{getItem:()=>null,setItem(){}}};
 const context=vm.createContext({window,URLSearchParams});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/i18n.mjs'),'utf8'),context);
 const I=window.CostumeI18n;assert.ok(I);assert.equal(window.PortraitI18n,sentinel);assert.equal(window.HairstyleI18n,sentinel);
 assert.equal(I.translate('界面与输出语言','en'),'UI / output language');
 assert.equal(I.preferred('?lang=en'),'en');assert.equal(I.preferred('?lang=zh'),'zh');
 for(const [zh,en] of Object.entries(I.EN))assert.deepEqual((zh.match(/\{\w+\}/g)||[]).sort(),(en.match(/\{\w+\}/g)||[]).sort(),zh);
});
