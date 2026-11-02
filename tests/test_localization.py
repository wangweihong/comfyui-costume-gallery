import importlib.util,re,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('localized_catalog',ROOT/'catalog.py');catalog=importlib.util.module_from_spec(spec);spec.loader.exec_module(catalog)
class LocalizationTests(unittest.TestCase):
 def test_all_builtin_names_and_metadata_have_english_and_searchable_names(self):
  rows=[row for row in catalog.records() if row['origin']=='builtin'];self.assertTrue(rows)
  for row in rows:
   with self.subTest(id=row['id']):
    self.assertTrue(row['name_en']);self.assertTrue(row['name_zh'])
    self.assertNotRegex(row['name_en'],r'[\u3400-\u9fff]')
    self.assertIn(row['name_en'].lower(),row.get('search',row.get('检索','')))
    for key in ('section_en','hair_en','style_en','category_en'):
     if key in row:self.assertNotRegex(row[key],r'[\u3400-\u9fff]')
if __name__=='__main__':unittest.main()
