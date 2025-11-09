"""
集成测试 - 需要真实的 DeepSeek API Key
在 backend/.env 中配置: DEEPSEEK_API_KEY=your_key
运行命令: pytest tests/test_integration.py -v -s
"""
import pytest
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载项目根目录的 .env 文件
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

import sys
sys.path.insert(0, str(Path(__file__).parent.parent / 'rag'))

from chatEngine import ChatEngine


@pytest.fixture
def deepseek_config():
    """从环境变量获取 DeepSeek 配置"""
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        pytest.skip("未设置 DEEPSEEK_API_KEY 环境变量")
    
    return {
        "api_key": api_key,
        "api_base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat"
    }


@pytest.fixture
def chat_engine():
    """创建 ChatEngine 实例"""
    return ChatEngine()


def test_simple_query(chat_engine, deepseek_config):
    """测试简单查询"""
    result = chat_engine.chat(
        message="什么是节点图？",
        conversation=[],
        config=deepseek_config
    )
    
    assert "answer" in result
    assert len(result["answer"]) > 0
    print(f"\n回答: {result['answer'][:100]}...")


def test_sources_returned(chat_engine, deepseek_config):
    """测试返回引用来源"""
    result = chat_engine.chat(
        message="什么是单位？",
        conversation=[],
        config=deepseek_config
    )
    
    assert "sources" in result
    assert len(result["sources"]) > 0
    
    # 验证来源格式
    source = result["sources"][0]
    assert "title" in source
    assert "doc_id" in source
    assert "similarity" in source
    assert "text_snippet" in source
    
    print(f"\n来源数量: {len(result['sources'])}")
    print(f"第一个来源: {source['title']}")


def test_token_counting(chat_engine, deepseek_config):
    """测试 token 统计"""
    result = chat_engine.chat(
        message="什么是玩家？",
        conversation=[],
        config=deepseek_config
    )
    
    assert "tokens" in result
    assert result["tokens"] > 0
    
    print(f"\n消耗 tokens: {result['tokens']}")


def test_conversation_history(chat_engine, deepseek_config):
    """测试对话历史功能"""
    # 第一轮
    result1 = chat_engine.chat(
        message="什么是角色？",
        conversation=[],
        config=deepseek_config
    )
    
    # 第二轮（带历史）
    conversation = [
        {"role": "user", "content": "什么是角色？"},
        {"role": "assistant", "content": result1["answer"]}
    ]
    
    result2 = chat_engine.chat(
        message="它有什么用？",  # 代词指代测试
        conversation=conversation,
        config=deepseek_config
    )
    
    assert len(result2["answer"]) > 0
    print(f"\n第二轮回答: {result2['answer'][:100]}...")
