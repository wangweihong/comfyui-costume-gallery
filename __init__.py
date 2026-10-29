"""ComfyUI costume gallery with bundled original images and thumbnails."""
import hashlib
from pathlib import Path
import numpy as np
import torch
from PIL import Image, ImageOps
from aiohttp import web
from server import PromptServer
from .catalog import records, costume, asset, ROOT

class CostumeGallery:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'costume_id': ('STRING', {'default': 'SPR-0001', 'multiline': False, 'tooltip': '点击浏览服装图库，按中文、英文或编号搜索，再使用此服装。'})}}

    RETURN_TYPES = ('IMAGE', 'INT', 'INT', 'STRING', 'STRING', 'STRING')
    RETURN_NAMES = ('image', 'width', 'height', 'costume_id', 'description', 'keywords_en')
    FUNCTION = 'load_costume'
    CATEGORY = 'image/Costume Gallery'
    DESCRIPTION = '本地中文服装图库：1407套服装、分类筛选、中英文搜索，输出完整PNG原图。'

    @classmethod
    def VALIDATE_INPUTS(cls, costume_id):
        try:
            row = costume(costume_id)
            asset('png', Path(row['原图']).name)
        except (ValueError, FileNotFoundError) as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, costume_id):
        row = costume(costume_id)
        return hashlib.sha256(asset('png', Path(row['原图']).name).read_bytes()).hexdigest()

    def load_costume(self, costume_id):
        row = costume(costume_id)
        with Image.open(asset('png', Path(row['原图']).name)) as source:
            img = ImageOps.exif_transpose(source).convert('RGBA')
            img = Image.alpha_composite(Image.new('RGBA', img.size, 'white'), img).convert('RGB')
            width, height = img.size
            tensor = torch.from_numpy(np.asarray(img).astype(np.float32) / 255.0).unsqueeze(0)
        description = row['分类'] + ' / ' + '、'.join(row['关键词'])
        return tensor, width, height, costume_id, description, row['英文关键词']

routes = PromptServer.instance.routes

@routes.get('/costume_gallery/catalog')
async def catalog_route(request):
    try:
        return web.json_response(records())
    except (ValueError, FileNotFoundError) as exc:
        return web.json_response({'error': str(exc)}, status=503)

@routes.get('/costume_gallery/assets/{kind}/{filename}')
async def asset_route(request):
    try:
        return web.FileResponse(asset(request.match_info['kind'], request.match_info['filename']), headers={'Cache-Control': 'private, max-age=3600'})
    except (ValueError, FileNotFoundError):
        raise web.HTTPNotFound()

@routes.get('/costume_gallery/web/{filename}')
async def web_route(request):
    filename = request.match_info['filename']
    if filename not in ('gallery.mjs', 'style.css', 'icon.svg'):
        raise web.HTTPNotFound()
    return web.FileResponse(ROOT / 'web' / filename, headers={'Cache-Control': 'no-cache'})

@routes.get('/costume_gallery/gallery')
async def gallery_route(request):
    return web.FileResponse(ROOT / 'web' / 'gallery.html', headers={'Cache-Control': 'no-cache'})

NODE_CLASS_MAPPINGS = {'CostumeGallery': CostumeGallery}
NODE_DISPLAY_NAME_MAPPINGS = {'CostumeGallery': 'Costume Gallery 服装图库'}
WEB_DIRECTORY = './web'
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
