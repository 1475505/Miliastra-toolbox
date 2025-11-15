"""
素材分享 API 测试

测试数据模型和 API 端点
运行命令: pytest tests/test_share_api.py -v
"""
import pytest
from fastapi.testclient import TestClient
from main import app
from share.router import ShareCreate, ShareResponse

client = TestClient(app)


class TestShareModel:
    """测试数据模型"""
    
    def test_share_create_valid(self):
        """测试有效的分享创建请求"""
        share = ShareCreate(
            title="角色制作教程",
            description="详细介绍角色制作流程",
            bilibili_url="https://www.bilibili.com/video/BV1xx411c7mD",
            gil_url="https://gil.miliastra.com/share/123"
        )
        
        assert share.title == "角色制作教程"
        assert share.description == "详细介绍角色制作流程"
        assert share.bilibili_url is not None
        assert share.gil_url is not None
    
    def test_share_create_minimal(self):
        """测试最小字段的分享创建"""
        share = ShareCreate(title="测试标题")
        
        assert share.title == "测试标题"
        assert share.description is None
        assert share.bilibili_url is None
        assert share.gil_url is None
    
    def test_share_create_missing_title(self):
        """测试缺少标题的分享创建"""
        with pytest.raises(Exception):
            ShareCreate()
    
    def test_share_response_structure(self):
        """测试响应模型结构"""
        response = ShareResponse(
            id=1,
            created_at="2024-01-01T12:00:00Z",
            title="测试分享",
            description="测试描述",
            bilibili_url="https://www.bilibili.com/video/test",
            gil_url="https://gil.miliastra.com/test"
        )
        
        assert response.id == 1
        assert response.title == "测试分享"
        assert response.created_at is not None


class TestShareAPI:
    """测试 API 端点"""
    
    def test_create_share(self):
        """测试创建分享"""
        response = client.post("/api/v1/shares", json={
            "title": "测试分享",
            "description": "这是一个测试",
            "bilibili_url": "https://www.bilibili.com/video/test",
            "gil_url": "https://gil.miliastra.com/test"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["title"] == "测试分享"
        assert "id" in data["data"]
        assert "created_at" in data["data"]
    
    def test_create_share_empty_title(self):
        """测试创建空标题的分享（应失败）"""
        response = client.post("/api/v1/shares", json={
            "title": "",
            "description": "测试空标题"
        })
        
        assert response.status_code == 400
    
    def test_list_shares(self):
        """测试查询所有分享"""
        response = client.get("/api/v1/shares")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "total" in data["data"]
        assert "items" in data["data"]
        assert isinstance(data["data"]["items"], list)
    
    def test_search_by_title(self):
        """测试按标题筛选"""
        # 先创建一个测试数据
        client.post("/api/v1/shares", json={
            "title": "唯一测试标题12345",
            "description": "用于测试搜索"
        })
        
        # 按标题搜索
        response = client.get("/api/v1/shares?title=唯一测试标题")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        
        # 应该能找到刚创建的
        items = data["data"]["items"]
        found = any("唯一测试标题12345" in (item["title"] or "") for item in items)
        assert found
    
    def test_pagination(self):
        """测试分页"""
        response = client.get("/api/v1/shares?limit=5&offset=0")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["data"]["items"]) <= 5


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
