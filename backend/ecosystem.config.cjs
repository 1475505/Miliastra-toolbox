/**
 * PM2 进程配置 — 千星沙箱后端 (qx-be)
 *
 * 内存优化要点：
 * - MALLOC_ARENA_MAX=2: 限制 glibc 内存分配 arena 数量，显著降低长期运行后的 RSS 膨胀与碎片。
 * - max_memory_restart 2G: 超过 2G 时 PM2 自动重启（本机总内存 3.3G，2G 为宽松上限兼最终防线）。
 * - DIAGRAM_STORE_MAX / *_RENDER_CONCURRENCY: 控制 PNG LRU 容量与 cairosvg 并发渲染数（见 diagram.py / svg/router.py）。
 *   注：不使用 uvicorn --limit-concurrency。该参数会拒绝并发超过阈值的请求（流式连接长占槽位，易触发 503），
 *   反而降低吞吐。内存峰值由 cairosvg 渲染信号量 + max_memory_restart 共同兜底。
 *
 * 其余业务环境变量（DEEPSEEK_API_KEY、DEFAULT_FREE_MODEL_*、PG_URL 等）由 backend/.env 自动加载，
 * COS_* / GEMINI_API_KEY 等由启动时所在的 shell 环境注入并被 PM2 持久化保存。
 */
module.exports = {
  apps: [
    {
      name: 'qx-be',
      cwd: '/home/ubuntu/js/Miliastra-toolbox/backend',
      script: 'bash',
      args: '-c "uvicorn main:app --host 0.0.0.0 --port 8000"',
      interpreter: 'none',
      env: {
        MALLOC_ARENA_MAX: '2',
        DIAGRAM_STORE_MAX: '30',
        DIAGRAM_RENDER_CONCURRENCY: '2',
        SVG_RENDER_CONCURRENCY: '2',
      },
      max_memory_restart: '2G',
      autorestart: true,
      watch: false,
      merge_logs: true,
      kill_timeout: 5000,
    },
  ],
};
