"""Serve only temporary synthetic assets for browser and tensor integration checks."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
from aiohttp import web
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
roots=[ROOT]
if '--all' in sys.argv:
    roots=[ROOT.parent/f'comfyui-{kind}-gallery' for kind in ['portrait','costume','hairstyle']]
routes=web.RouteTableDef()
server=types.ModuleType('server');server.PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=routes));sys.modules['server']=server
storage=tempfile.TemporaryDirectory(prefix='gallery-management-fixture-')
plugins={}
for root in roots:
    kind=root.name.removeprefix('comfyui-').removesuffix('-gallery')
    spec=importlib.util.spec_from_file_location(kind+'_browser_fixture',root/'__init__.py',submodule_search_locations=[str(root)])
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
    c=module.management.catalog
    rows=json.loads((c.LIBRARY/c.INDEX_FILE).read_text())[:6]
    c.LIBRARY,c.USER_LIBRARY=Path(storage.name)/kind/'library',Path(storage.name)/kind/'user'
    originals={}
    for row in rows:
        for asset_kind in module.management.SUFFIXES:
            path=module.management.destination(row,asset_kind);path.parent.mkdir(parents=True,exist_ok=True)
            Image.new('RGB',(90,120),'#a5b8a6').save(path)
            originals[path]=path.read_bytes()
        row.update(w=90,h=120,thumb_w=90,thumb_h=120,bytes=module.management.destination(row,c.FULL_KIND).stat().st_size)
    index=c.LIBRARY/c.INDEX_FILE;index.parent.mkdir(parents=True,exist_ok=True);index.write_text(json.dumps(rows))
    plugins[kind]=(module,originals)
app=web.Application();app.add_routes(routes)
async def fixture_action(request):
    module,originals=plugins[request.match_info['kind']]
    if request.match_info['action']=='reset':module.management.save_rules({})
    for path,content in originals.items():path.write_bytes(content)
    return web.json_response({'restored':len(originals)})
async def load_node(request):
    kind=request.match_info['kind'];module=plugins[kind][0]
    cls=getattr(module,kind.capitalize()+'Gallery');node=cls()
    try:
        result=getattr(node,cls.FUNCTION)(request.match_info['id'])
        candidates=getattr(module,'Random'+kind.capitalize()+'Gallery')._candidates()
        return web.json_response({'width':result[1],'height':result[2],'id':result[3],'ports':len(result),'candidates':[row['id'] for row in candidates]})
    except (ValueError,FileNotFoundError) as exc:return web.json_response({'error':str(exc)},status=400)
app.router.add_post('/_fixture/{kind}/{action:reset|update}',fixture_action)
app.router.add_get('/_fixture/{kind}/load/{id}',load_node)
try:web.run_app(app,host='0.0.0.0',port=int(sys.argv[1]) if len(sys.argv)>1 else 18296,access_log=None)
finally:storage.cleanup()
