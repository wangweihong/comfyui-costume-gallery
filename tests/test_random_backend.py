"""Run with ComfyUI's Python to check real tensors and preserved output semantics."""
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
KIND=ROOT.name.removeprefix('comfyui-').removesuffix('-gallery')
NAME=KIND.capitalize()+'Gallery'

class RandomNodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if importlib.util.find_spec('torch') is None:raise unittest.SkipTest('Use the ComfyUI Python interpreter for tensor tests')
        from aiohttp import web
        spec=importlib.util.spec_from_file_location(KIND+'_random_tests',ROOT/'__init__.py',submodule_search_locations=[str(ROOT)])
        module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module
        server=types.ModuleType('server');server.PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef()))
        previous=sys.modules.get('server');sys.modules['server']=server
        try:spec.loader.exec_module(module)
        finally:
            if previous is None:sys.modules.pop('server',None)
            else:sys.modules['server']=previous
        cls.module=module;cls.catalog=module._random_catalog;cls.node=getattr(module,'Random'+NAME);cls.old=getattr(module,NAME)
        cls.sample=json.loads((cls.catalog.LIBRARY/cls.catalog.INDEX_FILE).read_text())[0]
    def setUp(self):
        from PIL import Image
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.previous=(self.catalog.LIBRARY,self.catalog.USER_LIBRARY)
        self.catalog.LIBRARY,self.catalog.USER_LIBRARY=self.root/'builtin',self.root/'user'
        self.builtin=dict(self.sample,id='BUILTIN-TEST',w=8,h=12,origin='builtin')
        for kind,field in self.catalog.ASSET_FIELDS.items():
            if kind in self.catalog.OPTIONAL_ASSETS and field not in self.builtin:continue
            suffix='.png' if kind==self.catalog.FULL_KIND else '.jpg' if KIND=='pose' and kind=='thumbs' else '.webp'
            self.builtin[field]=self.catalog.PREFIXES[kind]+'/'+self.builtin['id']+suffix
        index=self.catalog.LIBRARY/self.catalog.INDEX_FILE;index.parent.mkdir(parents=True);index.write_text(json.dumps([self.builtin]))
        self.full_field=self.catalog.ASSET_FIELDS[self.catalog.FULL_KIND]
        full=self.catalog.LIBRARY/self.builtin[self.full_field];full.parent.mkdir(parents=True);Image.new('RGB',(8,12),'red').save(full)
        out=BytesIO();Image.new('RGB',(10,14),'blue').save(out,format='PNG')
        self.custom=self.module.import_image(out.getvalue(),name='我的参考',other_name='My reference',filename='reference.png',root=self.catalog.USER_LIBRARY)
    def tearDown(self):
        self.catalog.LIBRARY,self.catalog.USER_LIBRARY=self.previous;self.catalog.records.cache_clear();self.temp.cleanup()
    def test_sources_missing_originals_and_custom_only_library(self):
        self.assertEqual({r['id'] for r in self.node._candidates()},{self.builtin['id'],self.custom['id']})
        self.assertEqual(self.node._candidates('builtin')[0]['id'],self.builtin['id']);self.assertEqual(self.node._candidates('user')[0]['id'],self.custom['id'])
        (self.catalog.LIBRARY/self.builtin[self.full_field]).unlink();self.assertEqual([r['id'] for r in self.node._candidates()],[self.custom['id']])
        (self.catalog.LIBRARY/self.catalog.INDEX_FILE).unlink();self.assertIs(self.node.VALIDATE_INPUTS(),True)
    def test_empty_invalid_and_escaping_paths_are_rejected(self):
        self.assertIn('无效',self.node.VALIDATE_INPUTS('bad'))
        full=self.catalog.USER_LIBRARY/self.custom[self.full_field];full.unlink();self.assertIn('没有可用',self.node.VALIDATE_INPUTS('user'));self.assertIn('No available',self.node.VALIDATE_INPUTS('user','en'))
        with self.assertRaises(ValueError):self.node().load_random('user')
        outside=self.root/'outside.png';outside.write_bytes(b'outside');full.symlink_to(outside)
        with self.assertRaises(ValueError):self.node._candidates('user')
    def test_each_execution_resamples_with_one_consistent_image_and_preserved_ports(self):
        choices=[self.custom,self.builtin,self.custom]
        with patch.object(self.module.random,'choice',side_effect=choices) as choose:results=[self.node().load_random(language='en') for _ in range(3)]
        self.assertEqual(choose.call_count,3)
        for item,chosen in zip(results,choices):
            result=item['result'];expected=getattr(self.old(),self.old.FUNCTION)(chosen['id'], language='en')
            self.assertEqual(len(result),len(self.old.RETURN_NAMES));self.assertEqual(result[1:],expected[1:]);self.assertTrue(result[0].equal(expected[0]))
            self.assertEqual(result[0].shape,(1,chosen['h'],chosen['w'],3));self.assertEqual(result[3],chosen['id']);self.assertEqual(item['ui'][KIND+'_id'],[chosen['id']])
            if chosen is self.custom:self.assertEqual(item['ui']['name'],['My reference'])
            if KIND=='costume' and chosen is self.custom:self.assertEqual(result[5],'')
    def test_fingerprints_are_fresh_and_json_safe_while_original_node_stays_fixed(self):
        values=[self.node.IS_CHANGED() for _ in range(4)];self.assertEqual(len(set(values)),4);json.dumps(values,allow_nan=False)
        self.assertEqual(set(self.old.INPUT_TYPES()['required']),{KIND+'_id'});self.assertNotIn('origin',self.old.INPUT_TYPES().get('optional',{}))
        self.assertEqual(self.old.IS_CHANGED(self.builtin['id']),self.old.IS_CHANGED(self.builtin['id']))
        a=getattr(self.old(),self.old.FUNCTION)(self.builtin['id']);b=getattr(self.old(),self.old.FUNCTION)(self.builtin['id']);self.assertIsInstance(a,tuple);self.assertEqual(a[1:],b[1:]);self.assertTrue(a[0].equal(b[0]));self.assertEqual(self.node.RETURN_NAMES,self.old.RETURN_NAMES)
    def test_candidate_scan_loads_and_validates_the_catalog_only_once(self):
        with patch.object(self.module,'records',wraps=self.module.records) as reader:
            self.node._candidates();self.assertEqual(reader.call_count,1)

    def test_language_controls_description_and_selected_name_for_fixed_and_random_nodes(self):
        loaders=(lambda lang:self.old().load_costume(self.builtin['id'],language=lang),lambda lang:self.node().load_random('builtin',lang)['result'])
        for load in loaders:
            zh,en=load('zh'),load('en')
            self.assertEqual(len(en),7)
            self.assertNotRegex(en[4],r'[\u3400-\u9fff]')
            self.assertNotRegex(en[6],r'[\u3400-\u9fff]')
            self.assertNotEqual(zh[4],en[4])
            self.assertNotEqual(zh[6],en[6])
            self.assertEqual(zh[1:4],en[1:4]);self.assertTrue(zh[0].equal(en[0]))
        self.assertEqual(self.old.RETURN_NAMES[-1],'costume')
        self.assertNotEqual(self.old.IS_CHANGED(self.builtin['id'],'en'),self.old.IS_CHANGED(self.builtin['id'],'zh'))
        self.assertIs(self.old.VALIDATE_INPUTS(self.builtin['id'],'en'),True)
        self.assertEqual(self.old().load_costume(self.custom['id'],'en')[-1],'My reference')



    def test_locked_selection_preserves_all_outputs_without_resampling(self):
        fixed = self.module.CostumeGallery
        identity = self.custom['id']
        inputs = dict(origin='builtin', language='en', costume_id=identity, locked=True)

        with patch.object(self.module.random, 'choice', side_effect=AssertionError('Locked selection must not draw')):
            self.assertIs(self.node.VALIDATE_INPUTS(**inputs), True)
            result = [self.node().load_random(**inputs) for _ in range(3)]
            fingerprint = self.node.IS_CHANGED(**inputs)
            self.assertEqual(fingerprint, self.node.IS_CHANGED(**inputs))
        expected = fixed().load_costume(identity, 'en')
        for item in result:
            self.assertTrue(item['result'][0].equal(expected[0]))
            self.assertEqual(item['result'][1:], expected[1:])
            self.assertEqual(item['ui']['costume_id'], [identity])
        self.assertNotEqual(fingerprint, self.node.IS_CHANGED(**dict(inputs, language='zh')))
        from PIL import Image
        Image.new('RGB', (10, 14), 'green').save(self.catalog.USER_LIBRARY / self.custom['原图'])
        self.assertNotEqual(fingerprint, self.node.IS_CHANGED(**inputs))
        with patch.object(self.module.random, 'choice', return_value=self.builtin) as choose:
            self.assertEqual(self.node().load_random(costume_id=identity)['result'][3], self.builtin['id'])
            choose.assert_called_once()

    def test_missing_locked_images_fail_without_drawing_replacements(self):
        with patch.object(self.module.random, 'choice', side_effect=AssertionError('Must not draw')):
            self.assertIn('先点击骰子', self.node.VALIDATE_INPUTS(locked=True))
            with self.assertRaises(ValueError):
                self.node().load_random(locked=True)
            identity = self.custom['id']
            (self.catalog.USER_LIBRARY / self.custom['原图']).unlink()
            self.assertIsNot(self.node.VALIDATE_INPUTS(costume_id=identity, locked=True), True)
            with self.assertRaises((ValueError, FileNotFoundError)):
                self.node().load_random(costume_id=identity, locked=True)

    def test_dice_http_filters_and_no_repeat_never_load_image_tensors(self):
        import asyncio
        async def scenario():
            from aiohttp import web
            from aiohttp.test_utils import TestClient, TestServer
            app = web.Application()
            app.add_routes(self.module.routes)
            fixed = self.module.CostumeGallery
            with patch.object(fixed, 'load_costume', side_effect=AssertionError('Dice must not load image tensors')):
                async with TestClient(TestServer(app)) as client:
                    response = await client.get('/costume_gallery/random', params={'exclude_id': self.builtin['id'], 'language': 'en'})
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
                    data = await response.json()
                    self.assertEqual(data['costume_id'], self.custom['id'])
                    self.assertEqual(data['name'], self.custom['name_en'])
                    response = await client.get('/costume_gallery/random', params={'origin': 'builtin', 'exclude_id': self.builtin['id']})
                    self.assertEqual(response.status, 200)
                    self.assertEqual((await response.json())['costume_id'], self.builtin['id'])
                    response = await client.get('/costume_gallery/random', params={'origin': 'bad'})
                    self.assertEqual(response.status, 400)
                    self.assertIn('error', await response.json())

        asyncio.run(scenario())

    def test_cleaned_originals_cannot_reenter_the_random_pool(self):
        for state in ('thumb_only', 'removed'):
            row = dict(self.catalog.costume(self.builtin['id']), management_state=state)
            with patch.object(self.module, 'records', return_value=[row]):
                with self.assertRaises(ValueError):
                    self.node._candidates('builtin')


if __name__=='__main__':unittest.main()
