// Random-node messages extend the shared gallery vocabulary.
(function(root){
  const EN={
  "本次随机服装预览": "Random costume preview",
  "随机服装预览加载失败，请检查素材原图。": "The random preview could not load. Check the original image.",
  "上次运行结果": "Last execution result",
  "运行工作流后自动抽取服装": "A costume reference is drawn automatically when the workflow runs",
  "随机来源": "Random source",
  "点击骰子预览，或运行工作流自动抽取服装": "Click the dice to preview, or run the workflow to draw a costume",
  "正在抽取服装…": "Drawing a costume…",
  "🔒 已锁定": "🔒 Locked",
  "🎲 随机": "🎲 Random",
  "随机服装": "Draw a random costume",
  "仅更新此节点预览，不运行工作流": "Update this preview without running the workflow",
  "当前服装编号": "Current costume ID",
  "🔒 锁定随机": "🔒 Lock random selection",
  "随机失败，请重试": "Could not draw a costume. Try again",
  "请先点击骰子选择服装，再锁定": "Draw a costume before locking",
  "无效的服装编号": "Invalid costume ID",
  "all：全部；builtin：内置；user：自定义。": "all: all references; builtin: bundled; user: custom uploads.",
  "控制界面与文本输出语言，随工作流保存。": "Controls the UI and text output language. Saved with the workflow.",
  "当前选择的服装，锁定后运行工作流使用此图。": "The selected costume. Workflow runs keep this reference while locked.",
  "保持当前服装并禁用骰子。": "Keep the current costume and disable the dice.",
  "界面与提示语言": "UI / error language",
  "图像": "Image",
  "宽度": "Width",
  "高度": "Height",
  "服装编号": "Costume ID",
  "界面与输出语言": "UI / output language",
  "服装名称": "Costume name",
  "描述": "Description",
  "参考类型": "Reference type",
  "英文关键词": "English keywords"
};
  const LANGUAGE_KEY="costume-gallery-random-language";
  const normalize=value=>value==='en'?'en':'zh';
  function preferred(){try{return normalize(localStorage.getItem(LANGUAGE_KEY));}catch{return 'zh';}}
  function persist(value){try{localStorage.setItem(LANGUAGE_KEY,normalize(value));}catch{}}
  function translate(text,language){return language==='en'?(EN[text]??root.CostumeI18n?.translate(text,language)??text):text;}
  const api={preferred,persist,normalize,translate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RandomCostumeI18n=api;
})(typeof window!=='undefined'?window:globalThis);
