import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('catalog', Path(__file__).resolve().parents[1] / 'catalog.py')
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)

class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_library = catalog.LIBRARY
        catalog.LIBRARY = Path(self.temp.name)
        (catalog.LIBRARY / 'data').mkdir()
        for kind in catalog.FIELDS: (catalog.LIBRARY / kind).mkdir()
        row = {'id': 'SPR-0001', '原图': 'png/SPR-0001.png', '预览图': 'img/SPR-0001.webp', '缩略图': 'thumbs/SPR-0001.webp'}
        (catalog.LIBRARY / 'data/costume-zh.json').write_text(json.dumps([row]))
        for field in catalog.FIELDS.values(): (catalog.LIBRARY / row[field]).write_bytes(b'fixture')
        catalog.records.cache_clear(); catalog.index.cache_clear()

    def tearDown(self):
        catalog.LIBRARY = self.old_library
        catalog.records.cache_clear(); catalog.index.cache_clear()
        self.temp.cleanup()

    def test_all_three_versions_are_allowlisted(self):
        for kind, name in [('png','SPR-0001.png'), ('img','SPR-0001.webp'), ('thumbs','SPR-0001.webp')]:
            self.assertEqual(catalog.asset(kind,name).read_bytes(),b'fixture')

    def test_rejects_unknown_paths_ids_and_extensions(self):
        for kind,name in [('png','../SPR-0001.png'),('png','SPR-0001.webp'),('data','costume-zh.json'),('png','SPR-9999.png'),('png','..\\SPR-0001.png'),('png','/etc/passwd')]:
            with self.subTest(kind=kind,name=name), self.assertRaises(ValueError): catalog.asset(kind,name)

    def test_missing_original_is_actionable(self):
        (catalog.LIBRARY/'png/SPR-0001.png').unlink()
        with self.assertRaisesRegex(FileNotFoundError,'library/png/SPR-0001.png.*完整'): catalog.asset('png','SPR-0001.png')

    def test_external_symlink_is_rejected(self):
        p=catalog.LIBRARY/'png/SPR-0001.png';p.unlink();p.symlink_to('/etc/passwd')
        with self.assertRaises(ValueError): catalog.asset('png','SPR-0001.png')

    def test_metadata_cannot_allow_external_path(self):
        row={'id':'SPR-0001','原图':'../secret.png'}
        (catalog.LIBRARY/'data/costume-zh.json').write_text(json.dumps([row]));catalog.records.cache_clear();catalog.index.cache_clear()
        with self.assertRaises(ValueError): catalog.asset('png','SPR-0001.png')
