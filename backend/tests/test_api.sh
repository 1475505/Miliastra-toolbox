#!/bin/bash
# 测试 RAG Chat API 和笔记 API
# 使用方法: export DEEPSEEK_API_KEY=your_key && ./tests/test_api.sh [tests]
# 测试参数 (可选):
#   all  (默认) - 运行全部测试
#   rag        - 只运行 RAG 测试
#   notes      - 只运行笔记 API 测试
#   1          - 只运行测试 1 (单轮对话)
#   2          - 只运行测试 2 (多轮对话)
#   3          - 只运行测试 3 (流式对话)
#   4          - 只运行测试 4 (笔记 API)
#   1,2,3,4    - 运行指定测试（逗号分隔）

# 检查环境变量（仅 RAG 测试需要）
check_deepseek_key() {
    if [ -z "$DEEPSEEK_API_KEY" ]; then
        echo "❌ 错误: 未设置 DEEPSEEK_API_KEY 环境变量"
        echo "使用方法: export DEEPSEEK_API_KEY=your_key && ./tests/test_api.sh"
        exit 1
    fi
}

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
  check_deepseek_key
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
  check_deepseek_key
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
  check_deepseek_key
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

run_test_4() {
  echo -e "\n\n========================================="
  echo "测试 4: 笔记 API 端对端测试"
  echo "========================================="
  
  echo -e "\n--- 4.1 创建笔记 ---"
  NOTE_RESPONSE=$(curl -s -X POST ${BASE_URL}/api/v1/notes \
    -H "Content-Type: application/json" \
    -d '{
      "author": "测试用户",
      "content": "小地图可以通过右键点击设置显示范围，非常实用！"
    }')
  
  echo "$NOTE_RESPONSE" | jq '.' || echo "$NOTE_RESPONSE"
  NOTE_ID=$(echo "$NOTE_RESPONSE" | jq -r '.data.id')
  
  if [ "$NOTE_ID" != "null" ] && [ -n "$NOTE_ID" ]; then
    echo -e "\n✅ 笔记创建成功，ID: $NOTE_ID"
    
    echo -e "\n--- 4.2 获取笔记详情 ---"
    curl -s -X GET ${BASE_URL}/api/v1/notes/${NOTE_ID} | jq '.' || true
    
    echo -e "\n--- 4.3 修改笔记 ---"
    curl -s -X PUT ${BASE_URL}/api/v1/notes/${NOTE_ID} \
      -H "Content-Type: application/json" \
      -d '{
        "content": "小地图可以通过右键点击设置显示范围和透明度，非常实用！"
      }' | jq '.' || true
    
    echo -e "\n--- 4.4 点赞笔记 (第1次) ---"
    curl -s -X POST ${BASE_URL}/api/v1/notes/${NOTE_ID}/like | jq '.' || true
    
    echo -e "\n--- 4.5 点赞笔记 (第2次) ---"
    curl -s -X POST ${BASE_URL}/api/v1/notes/${NOTE_ID}/like | jq '.' || true
    
    echo -e "\n--- 4.6 再次获取笔记详情（验证修改和点赞） ---"
    curl -s -X GET ${BASE_URL}/api/v1/notes/${NOTE_ID} | jq '.' || true
  else
    echo -e "\n❌ 笔记创建失败"
  fi
  
  echo -e "\n--- 4.7 查询笔记列表（按点赞数降序） ---"
  curl -s -X GET "${BASE_URL}/api/v1/notes?sort_by=likes&limit=5" | jq '.' || true
  
  echo -e "\n--- 4.8 查询笔记列表（按创建时间降序） ---"
  curl -s -X GET "${BASE_URL}/api/v1/notes?sort_by=created_at&limit=5" | jq '.' || true
  
  echo -e "\n--- 4.9 搜索笔记 ---"
  curl -s -X GET "${BASE_URL}/api/v1/notes?search=小地图" | jq '.' || true
  
  echo -e "\n--- 4.10 测试错误情况：创建空内容笔记 ---"
  curl -s -X POST ${BASE_URL}/api/v1/notes \
    -H "Content-Type: application/json" \
    -d '{
      "content": ""
    }' | jq '.' || true
  
  echo -e "\n--- 4.11 测试错误情况：修改不存在的笔记 ---"
  curl -s -X PUT ${BASE_URL}/api/v1/notes/999999 \
    -H "Content-Type: application/json" \
    -d '{
      "content": "测试内容"
    }' | jq '.' || true
}


echo ""
case "$TESTS" in
  all)
    run_test_1
    run_test_2
    run_test_3
    run_test_4
    ;;
  rag)
    run_test_1
    run_test_2
    run_test_3
    ;;
  notes)
    run_test_4
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
  4)
    run_test_4
    ;;
  *)
    # 支持逗号分隔的组成
    IFS=',' read -ra parts <<< "$TESTS"
    for p in "${parts[@]}"; do
      case "$p" in
        1) run_test_1 ;;
        2) run_test_2 ;;
        3) run_test_3 ;;
        4) run_test_4 ;;
        *) echo "⚠️ 未知测试: $p" ;;
      esac
    done
    ;;
esac

echo -e "\n========================================="
echo "✅ 所有测试完成"
echo "========================================="
