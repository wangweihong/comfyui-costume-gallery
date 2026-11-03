// Requires serve_management_fixture.py; the test refuses a non-fixture server.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{}
const kind=path.basename(path.resolve(__dirname,'..')).replace('comfyui-','').replace('-gallery','');
const base=process.env.GALLERY_MANAGEMENT_TEST_URL;
test('bulk edit, single replacement, independent update decisions and node output',{skip:!chromium||!base},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-proxy-server']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
  assert.equal((await page.request.post(base+'/_fixture/'+kind+'/reset')).ok(),true);
  const prefix=base+'/'+kind+'_gallery/',errors=[];page.on('pageerror',e=>errors.push(e.message));
  const status=async()=>await(await page.request.get(prefix+'manage')).json();
  const update=async()=>page.request.post(base+'/_fixture/'+kind+'/update');
  const card=kind==='costume'?'#grid .card':`#grid .${kind}-card`;
  const close=kind==='costume'?'#close':'#viewer-close';
  await page.goto(prefix+'gallery?lang=zh',{waitUntil:'domcontentloaded'});await page.locator(card).first().waitFor();
  await page.locator('#gallery-edit-toggle').waitFor({state:'visible'});await page.locator('#gallery-edit-toggle').click();
  await page.locator('[data-select-asset]').nth(0).check();await page.locator('[data-select-asset]').nth(1).check();
  assert.equal(await page.locator('[data-select-asset]:checked').count(),2);assert.equal(await page.locator('#viewer').isVisible(),false);
  await page.locator('#gallery-delete-selected').click();await page.locator('#pose-delete-dialog').getByText(/删除选中的 2 张素材/).waitFor();
  await page.locator('#pose-delete-confirm').click();await page.locator('#pose-delete-dialog').waitFor({state:'hidden'});
  assert.equal((await status()).records.filter(row=>row.management_state==='removed').length,2);assert.equal(await page.locator(card).count(),4);
  await page.locator('#gallery-edit-toggle').click();await page.locator(card).first().click();await page.locator('#replace-current-asset').waitFor({state:'visible'});
  const identity=(await status()).records.find(row=>row.management_state==='default').id;
  await page.locator('#replace-current-asset').click();assert.equal(await page.locator('#pose-replace-dialog select').count(),0);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  await page.locator('#pose-replacement-file').setInputFiles({name:'correct.png',mimeType:'image/png',buffer:png});await page.locator('#pose-replace-confirm').click();await page.locator('#pose-replace-dialog').waitFor({state:'hidden'});
  const replaced=(await status()).records.find(row=>row.management_state==='replace');assert.ok(replaced);
  let load=await(await page.request.get(base+'/_fixture/'+kind+'/load/'+replaced.id)).json();assert.deepEqual([load.width,load.height],[1,1]);assert.equal(load.ports,kind==='hairstyle'?8:7);assert.equal(load.candidates.length,4);
  await page.locator(close).click();await update();await page.reload({waitUntil:'domcontentloaded'});
  assert.ok((await status()).records.every(row=>row.installed_original));
  await page.locator('#library-manager-open').click();await page.waitForFunction(()=>!document.querySelector('#library-update-apply').disabled);
  assert.equal(await page.locator('#library-manager img').count(),0);assert.equal(await page.locator('#library-manager input[type=checkbox]').count(),0);
  assert.equal(await page.locator('#library-manager select').count(),2);
  await page.locator('#library-update-apply').click();await page.locator('#library-update-status').getByText(/删除 2 张，替换 1 张，保留 0 张；失败 0 个/).waitFor();
  assert.equal((await status()).records.filter(row=>!row.installed_original).length,2);
  await update();await page.locator('#update-replaced-choice').selectOption('keep');await page.locator('#library-update-apply').click();await page.locator('#library-update-status').getByText(/保留 1 张；失败 0 个/).waitFor();
  assert.equal((await status()).records.find(row=>row.id===replaced.id).management_state,'default');
  await update();await page.locator('#update-deleted-choice').selectOption('keep');await page.locator('#library-update-apply').click();await page.locator('#library-update-status').getByText(/保留 2 张；失败 0 个/).waitFor();
  assert.ok((await status()).records.every(row=>row.management_state==='default'&&row.installed_original));
  await page.locator('#library-manager').getByRole('button',{name:'关闭',exact:true}).click();await page.locator(card).first().click();await page.locator('#delete-current-asset').click();assert.equal(await page.locator('#pose-delete-dialog select').count(),0);await page.locator('#pose-delete-confirm').click();await page.locator('#pose-delete-dialog').waitFor({state:'hidden'});
  assert.equal((await status()).records.filter(row=>row.management_state==='removed').length,1);
  const language=kind==='hairstyle'?'#language':'#gallery-language';await page.locator(language).selectOption('en');await page.locator('#library-manager-open').click();await page.waitForFunction(()=>!document.querySelector('#library-update-apply').disabled);
  assert.doesNotMatch(await page.locator('#library-manager').innerText(),/[\u3400-\u9fff]/);await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#library-manager').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
  if(process.env.GALLERY_MANAGEMENT_SCREENSHOTS){const out=process.env.GALLERY_MANAGEMENT_SCREENSHOTS;fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,kind+'-mobile-update.png')});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,kind+'-update.png')});await page.locator('#library-manager').getByRole('button',{name:'Close',exact:true}).click();await page.locator('#gallery-edit-toggle').click();await page.screenshot({path:path.join(out,kind+'-edit.png')});}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
