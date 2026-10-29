"""Local allow-listed costume assets. No network or runtime downloads."""
import json
import os
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LIBRARY = Path(os.environ.get('COMFYUI_COSTUME_GALLERY_LIBRARY', ROOT / 'library')).resolve()
FIELDS = {'png': '原图', 'img': '预览图', 'thumbs': '缩略图'}

@lru_cache(maxsize=1)
def records():
    source = LIBRARY / 'data' / 'costume-zh.json'
    if not source.is_file():
        raise FileNotFoundError('服装索引缺失：library/data/costume-zh.json，请更新或重新安装完整 comfyui-costume-gallery 节点。')
    data = json.loads(source.read_text(encoding='utf-8'))
    if not isinstance(data, list) or not data:
        raise ValueError('服装索引为空或格式错误')
    return data

@lru_cache(maxsize=1)
def index():
    return {row['id']: row for row in records()}

def costume(costume_id):
    try:
        return index()[costume_id]
    except KeyError:
        raise ValueError(f'未知服装 ID：{costume_id}') from None

def asset(kind, filename):
    if kind not in FIELDS or Path(filename).name != filename or '\\' in filename:
        raise ValueError('无效图片路径')
    row = costume(Path(filename).stem)
    relative = Path(kind) / filename
    target = (LIBRARY / relative).resolve()
    if row[FIELDS[kind]] != relative.as_posix() or not target.is_relative_to(LIBRARY):
        raise ValueError('图片不在服装图库中')
    if not target.is_file():
        raise FileNotFoundError(f'图片缺失：library/{relative}。请更新或重新安装完整 comfyui-costume-gallery 节点，确认包含 png、img 和 thumbs；使用自定义图库目录时也须包含完整素材。')
    return target
