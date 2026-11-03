"""Deletion/replacement persistence against a temporary synthetic library only."""
from io import BytesIO
import importlib
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
KIND=ROOT.name.removeprefix('comfyui-').removesuffix('-gallery')
PACKAGE=KIND+'_management_tests'
package=types.ModuleType(PACKAGE);package.__path__=[str(ROOT)];sys.modules[PACKAGE]=package
c=importlib.import_module(PACKAGE+'.catalog');m=importlib.import_module(PACKAGE+'.management')
u=importlib.import_module(PACKAGE+'.uploads')

def picture(color='red',size=(24,36),format='PNG'):
    out=BytesIO();Image.new('RGB',size,color).save(out,format=format);return out.getvalue()

class ManagementTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.previous=c.LIBRARY,c.USER_LIBRARY;c.LIBRARY,c.USER_LIBRARY=self.root/'library',self.root/'user'
        sample=json.loads((ROOT/'library'/c.INDEX_FILE).read_text())[0]
        self.rows=[]
        for identity in ['builtin-a','builtin-b']:
            row=dict(sample,id=identity)
            for kind,field in c.ASSET_FIELDS.items():
                row[field]=f'{c.PREFIXES[kind]}/{identity}{m.SUFFIXES[kind]}'
                target=m.destination(row,kind);target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes(picture(format='PNG' if kind==c.FULL_KIND else 'WEBP'))
            self.rows.append(row)
        index=c.LIBRARY/c.INDEX_FILE;index.parent.mkdir(parents=True);index.write_text(json.dumps(self.rows))
        self.index_bytes=index.read_bytes()
        self.originals={(row['id'],kind):m.destination(row,kind).read_bytes() for row in self.rows for kind in m.SUFFIXES}
    def tearDown(self):
        c.LIBRARY,c.USER_LIBRARY=self.previous
        (c._read_library if KIND=='hairstyle' else c._read_index).cache_clear()
        self.temp.cleanup()
    def execute(self,ids=None,mode=None,choices=None):
        plan=m.make_plan(ids,mode,choices);return m.apply_plan(plan['request'],plan['token'])
    def update(self):
        for row in self.rows:
            for kind in m.SUFFIXES:m.destination(row,kind).write_bytes(self.originals[row['id'],kind])
    def test_reads_and_preview_never_change_files(self):
        m.library_status();c.browser_payload();plan=m.make_plan(['builtin-a'],'removed')
        self.assertEqual(plan['file_count'],len(c.ASSET_FIELDS));self.assertFalse(c.USER_LIBRARY.exists())
        for row in self.rows:
            for kind in m.SUFFIXES:self.assertEqual(m.destination(row,kind).read_bytes(),self.originals[row['id'],kind])
    def test_delete_removes_all_registered_assets_and_skips_custom_images(self):
        custom=u.import_image(picture('green'),name='My reference',filename='ref.png',root=c.USER_LIBRARY)
        before=(c.USER_LIBRARY/custom[c.ASSET_FIELDS[c.FULL_KIND]]).read_bytes()
        result=self.execute(['builtin-a'],'removed');self.assertFalse(result['failures'])
        for kind in m.SUFFIXES:self.assertFalse(m.destination(self.rows[0],kind).exists())
        self.assertNotIn('builtin-a',[r['id'] for r in c.records()]);self.assertEqual(len(m.library_status()['records']),2)
        with self.assertRaisesRegex(ValueError,'素材已删除'):getattr(c,KIND)('builtin-a')
        self.assertEqual((c.USER_LIBRARY/custom[c.ASSET_FIELDS[c.FULL_KIND]]).read_bytes(),before)
        self.assertEqual((c.LIBRARY/c.INDEX_FILE).read_bytes(),self.index_bytes)
        with self.assertRaises(m.ManagementError):m.make_plan([custom['id']],'removed')
    def test_replacement_preserves_id_and_rebuilds_registered_derivatives(self):
        plan=m.stage_replacement('builtin-a',picture('blue',(40,60)))
        self.assertEqual(m.destination(self.rows[0],c.FULL_KIND).read_bytes(),self.originals['builtin-a',c.FULL_KIND])
        self.assertFalse(m.apply_plan(plan['request'],plan['token'])['failures'])
        rule=c.management_rules()['builtin-a']
        for kind in m.SUFFIXES:
            self.assertEqual(m.digest(m.destination(self.rows[0],kind).read_bytes()),rule['hashes'][kind])
            self.assertTrue(m.replacement_path('builtin-a',rule,kind).is_file())
        row=getattr(c,KIND)('builtin-a');self.assertEqual((row['w'],row['h']),(40,60))
        for kind in m.SUFFIXES:self.assertEqual(m.destination(self.rows[1],kind).read_bytes(),self.originals['builtin-b',kind])
    def test_update_processing_is_explicit_and_all_four_choices_work(self):
        for deletion in ['delete','keep']:
            for replacement in ['replace','keep']:
                with self.subTest(deleted=deletion,replaced=replacement):
                    m.save_rules({});self.update();self.execute(['builtin-a'],'removed')
                    plan=m.stage_replacement('builtin-b',picture('blue'));m.apply_plan(plan['request'],plan['token'])
                    replacement_hash=c.management_rules()['builtin-b']['hashes'][c.FULL_KIND]
                    self.assertEqual(m.update_summary()['deleted_count'],1);self.assertEqual(m.update_summary()['replaced_count'],1)
                    self.update();m.library_status();c.browser_payload()
                    self.assertTrue(m.destination(self.rows[0],c.FULL_KIND).exists())
                    result=self.execute(choices={'deleted':deletion,'replaced':replacement});self.assertFalse(result['failures'])
                    self.assertEqual(m.destination(self.rows[0],c.FULL_KIND).exists(),deletion=='keep')
                    expected=replacement_hash if replacement=='replace' else m.digest(self.originals['builtin-b',c.FULL_KIND])
                    self.assertEqual(m.digest(m.destination(self.rows[1],c.FULL_KIND).read_bytes()),expected)
                    self.assertEqual('builtin-a' in c.management_rules(),deletion=='delete')
                    self.assertEqual('builtin-b' in c.management_rules(),replacement=='replace')
    def test_keep_missing_assets_reports_failure_without_forgetting_the_operation(self):
        self.execute(['builtin-a'],'removed');result=self.execute(choices={'deleted':'keep','replaced':'keep'})
        self.assertEqual(result['failures'],[{'id':'builtin-a','error':'update_required'}])
        self.assertEqual(c.management_rules()['builtin-a']['mode'],'removed')
    def test_stale_plan_and_unsafe_paths_never_delete_files(self):
        plan=m.make_plan(['builtin-a'],'removed');m.destination(self.rows[0],c.FULL_KIND).write_bytes(picture('green'))
        with self.assertRaisesRegex(m.ManagementError,'plan_changed'):m.apply_plan(plan['request'],plan['token'])
        self.assertFalse(c.USER_LIBRARY.exists())
        target=m.destination(self.rows[0],c.FULL_KIND);target.unlink();target.symlink_to(m.destination(self.rows[1],c.FULL_KIND))
        with self.assertRaisesRegex(m.ManagementError,'unsafe_path'):m.make_plan(['builtin-a'],'removed')
        self.assertTrue(m.destination(self.rows[1],c.FULL_KIND).is_file())
    def test_invalid_replacement_and_failed_manifest_commit_preserve_builtins(self):
        with self.assertRaises(u.UploadError):m.stage_replacement('builtin-a',b'bad')
        with patch.object(m,'save_rules',side_effect=OSError('disk full')),self.assertRaises(OSError):m.stage_replacement('builtin-a',picture('blue'))
        self.assertEqual(c.management_rules(),{})
        for kind in m.SUFFIXES:self.assertEqual(m.destination(self.rows[0],kind).read_bytes(),self.originals['builtin-a',kind])
    def test_corrupt_record_and_orphan_ids_are_not_applied_to_other_assets(self):
        m.save_rules({'old-id':{'mode':'removed'}});self.assertEqual(m.make_plan()['orphan_ids'],['old-id']);self.execute()
        self.assertIn('old-id',c.management_rules())
        path=c.USER_LIBRARY/'data/builtin_changes.json';path.write_text('{"version":1,"rules":{"builtin-a":{"mode":"replace","revision":"../../escape"}}}')
        with self.assertRaises(ValueError):self.execute()
        self.assertTrue(m.destination(self.rows[0],c.FULL_KIND).exists())

if __name__=='__main__':unittest.main()
