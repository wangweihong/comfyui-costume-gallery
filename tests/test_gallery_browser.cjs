const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
let chromium;try{({chromium}=require('playwright'));}catch{}
const root=path.resolve(__dirname,'..'),kind=path.basename(root).replace('comfyui-','').replace('-gallery','');
const loadCatalog=()=>JSON.parse(cp.execFileSync('python3',['-c',`import importlib.util,json,pathlib;s=importlib.util.spec_from_file_location('browser_catalog',pathlib.Path('catalog.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.browser_payload(),ensure_ascii=False))`],{cwd:root,maxBuffer:32*1024*1024}).toString());
test('English gallery, details, filters, names, language roundtrip, help, and repository links',{skip:!chromium},async()=>{
 const payload=loadCatalog(),prefix='/'+kind+'_gallery/';
 const server=http.createServer((req,res)=>{
  const route=new URL(req.url,'http://local').pathname.slice(prefix.length);
  if(['catalog','meta','data.js'].includes(route)){
   const data=route==='catalog'?payload.records:route==='meta'?payload.meta:payload;
   res.setHeader('Content-Type',route==='data.js'?'text/javascript':'application/json');
   res.end(route==='data.js'?`window.${kind.toUpperCase()}_DATA=${JSON.stringify(data)};`:JSON.stringify(data));return;
  }
  let file;
  if(route==='gallery')file=path.join(root,'web/gallery.html');
  else if(route.startsWith('ui/')||route.startsWith('web/'))file=path.join(root,'web',path.basename(route));
  else if(route.startsWith('assets/')){
   const [,type,name]=route.split('/');const dirs=kind==='costume'?{png:'png',img:'img',thumbs:'thumbs'}:{full:'img/full',preview:'img/preview',thumb:'img/thumb'};
   if(dirs[type])file=path.join(root,'library',dirs[type],path.basename(name));
  }
  if(!file||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.svg')?'image/svg+xml':'image/webp');fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}gallery?lang=en`);
  const card=kind==='costume'?'#grid .card':'#grid [data-open]';await page.waitForSelector(card);
  const language=page.locator(kind==='hairstyle'?'#language':'#gallery-language');
  const leftover=()=>page.evaluate(()=>{
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),found=[];
   while(walker.nextNode()){const node=walker.currentNode,p=node.parentElement;if(!p||p.closest('script,style,textarea,option')||!p.getClientRects().length)continue;if(/[\u3400-\u9fff]/.test(node.nodeValue))found.push(node.nodeValue.trim());}
   return [...new Set(found)];
  });
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  assert.deepEqual(await leftover(),[],'English page contains untranslated text');
  assert.ok(await page.locator(`a[href="https://github.com/wangweihong/comfyui-${kind}-gallery"]`).count());
  assert.equal(await page.locator('a[href*="x.com/anhao_ai"]').count(),0);
  await page.locator(card).first().click();await page.waitForSelector('#viewer[open]');
  const idSelector=kind==='costume'?'#detail-title':'#viewer-id',before=await page.locator(idSelector).textContent();
  assert.deepEqual(await leftover(),[],'English details contain untranslated text');
  const topSelect=language;
  await topSelect.selectOption('zh');await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  assert.equal(await page.locator('#viewer').isVisible(),true);assert.equal(await page.locator(idSelector).textContent(),before);
  await topSelect.selectOption('en');await page.waitForFunction(()=>document.documentElement.lang==='en');
  assert.equal(await page.locator(idSelector).textContent(),before);assert.deepEqual(await leftover(),[]);
  await page.keyboard.press('ArrowRight');assert.deepEqual(await leftover(),[]);
  await page.locator(kind==='costume'?'#close':'#viewer-close').click();
  if(kind==='portrait'){
   await page.locator('#section-tabs [data-section="styling"]').click();
   assert.doesNotMatch(await page.locator('#style-filter').textContent(),/[\u3400-\u9fff]/);
   await page.locator(card).first().click();assert.deepEqual(await leftover(),[],'Styling portrait details');await page.locator('#viewer-close').click();
  }
  if(kind==='costume')await page.locator('#help').click();else await page.locator('[data-info="tips"]').first().click();
  assert.deepEqual(await leftover(),[],'English help contains untranslated text');
  await page.keyboard.press('Escape');
  if(kind!=='costume'){
   await page.locator('[data-info="rules"]').first().click();assert.deepEqual(await leftover(),[],'English source information');await page.keyboard.press('Escape');
  }
  await page.locator(kind==='hairstyle'?'#upload-open':'#custom-upload-open').click();
  assert.deepEqual(await leftover(),[],'English upload form');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});assert.deepEqual(await leftover(),[],'Mobile English page');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
