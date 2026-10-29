import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../web/costume_gallery.js', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gm, '');

async function createPreview() {
  let extension;
  class Element {
    constructor() { this.style = {}; this.children = []; this.attributes = {}; }
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  const widget = { name: 'costume_id', value: 'SPR-0001' };
  class Node {
    constructor() { this.widgets = [widget]; }
    addWidget() {}
    addDOMWidget(name, type, element) { this.previewBox = element; }
    setSize() {}
    setDirtyCanvas() {}
  }
  vm.runInNewContext(code, {
    app: { registerExtension(value) { extension = value; }, graph: { change() {} } },
    api: { apiURL(path) { return '/api' + path; } },
    document: { createElement() { return new Element(); } },
    window: { removeEventListener() {} },
  });
  await extension.beforeRegisterNodeDef(Node, { name: 'CostumeGallery' });
  const node = new Node();
  node.onNodeCreated();
  const [image, status] = node.previewBox.children;
  return { widget, image, status };
}

test('missing original shows the exact path and repair instructions instead of a blank node', async () => {
  const { image, status } = await createPreview();
  assert.equal(image.src, '/api/costume_gallery/assets/png/SPR-0001.png');
  image.onerror();
  assert.equal(image.style.display, 'none');
  assert.equal(status.style.display, 'grid');
  assert.match(status.textContent, /library\/png\/SPR-0001\.png/);
  assert.match(status.textContent, /完整图库/);
  assert.equal(status.attributes.role, 'status');
});

test('a successful selection clears the previous error and displays the original', async () => {
  const { widget, image, status } = await createPreview();
  image.onerror();
  widget.value = 'SPR-0002';
  widget.callback();
  image.onload();
  assert.equal(image.style.display, 'block');
  assert.equal(status.style.display, 'none');
  assert.equal(image.src, '/api/costume_gallery/assets/png/SPR-0002.png');
});

test('an older request cannot blank a newly selected pose', async () => {
  const { widget, image, status } = await createPreview();
  const previousError = image.onerror;
  widget.value = 'SPR-0002';
  widget.callback();
  previousError();
  assert.equal(image.style.display, 'block');
  assert.equal(status.style.display, 'none');
});
