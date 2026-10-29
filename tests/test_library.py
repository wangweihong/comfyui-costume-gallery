import json
import unittest
from pathlib import Path

class BundledLibraryTests(unittest.TestCase):
    def test_every_record_has_original_preview_and_thumbnail(self):
        root=Path(__file__).resolve().parents[1]/'library'
        rows=json.loads((root/'data/costume-zh.json').read_text())
        self.assertEqual(len(rows),1407)
        self.assertEqual(len({r['id'] for r in rows}),1407)
        for r in rows:
            for field in ('缩略图','预览图','原图'):
                with self.subTest(id=r['id'],field=field):
                    self.assertTrue((root/r[field]).is_file(),r[field])
        for kind in ('thumbs','img','png'):
            self.assertEqual(len(list((root/kind).iterdir())),1407)
