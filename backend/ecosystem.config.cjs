/**
 * PM2 进程配置 — 千星沙箱后端 (qx-be)
 *
 * 内存优化要点：
 * - MALLOC_ARENA_MAX=2: 限制 glibc 内存分配 arena 数量，显著降低长期运行后的 RSS 膨胀与碎片。
 * - MALLOC_MMAP_THRESHOLD_ / MALLOC_TRIM_THRESHOLD_ / MALLOC_TOP_PAD_ = 128KB
 *   （2026-09-26 新增，见 backend/specs/memory-optimization.md）：
 *   让 ≥128KB 的分配直接走 mmap 并在 free 时归还 OS，同时降低堆顶 trim 门槛，
 *   避免「堆只增不减」。实测碎片化压力下最终 RSS 76MB vs 默认 186MB（2.4 倍差距），
 *   优于 LD_PRELOAD jemalloc（174~186MB，且 jemalloc 会让这 3 个变量失效，二选一）。
 *   注：这三个变量必须由 env 注入 —— 若改用 LD_PRELOAD jemalloc 则需同时删掉。
 * - max_memory_restart 2G: 超过 2G 时 PM2 自动重启（本机总内存 3.3G，2G 为宽松上限兼最终防线）。
 * - DIAGRAM_STORE_MAX / *_RENDER_CONCURRENCY: 控制 PNG LRU 容量与 cairosvg 并发渲染数（见 diagram.py / svg/router.py）。
 *   注：不使用 uvicorn --limit-concurrency。该参数会拒绝并发超过阈值的请求（流式连接长占槽位，易触发 503），
 *   反而降低吞吐。内存峰值由 cairosvg 渲染信号量 + max_memory_restart 共同兜底。
 *
 * 修改 env 后必须用 `pm2 startOrReload ecosystem.config.cjs` 使其生效；
 * 注意不要加 --update-env：该参数会用当前 shell 环境覆盖进程环境，
 * 会丢掉 COS_* / GEMINI_API_KEY（这两个只存在于进程 env，且被 upload/router.py 在 import 时读取）。
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
        MALLOC_MMAP_THRESHOLD_: '131072',
        MALLOC_TRIM_THRESHOLD_: '131072',
        MALLOC_TOP_PAD_: '131072',
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
