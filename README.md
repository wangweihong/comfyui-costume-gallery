# comfyui-costume-gallery

ComfyUI 本地中文服装图库节点，参考 [ai-costume-gallery-zh](https://github.com/wangweihong/ai-costume-gallery-zh) 的界面和素材。内置 1,407 套服装，8 个分类，包含全部 WebP 缩略图、WebP 预览图和 PNG 原图，共 4,221 张图片，约 1.42 GiB。

## 安装与使用

1. 在 `ComfyUI/custom_nodes/` 目录执行 `git clone https://github.com/wangweihong/comfyui-costume-gallery.git`，或将整个节点文件夹放入该目录，包括 `library/`。不需要另行下载素材或运行安装脚本。
2. 重启 ComfyUI，强制刷新浏览器（Ctrl+Shift+R）。
3. 添加 **image → Costume Gallery → Costume Gallery 服装图库** 节点。
4. 点击“浏览服装图库 · 搜索 / 分类 / 关键词”，在弹窗中选择春装、夏装、秋装、冬装、内衣、派对、泳装或性感分类。支持中文、英文关键词、ID 搜索；空格分隔多个词时按同时包含筛选。
5. 点击服装卡片查看大图，再点“使用此服装 → ComfyUI”。节点保存 `costume_id` 并显示 PNG 原图。
6. 将 `image` 接到预览或图像编辑工作流，点击运行。浏览和选择服装不会自动执行生成任务。

导入 [`example_workflows/costume_gallery_preview.json`](example_workflows/costume_gallery_preview.json) 可直接测试原图预览与保存；同名 `.api.json` 为服务端格式，不依赖打开图库页面。

![服装节点原图输出实测](docs/comfyui_node_test.png)

## Pose Gallery + 服装图库 + Qwen Image 2.1

附带[通用三图工作流](example_workflows/pose_costume_qwen21_generic.json)：图一为姿势图库，图二为人物参考，图三为服装图库。使用固定的通用提示词，不写死动作、衣服或性别，切换素材后可直接运行。模型依赖、参考图顺序及完整说明见[三图流程指南](example_workflows/pose_costume_qwen21.md)。

## 节点输出

| 输出 | 类型 | 内容 |
| --- | --- | --- |
| `image` | IMAGE | PNG 原图，RGB，保持原始尺寸；透明区域合成白色背景 |
| `width` / `height` | INT | 原始图片宽高 |
| `costume_id` | STRING | 服装编号，如 `SPR-0001` |
| `description` | STRING | 中文分类及中文关键词 |
| `keywords_en` | STRING | 原始英文关键词 |

标签可能不完整，不能替代完整生成提示词。该节点负责提供服装参考图，本身不执行换装；需要将其输出接入支持图像参考的工作流。

## 内置素材

```text
comfyui-costume-gallery/
├── library/
│   ├── data/       # 原始及中文索引、分类、词典与素材清单
│   ├── thumbs/     # 1,407 张 WebP 缩略图
│   ├── img/        # 1,407 张 WebP 预览图
│   ├── png/        # 1,407 张 PNG 原图
│   └── SOURCE.json
├── web/            # ComfyUI 扩展和服装弹窗界面
└── example_workflows/
```

所有浏览、搜索、预览和节点输出均使用本地文件，运行时没有图片下载、统计或遥测。原图缺失时会显示对应文件路径和修复提示。不得只复制缩略图或 web 目录。

高级：`COMFYUI_COSTUME_GALLERY_LIBRARY` 可指定其他完整图库根目录，需包含 `data/`、`thumbs/`、`img/` 和 `png/`。服务端仅提供索引允许的文件，拒绝路径穿越和指向图库外的符号链接。

依赖使用 ComfyUI 已有的 Pillow、NumPy、PyTorch、aiohttp，无额外模型。

## 素材来源与许可

- 中文服装图库：[wangweihong/ai-costume-gallery-zh](https://github.com/wangweihong/ai-costume-gallery-zh)，上游维护者 Deeyu。
- 原始图库：[衣装集 COSTUME-DB-01](https://ai-costume-gallery.pages.dev/)，原作者 [ギア](https://x.com/giaaibusi)。
- 本节点改编了上游 MIT 许可的 HTML、CSS 和 JavaScript，保留 [LICENSE](LICENSE) 与 [第三方声明](THIRD_PARTY_NOTICES.md)。图片及原始数据不包含在代码 MIT 许可内，其使用范围由原权利人的条款决定。

## 本地验证

已完成全部4,221张素材的完整性校验，以及弹窗、ID搜索、中英文组合搜索、分类筛选、选择写回和PNG原图输出测试。示例 SPR-0002 输出1366×2048，RGB像素与原图一致。

三图Qwen工作流使用同一通用提示词完成跪姿春装与站姿冬装两组测试，整体动作和服装替换有效；帽子与袖型等细节仍可能偏差。

## 验证

```bash
python3 -m unittest discover -s tests -v
node --test tests/test_preview.mjs
node --check web/costume_gallery.js
node --check web/gallery.mjs
```
