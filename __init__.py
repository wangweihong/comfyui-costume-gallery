"""ComfyUI costume gallery with bundled original images and thumbnails."""
import asyncio
import logging
import random
import uuid
from . import catalog as _random_catalog
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

class RandomCostumeGallery(CostumeGallery):
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"origin": (["all", "builtin", "user"], {"default": "all",
                    "tooltip": "随机来源：全部 / 内置 / 自定义。Random source: all / built-in / custom."})},
                "optional": {"language": (["zh", "en"], {"default": "zh",
                    "tooltip": "新节点界面与提示语言；数据输出沿用原节点。UI/error language; data outputs retain the original node's semantics."})}}

    FUNCTION = "load_random"
    DESCRIPTION = "每次运行工作流时，从可用服装原图中自动随机抽取一张；保留原节点的6个输出。"

    @classmethod
    def _candidates(cls, origin="all", language="zh"):
        if origin not in ("all", "builtin", "user"):
            raise ValueError("Invalid random source" if language == "en" else "无效的随机来源")
        available = []
        # records() validates registration and canonical paths once for the whole pool.
        # Resolve against the correct root here to avoid reloading the entire index per file.
        for row in records():
            if origin != "all" and row["origin"] != origin:
                continue
            root = _random_catalog.USER_LIBRARY if row["origin"] == "user" else _random_catalog.LIBRARY
            target = (root / row['原图']).resolve()
            if not target.is_relative_to(root):
                raise ValueError("Original image path escapes the library" if language == "en" else "原图路径越出图库目录")
            if target.is_file():
                available.append(row)
        if not available:
            raise ValueError("No available originals in this source. Install the library, upload a reference, or change the source."
                             if language == "en" else "当前来源没有可用服装原图，请安装素材库、上传参考图或切换来源。")
        return available

    @classmethod
    def VALIDATE_INPUTS(cls, origin="all", language="zh"):
        try:
            cls._candidates(origin, language)
        except (ValueError, OSError) as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, origin="all", language="zh"):
        # Re-execute for every queued prompt; the fingerprint is JSON-safe.
        return uuid.uuid4().hex

    def load_random(self, origin="all", language="zh"):
        selected = random.choice(self._candidates(origin, language))
        result = super().load_costume(selected["id"])
        if selected["origin"] == "user":
            name = selected["name_en"] if language == "en" else selected["name_zh"]
        else:
            name = selected.get("姿势名称") or selected.get("title") or selected.get("分类") or selected["id"]
        return {"ui": {"costume_id": [result[3]], "name": [name]}, "result": result}


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


NODE_CLASS_MAPPINGS = {"CostumeGallery": CostumeGallery, "RandomCostumeGallery": RandomCostumeGallery}
NODE_DISPLAY_NAME_MAPPINGS = {'CostumeGallery': 'Costume Gallery 服装图库', 'RandomCostumeGallery': 'Random Costume Gallery 随机服装图库'}
WEB_DIRECTORY = './web'
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
