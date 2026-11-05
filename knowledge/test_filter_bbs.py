import unittest
from filter_bbs import BbsRules, filter_markdown


class FilterBbsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rules: BbsRules = {'postId': '69834163', 'sinceFloor': 1316, 'excludeFloorIds': [1317]}
        self.header = '---\nurl: https://www.miyoushe.com/ys/article/69834163\n---\n'
        self.source = self.header + '\n# Q. Lua\nA. 脚本答案\n来自：米游社问答楼1317\n\n# Q. 扰动装置\nA. 普通答案\n来自：米游社问答楼1316\n'

    def test_excludes_whole_floor_and_preserves_other_answers(self) -> None:
        result, kept, excluded = filter_markdown(self.source, self.rules)
        self.assertEqual((kept, excluded), (1, 1))
        self.assertNotIn('脚本答案', result)
        self.assertIn('普通答案', result)
        self.assertTrue(result.startswith(self.header))

    def test_missing_reviewed_floor_fails(self) -> None:
        with self.assertRaises(ValueError):
            filter_markdown(self.source.replace('1317', '1320'), self.rules)

    def test_wrong_post_or_duplicate_floor_fails(self) -> None:
        with self.assertRaises(ValueError):
            filter_markdown(self.source.replace('69834163', '123'), self.rules)
        with self.assertRaises(ValueError):
            filter_markdown(self.source.replace('1316', '1317'), self.rules)


if __name__ == '__main__':
    unittest.main()
