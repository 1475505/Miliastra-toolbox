#!/bin/bash
# 测试 RAG Chat API
# 使用方法: export DEEPSEEK_API_KEY=your_key && ./tests/test_api.sh

# 检查环境变量
if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "❌ 错误: 未设置 DEEPSEEK_API_KEY 环境变量"
    echo "使用方法: export DEEPSEEK_API_KEY=your_key && ./tests/test_api.sh"
    exit 1
fi

echo "🔑 使用 API Key: ${DEEPSEEK_API_KEY:0:20}..."
echo ""

# 测试 1: 单轮对话
echo "========================================="
echo "测试 1: 单轮对话"
echo "========================================="

curl -X POST http://localhost:8000/api/v1/rag/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"什么是节点图？\",
    \"conversation\": [],
    \"config\": {
      \"api_key\": \"$DEEPSEEK_API_KEY\",
      \"api_base_url\": \"https://api.deepseek.com/v1\",
      \"model\": \"deepseek-chat\"
    }
  }" | jq '.'

echo -e "\n\n========================================="
echo "测试 2: 多轮对话"
echo "========================================="

# 测试 2: 多轮对话
curl -X POST http://localhost:8000/api/v1/rag/chat \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"它有什么用？\",
    \"conversation\": [
      {
        \"role\": \"user\",
        \"content\": \"什么是节点图？\"
      },
      {
        \"role\": \"assistant\",
        \"content\": \"节点图是千星沙箱编辑器中用于实现游戏逻辑的可视化编程工具。\"
      }
    ],
    \"config\": {
      \"api_key\": \"$DEEPSEEK_API_KEY\",
      \"api_base_url\": \"https://api.deepseek.com/v1\",
      \"model\": \"deepseek-chat\"
    }
  }" | jq '.'
