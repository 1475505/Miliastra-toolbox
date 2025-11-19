#!/bin/bash
# 测试 RAG Chat API
# 使用方法: export DEEPSEEK_API_KEY=your_key && ./tests/test_api.sh [tests]
# 测试参数 (可选):
#   all  (默认) - 运行全部测试
#   1          - 只运行测试 1 (单轮对话)
#   2          - 只运行测试 2 (多轮对话)
#   3          - 只运行测试 3 (流式对话)
#   1,2,3      - 运行测试 1、2 和 3（逗号分隔）

# 检查环境变量
if [ -z "$DEEPSEEK_API_KEY" ]; then
    echo "❌ 错误: 未设置 DEEPSEEK_API_KEY 环境变量"
    echo "使用方法: export DEEPSEEK_API_KEY=your_key && ./tests/test_api.sh"
    exit 1
fi

echo "🔑 使用 API Key: ${DEEPSEEK_API_KEY:0:20}..."
echo ""

# 读取 HOST / PORT / BASE_URL
HOST=${HOST:-localhost}
PORT=${PORT:-8000}
BASE_URL=${BASE_URL:-http://${HOST}:${PORT}}

echo "🔍 使用 Base URL: ${BASE_URL}"

# 解析可选测试参数
TESTS=${1:-all}

# 检查 jq
if ! command -v jq >/dev/null 2>&1; then
  echo "⚠️ 未检测到 'jq'，输出将不会被格式化。建议在系统中安装 'jq'（sudo apt install jq）以便更好地查看 JSON 输出。"
fi

run_test_1() {
  echo "========================================="
  echo "测试 1: 单轮对话"
  echo "========================================="

  curl -s -X POST ${BASE_URL}/api/v1/rag/chat \
    -H "Content-Type: application/json" \
    -d "{
      \"message\": \"什么是节点图？\",
      \"conversation\": [],
      \"config\": {
        \"api_key\": \"$DEEPSEEK_API_KEY\",
        \"api_base_url\": \"https://api.deepseek.com/v1\",
        \"model\": \"deepseek-reasoner\"
      }
    }" | jq '.' || true
}

run_test_2() {
  echo -e "\n\n========================================="
  echo "测试 2: 多轮对话"
  echo "========================================="

  curl -s -X POST ${BASE_URL}/api/v1/rag/chat \
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
        \"model\": \"deepseek-reasoner\"
      }
    }" | jq '.' || true
}

run_test_3() {
  echo -e "\n\n========================================="
  echo "测试 3: 流式对话 (SSE)"
  echo "========================================="

  curl -s -N -X POST ${BASE_URL}/api/v1/rag/chat/stream \
    -H "Content-Type: application/json" \
    -d "{
      \"message\": \"我想做一个道具或者装备。当玩家获取这个道具或装备时，能实时检测背包货币数量，给游戏中的角色增加等同于货币数量的攻击力百分比，该怎么做?\",
      \"conversation\": [],
      \"config\": {
        \"api_key\": \"$DEEPSEEK_API_KEY\",
        \"api_base_url\": \"https://api.deepseek.com/v1\",
        \"model\": \"deepseek-chat\"
      }
    }"
}

echo ""
case "$TESTS" in
  all)
    run_test_1
    run_test_2
    run_test_3
    ;;
  1)
    run_test_1
    ;;
  2)
    run_test_2
    ;;
  3)
    run_test_3
    ;;
  *)
    # 支持逗号分隔的组成
    IFS=',' read -ra parts <<< "$TESTS"
    for p in "${parts[@]}"; do
      case "$p" in
        1) run_test_1 ;;
        2) run_test_2 ;;
        3) run_test_3 ;;
        *) echo "⚠️ 未知测试: $p" ;;
      esac
    done
    ;;
esac
