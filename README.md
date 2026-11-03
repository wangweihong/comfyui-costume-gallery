# comfyui-costume-gallery

**简体中文** · [English](README.en.md)

ComfyUI 本地中文服装图库节点，参考 [ai-costume-gallery-zh](https://github.com/wangweihong/ai-costume-gallery-zh) 的界面和素材。内置 1,407 套服装，8 个分类，包含全部 WebP 缩略图、WebP 预览图和 PNG 原图，共 4,221 张图片，约 1.42 GiB。



## 每次运行随机：独立节点

添加 **image → Costume Gallery → Random Costume Gallery 随机服装图库**，将 `image` 接入后续工作流或 Preview Image。每次执行会重新随机抽取一张原图，无需点击随机按钮。`origin` 可选 `all`（全部）、`builtin`（内置）或 `user`（自定义）。保留原分类与关键词语义；自定义素材的英文关键词仍为空，不自动编造标签。

原 **CostumeGallery** 保留原有必填输入及前 6 个输出，新增可选 `language` 输入，并在最后追加 `costume` 名称输出。随机节点使用相同的 7 个输出。所有数据对应同一张实际抽中的素材；执行后显示编号和预览。两个节点的 `language` 同时控制界面、详情、描述及 `costume` 名称输出；英文模式使用已收录的英文元数据。

抽样可能偶然重复，不受浏览页面筛选影响；缺失原图会跳过，无可用图片时明确报错。保存的预览编号不参与下次抽样。需要固定结果时，将输出 `costume_id` 填入原节点。新节点本身不会启动或追加任务。

导入 [随机服装预览示例](example_workflows/random_costume_preview.json)，附同名 API 工作流。

![独立随机服装节点实测](docs/random-node.png)


## 单张上传自定义服装

1. 在独立图库或节点内嵌图库的顶部点击 **上传服装**。
2. 选择一张现成参考图，查看预览，填写名称。另一语言名称可选；未填写时沿用已有名称，不自动翻译。顶部 **中文 / English** 切换整张图库页面、筛选项、详情、帮助和上传控件，并同步节点的文本输出语言；切换后重新运行以更新输出。
3. 点击 **保存到图库**。成功后切换到“自定义”来源，清除分类、搜索等筛选，并打开新素材的大图。
4. 在大图中点击 **使用此服装 → ComfyUI**，写回当前节点；上传和选择都不会自动运行或排队。

服装分类可选，默认未分类。用户名称作为名称保存，不编造服装标签；自定义素材的 keywords_en 输出为空字符串。

支持静态 PNG、JPEG、WebP，一次一张，限制 **20 MiB、3200 万像素**。服务端检查实际内容，拒绝动画、损坏图片和越界路径。完整图片转为 PNG，保留尺寸和透明度；生成 800×1000 内的 WebP 预览、400×500 内的 WebP 缩略图。节点 IMAGE 输出的透明部分合成白色。上传仅导入图片，**不自动提取、抠图、去背景或修改人物**。自定义上传暂不含批量导入、编辑和删除；内置素材可通过编辑功能删除或替换。

自定义数据保存在 **`ComfyUI/user/costume_gallery/`**，独立于节点代码与内置素材；升级代码不会覆盖：

- `data/custom.json`：稳定 `u-` + UUID 编号、中英文名称、分类、原文件名、尺寸、上传时间和校验值。
- png/（PNG）、img/（WebP）、thumbs/（WebP）：完整图、预览与缩略图，按同一编号对应。
- 备份时请单独备份此用户目录。本地 ComfyUI 服务的客户端共享该库，没有账号或多用户权限隔离。
- 可用 `COMFYUI_COSTUME_GALLERY_USER_LIBRARY` 指定其他持久化、可写且容器内可见的目录。

新增 **全部来源 / 内置 / 自定义** 筛选与独立数量统计；缺少内置索引时仍可上传与使用自定义素材。保留现有 **6 个输出**、旧编号和连线兼容；自定义编号用于 `costume_id`，`source_id` 元数据为空，不冒用原站编号。

接口：`POST /costume_gallery/upload`，multipart 字段 `image`、`name`，可选 `other_name`、`language`（zh/en）、`category`。成功返回201及 `record`、包含 `records` 和 `meta` 的 `catalog`；失败返回错误代码。索引加锁并原子替换，失败回滚本次新文件。`GET /costume_gallery/catalog` 保持数组格式，并增加 `origin=builtin/user`；`GET /costume_gallery/meta` 提供数量与缺失状态。图片接口只读取索引中登记的文件。

![自定义上传预览与名称表单](docs/custom-upload-form.png)

![自定义素材大图](docs/custom-upload-selected.png)


## 安装与使用

1. 在 `ComfyUI/custom_nodes/` 目录执行 `git clone https://github.com/wangweihong/comfyui-costume-gallery.git`，或将整个节点文件夹放入该目录，包括 `library/`。不需要另行下载素材或运行安装脚本。
2. 重启 ComfyUI，强制刷新浏览器（Ctrl+Shift+R）。
3. 添加 **image → Costume Gallery → Costume Gallery 服装图库** 节点。
4. 点击“浏览服装图库 · 搜索 / 分类 / 关键词”，在弹窗中选择春装、夏装、秋装、冬装、内衣、派对、泳装或性感分类。支持中文、英文关键词、ID 搜索；空格分隔多个词时按同时包含筛选。
5. 点击服装卡片查看大图，再点“使用此服装 → ComfyUI”。节点保存 `costume_id` 并显示 PNG 原图。
6. 将 `image` 接到预览或图像编辑工作流，点击运行。浏览和选择服装不会自动执行生成任务。

导入 [`example_workflows/costume_gallery_preview.json`](example_workflows/costume_gallery_preview.json) 可直接测试原图预览与保存；同名 `.api.json` 为服务端格式，不依赖打开图库页面。

![服装节点原图输出实测](docs/comfyui_node_test.png)

## Qwen Image 2.1 · 换脸换装与姿态编辑

旧工作流已直接替换并按实际功能命名，不再沿用错误的 MOSS 名称。

| 工作流 | 可视化 JSON | API JSON | 作用 |
| --- | --- | --- | --- |
| 01 两阶段换脸换装与姿态编辑 | [导入](example_workflows/01_QwenImage2.1_换脸换装与姿态编辑_两阶段.json) | [API](example_workflows/01_QwenImage2.1_换脸换装与姿态编辑_两阶段.api.json) | 第一阶段换脸换装，第二阶段通过PoseStudio V2迁移姿势 |
| 02 三图换脸换装 | [导入](example_workflows/02_QwenImage2.1_换脸换装_三图参考.json) | [API](example_workflows/02_QwenImage2.1_换脸换装_三图参考.api.json) | 图1原人物、图2服装、图3目标人像，一次采样完成 |

01 需要同时安装 pose、portrait、costume 三个图库；02 只需要 portrait 和 costume。请先将[附带原人物图](example_workflows/assets/h3_bfs_original_teal_character_20261014.png)复制到 `ComfyUI/input/`，或在 Load Image 中选择自己的参考图。模型路径、参考职责和测试范围见[完整指南](example_workflows/qwen21_gallery_workflows.md)。

01 保留已经成功的第一阶段配置。第二阶段使用**图1姿势图库线稿、图2第一阶段解码成图**，仅第二阶段模型分支加载 QI2.1 PoseStudio V2 LoRA（强度1）。25步、CFG1、Euler/simple、固定种子2026103002。完整链路已实测，第一阶段输出与修复前结果的RGB像素完全相同；P003的背侧转身、回头和扶腰已跟随。其他姿势、手指与服装背面细节仍需检查。

![第一阶段人物与服装替换](docs/images/qwen21_gallery/stage1.png)

![第二阶段姿势编辑](docs/images/qwen21_gallery/stage2.png)

## 节点输出

| 输出 | 类型 | 内容 |
| --- | --- | --- |
| `image` | IMAGE | PNG 原图，RGB，保持原始尺寸；透明区域合成白色背景 |
| `width` / `height` | INT | 原始图片宽高 |
| `costume_id` | STRING | 服装编号，如 `SPR-0001` |
| `description` | STRING | 当前语言的分类及关键词 |
| `keywords_en` | STRING | 原始英文关键词 |
| `costume` | STRING | 当前语言的服装名称（内置素材使用逗号分隔关键词） |

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

```bash
node --test tests/test_random_frontend.cjs
```

## 名称输出与语言

固定和随机节点都支持 `language=zh/en`，语言随工作流保存。新增第 7 个 `costume` 输出，仅包含当前素材名称，前 6 个端口顺序不变。内置服装没有独立款式名，以已收录的服装关键词组成名称，用英文逗号分隔，不附加分类或编号。自定义素材使用用户填写的对应语言名称，未提供译文的自定义文字沿用原文。图库项目链接指向本仓库。

## 删除和替换内置素材

- 点击图库顶部 **编辑**，直接勾选卡片，再点击 **删除选中素材**。可以使用原有分类和搜索筛选，也可以全选当前结果；每张素材独立处理，不按名称或来源编号合组。自定义上传不参与内置素材管理。
- 大图中 **新窗口打开** 下方直接提供 **删除**、**替换**。删除会移除该素材的图片文件并释放空间；替换支持静态 PNG/JPEG/WebP，最多 20 MiB、3200 万像素，保留 ID 和分类等信息，同时更新预览与缩略图。
- 顶部 **管理内置素材** 只用于更新后的全局处理，不需要重新选图。分别决定以前删除的素材是否继续删除、以前替换的素材是否继续使用替换图，点击 **执行** 后显示删除、替换、保留和失败数量。选择保留内置素材会停止对应的后续操作；文件尚未恢复时会报告失败并保留处理记录，供更新素材后重试。

启动、浏览或更新后都不会自动删除或替换。记录保存在 `ComfyUI/user/costume_gallery/data/builtin_changes.json`，替换源文件保存在 `ComfyUI/user/costume_gallery/replacements/<id>/<revision>/`，备份时一起保存。同一服务的客户端共享这些数据。替换源和历史版本会保留；删除工作目录图片不会清理 Git 历史对象。

已删除 ID 在固定工作流中会明确报错，并被随机节点跳过；替换沿用原 ID，节点读取新图片。接口只处理登记的内置素材，拒绝符号链接和越界路径。部署后重启 ComfyUI、刷新页面启用新接口；接口尚未加载时新入口隐藏，不影响原有浏览功能。

开发接口：`GET /costume_gallery/manage/summary`；`POST /costume_gallery/manage/plan` 接受 `{ids, mode}` 或 `{choices: {deleted: "delete" / "keep", replaced: "replace" / "keep"}}`；`POST /costume_gallery/manage/apply` 接受 `{request, token}`；`POST /costume_gallery/manage/replacement` 接受 multipart `id`、`image`。
