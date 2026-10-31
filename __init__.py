"""ComfyUI costume gallery with bundled original images and thumbnails."""
import asyncio
import logging
import hashlib
from pathlib import Path
import numpy as np
import torch
from PIL import Image, ImageOps
from aiohttp import web
from server import PromptServer
from .uploads import import_image, UploadError, MAX_BYTES
from .catalog import USER_LIBRARY, metadata, browser_payload, records, costume, asset, ROOT

class CostumeGallery:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'costume_id': ('STRING', {'default': 'SPR-0001', 'multiline': False, 'tooltip': '点击浏览服装图库，按中文、英文或编号搜索，再使用此服装。'})}}

    RETURN_TYPES = ('IMAGE', 'INT', 'INT', 'STRING', 'STRING', 'STRING')
    RETURN_NAMES = ('image', 'width', 'height', 'costume_id', 'description', 'keywords_en')
    FUNCTION = 'load_costume'
    CATEGORY = 'image/Costume Gallery'
    DESCRIPTION = '本地服装图库：分类搜索和单张自定义上传，输出完整参考图；自定义素材不补造英文关键词。'

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
        description = row['分类'] + ' / ' + (row['name_zh'] if row['origin'] == 'user' else '、'.join(row['关键词']))
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
    if filename not in ('gallery.mjs', 'style.css', 'icon.svg', 'custom_upload.mjs', 'custom_upload.css'):
        raise web.HTTPNotFound()
    return web.FileResponse(ROOT / 'web' / filename, headers={'Cache-Control': 'no-cache'})

@routes.get('/costume_gallery/gallery')
async def gallery_route(request):
    return web.FileResponse(ROOT / 'web' / 'gallery.html', headers={'Cache-Control': 'no-cache'})

@routes.post("/costume_gallery/upload")
async def upload_route(request):
    try:
        multipart = await request.multipart()
        fields, data, filename = {}, None, None
        async for part in multipart:
            if part.filename is not None:
                if part.name != "image" or data is not None:
                    raise UploadError("single_image_only")
                chunks, size = [], 0
                while chunk := await part.read_chunk():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise UploadError("file_too_large", 413)
                    chunks.append(chunk)
                data, filename = b"".join(chunks), part.filename
            else:
                if part.name not in {"name", "other_name", "language", "hair", "category", "section", "angle"} or part.name in fields:
                    raise UploadError("invalid_metadata")
                chunks, size = [], 0
                while chunk := await part.read_chunk():
                    size += len(chunk)
                    if size > 2048:
                        raise UploadError("invalid_metadata")
                    chunks.append(chunk)
                fields[part.name] = b"".join(chunks).decode("utf-8")
        if data is None:
            raise UploadError("image_required")
        try:
            await asyncio.to_thread(records)
        except (ValueError, OSError) as exc:
            raise UploadError("storage_error", 500) from exc
        row = await asyncio.to_thread(import_image, data, name=fields.get("name", ""),
            other_name=fields.get("other_name", ""), language=fields.get("language", "zh"),
            hair=fields.get("hair", "unknown"), filename=filename, root=USER_LIBRARY, category=fields.get("category", ""),
            section=fields.get("section", "custom"), angle=fields.get("angle", "unknown"))
        # Reuse the existing allow-listed, browser-relative catalog representation.
        payload = browser_payload()
        selected = next(item for item in payload["records"] if item["id"] == row["id"])
        return web.json_response({"record": selected, "catalog": payload}, status=201,
                                 headers={"Cache-Control": "no-store"})
    except UploadError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    except (ValueError, UnicodeError, AssertionError):
        return web.json_response({"error": "invalid_request"}, status=400)
    except OSError:
        logging.exception("Unable to save a custom hairstyle")
        return web.json_response({"error": "storage_error"}, status=500)


@routes.get("/costume_gallery/meta")
async def metadata_route(request):
    try:
        return web.json_response(metadata(), headers={"Cache-Control":"no-store"})
    except (ValueError, OSError):
        return web.json_response({"error":"storage_error"}, status=503)


NODE_CLASS_MAPPINGS = {'CostumeGallery': CostumeGallery}
NODE_DISPLAY_NAME_MAPPINGS = {'CostumeGallery': 'Costume Gallery 服装图库'}
WEB_DIRECTORY = './web'
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
