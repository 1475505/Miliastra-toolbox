"""
笔记 API 测试脚本（Python版）
"""
import requests
import json

BASE_URL = 'http://localhost:8000/api/v1'

def print_response(title, response):
    """打印响应"""
    print(f"\n{'='*60}")
    print(f"{title}")
    print('='*60)
    print(f"Status Code: {response.status_code}")
    try:
        print(json.dumps(response.json(), indent=2, ensure_ascii=False))
    except:
        print(response.text)
    print()

def test_notes_api():
    """测试笔记API"""
    
    # 1. 创建笔记
    print_response(
        "1. 创建笔记",
        requests.post(f'{BASE_URL}/notes', json={
            'author': '张三',
            'content': '小地图可以通过右键点击设置显示范围，非常实用！'
        })
    )
    
    # 2. 创建第二条笔记
    print_response(
        "2. 创建第二条笔记",
        requests.post(f'{BASE_URL}/notes', json={
            'author': '李四',
            'content': '技能动画可以在节点图中自定义，效果很棒！'
        })
    )
    
    # 3. 查询笔记列表
    print_response(
        "3. 查询笔记列表（默认按点赞数排序）",
        requests.get(f'{BASE_URL}/notes')
    )
    
    # 4. 修改笔记
    print_response(
        "4. 修改笔记 ID=1",
        requests.put(f'{BASE_URL}/notes/1', json={
            'content': '小地图可以通过右键点击设置显示范围和透明度，非常实用！'
        })
    )
    
    # 5. 点赞笔记
    print_response(
        "5. 为笔记 ID=1 点赞",
        requests.post(f'{BASE_URL}/notes/1/like')
    )
    
    # 6. 再次点赞
    print_response(
        "6. 再次为笔记 ID=1 点赞",
        requests.post(f'{BASE_URL}/notes/1/like')
    )
    
    # 7. 为第二条笔记点赞多次
    print("7. 为笔记 ID=2 点赞（点3次）")
    for i in range(3):
        response = requests.post(f'{BASE_URL}/notes/2/like')
        print(f"  第{i+1}次:", response.json())
    print()
    
    # 8. 查询笔记列表（按点赞数排序）
    print_response(
        "8. 查询笔记列表（按点赞数排序）",
        requests.get(f'{BASE_URL}/notes?sort_by=likes')
    )
    
    # 9. 查询笔记列表（按创建时间排序）
    print_response(
        "9. 查询笔记列表（按创建时间排序）",
        requests.get(f'{BASE_URL}/notes?sort_by=created_at')
    )
    
    # 10. 搜索笔记
    print_response(
        "10. 搜索笔记（关键词：小地图）",
        requests.get(f'{BASE_URL}/notes?search=小地图')
    )
    
    # 11. 获取单个笔记详情
    print_response(
        "11. 获取笔记 ID=1 的详情",
        requests.get(f'{BASE_URL}/notes/1')
    )
    
    # 12. 获取不存在的笔记
    print_response(
        "12. 获取不存在的笔记 ID=999",
        requests.get(f'{BASE_URL}/notes/999')
    )
    
    # 13. 测试只修改作者
    print_response(
        "13. 只修改作者（ID=1）",
        requests.put(f'{BASE_URL}/notes/1', json={
            'author': '张三（更新）'
        })
    )
    
    # 14. 测试创建空内容笔记（应该失败）
    print_response(
        "14. 创建空内容笔记（应该失败）",
        requests.post(f'{BASE_URL}/notes', json={
            'author': '王五',
            'content': ''
        })
    )
    
    print("="*60)
    print("测试完成！")
    print("="*60)


if __name__ == '__main__':
    test_notes_api()
