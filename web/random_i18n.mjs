// Translations are scoped to the new random node; existing selectors are unchanged.
(function(root){
  const EN={
  "本次随机服装预览": "Random costume preview",
  "随机服装预览加载失败，请检查素材原图。": "The random preview could not load. Check the original image.",
  "上次运行结果": "Last execution result",
  "运行工作流后自动抽取服装": "A costume reference is drawn automatically when the workflow runs",
  "随机来源": "Random source",
  "界面与提示语言": "UI / error language",
  "图像": "Image",
  "宽度": "Width",
  "高度": "Height",
  "服装编号": "Costume ID",
  "描述": "Description",
  "参考类型": "Reference type",
  "英文关键词": "English keywords"
};
  const LANGUAGE_KEY="costume-gallery-random-language";
  const normalize=value=>value==='en'?'en':'zh';
  function preferred(){try{return normalize(localStorage.getItem(LANGUAGE_KEY));}catch{return 'zh';}}
  function persist(value){try{localStorage.setItem(LANGUAGE_KEY,normalize(value));}catch{}}
  function translate(text,language){return language==='en'?(EN[text]??text):text;}
  const api={preferred,persist,normalize,translate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RandomCostumeI18n=api;
})(typeof window!=='undefined'?window:globalThis);
