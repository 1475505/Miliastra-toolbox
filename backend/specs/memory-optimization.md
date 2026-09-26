# 后端内存优化分析（2026-09-26）

**结论**：`qx-be`（uvicorn）内存**随流量持续增长**（约 0.5 GB/天），PM2 已因超
`max_memory_restart`（2 GiB）**被动重启 3 次**。增长来源是**原生堆（glibc malloc）
碎片化与内存未归还**，**不是**空转泄漏，也**不是**无界 Python 缓存。

---

## 一、现状数据

### 机器水位

```
Mem:   3399 total   2263 used   856 available
Swap:  4095 total   2095 used
```

### 进程内存构成

| 进程 | RSS | 说明 |
| --- | --- | --- |
| **qx-be**（uvicorn） | **1278 MB** | 主服务，绝对大头 |
| node（容器内 Node 应用） | 157 + 77 MB | `/app` 内 `node ./build/index.js`（docker） |
| codex（OpenAI Codex CLI ×3） | **~207 MB** | **开发工具常驻生产机 6 天+** |
| postgres × 5 | 163 MB | 分享功能依赖 |
| sub2api | 63 MB | |
| YDService | 61 MB | 腾讯云安全 agent |
| 1panel | 42 MB | 面板 |
| PM2 + logrotate | 75 MB | |
| dockerd + containerd | 58 MB | |
| Xvfb / vscode-server | ~24 MB | 开发工具残留 |

### 重启历史（PM2 主日志，均为内存触发）

```
2026-09-19T05:45:55  exceeds --max-memory-restart (current=2220523520, max=2147483648)
2026-09-22T16:45:59  exceeds --max-memory-restart (current=2170880000)
2026-09-24T23:02:02  exceeds --max-memory-restart (current=2192359424)
```

间隔 **3 天 11 小时** 与 **2 天 6 小时**，即「重启后 2.5~3.5 天又顶到 2 GiB」。
当前距上次重启 1 天 12 小时，RSS 已 1.29 GB → 外推约 **2.5 天后再次被动重启**。

---

## 二、定性证据

### 1. 不是无界缓存

代码里所有缓存都是**有界**的：
- `agent/diagram.py`：`OrderedDict` LRU，`DIAGRAM_STORE_MAX=30`（PM2 env 已设）
- `functools.lru_cache`：`maxsize` 分别为 1 / 64 / 1024 / 2048
- 无模块级无界 `dict` / `list` / `set` 累积容器

### 2. 不是空转泄漏（关键判据）

空载连续采样（10s 一次），RSS **缓慢下降**而非上升：

```
11:29:18 rss=1294084kB
11:29:48 rss=1287240kB
11:30:18 rss=1287240kB
11:30:28 rss=1285948kB
11:30:49 rss=1283280kB
```

→ 增长**由请求处理驱动**，是典型的「大块临时分配 → 释放后未归还 OS」行为
（Python 服务 + glibc malloc 的经典形态）。

### 3. 内存几乎全在原生堆

```
Rss:           1312688 kB
Anonymous:     1282532 kB   ← 97.7% 是匿名内存，非文件缓存
Swap:           842848 kB   ← 另有 823MB 被换出
Threads:              18
```

`pmap` 显示**最大单块就是主堆**：

```
56489b72f000-5648c65a8000 rw-p  [heap]
Size:  702948 kB     Rss:  518016 kB    ← 686MB 堆，506MB 常驻
```

其余为十余个 50~90MB 的匿名块（大对象 mmap 区）。堆占常驻内存的 ~40%，
且只增不减 —— 碎片化特征。

### 4. 当前未使用替代分配器

`/proc/PID/maps` 中无 `libjemalloc` / `libmimalloc` / `libtcmalloc`，
走的是系统 glibc malloc（`MALLOC_ARENA_MAX=2` 已生效：`[heap]` 只有 1 个）。

---

## 三、优化方案（按优先级）

### P0 · glibc 调参（✅ 已采用，实测最优）

只加 3 个环境变量：零依赖、不装库、不改动进程 env、一条命令可回滚。

```js
// backend/ecosystem.config.cjs → env（已提交）
MALLOC_ARENA_MAX: '2',              // 原有
MALLOC_MMAP_THRESHOLD_: '131072',   // ≥128KB 直接走 mmap，free 即归还 OS
MALLOC_TRIM_THRESHOLD_: '131072',   // 堆顶空闲超 128KB 即 trim 回 OS
MALLOC_TOP_PAD_: '131072',          // 每次向 OS 多要一点，减少 brk 次数
```

**实测对比**（碎片化压力基准：混合 512B~2MB 对象，每轮申请 400 个只留 12%，
共 80 轮 + 3 万小对象高频 churn；同机同一脚本，两轮独立复跑）：

| 方案 | 第 1 轮 | 第 2 轮 | 相对默认 |
| --- | --- | --- | --- |
| A) glibc 默认（原状） | 186.0 MB | 185.8 MB | — |
| B) `LD_PRELOAD` jemalloc | 157.3 MB | 174.4 MB | 约 -5% ~ -15% |
| **C) glibc 调参（本方案）** | **75.9 MB** | **76.0 MB** | **-59%** |

C 的整条曲线也明显更平（第 10 轮 39.9MB → 第 80 轮 75.9MB），
而 A 第 10 轮就已冲到 184MB 并长期维持 —— 正对应线上「堆只增不减」的症状。

代价：≥128KB 走 mmap 会略增系统调用，CPU 影响可忽略。

### P1 · 切换到 jemalloc（⚠️ 降级为备选，实测不如 P0）

> **修正说明**：本文档初版把 jemalloc 列为 P0，依据是社区经验值（预期 -20~40%）。
> 本机实测后**结论反转** —— jemalloc（157~174MB）不如 P0 的 glibc 调参（76MB），
> 且两者**互斥**（preload jemalloc 后 `MALLOC_*` 全部失效）。

库已装好（`libjemalloc2` → `/usr/lib/x86_64-linux-gnu/libjemalloc.so.2`），
并已验证可正常加载（python 3.10.12 + fastapi/httpx/chromadb/cairosvg 导入均正常）。
若将来 P0 效果不足要改用它，**必须先删掉 P0 的 3 个 MALLOC_ 变量**，再加：

```js
// ecosystem.config.cjs → qx-be 的 env
LD_PRELOAD: '/usr/lib/x86_64-linux-gnu/libjemalloc.so.2',
```

另可用 `MALLOC_CONF` 进一步调 `dirty_decay_ms` / `muzzy_decay_ms` 等参数。

> 参考：单次性的简单分配基准（不做碎片化压力）中 jemalloc 反而更高
> （214MB vs 261MB），说明**必须用贴近真实负载的基准评估，勿套用经验值**。

### P2 · 清掉生产机上的开发工具（✅ 已执行）

**已清理**（2026-09-26 13:46，SIGTERM）：

| 目标 | 进程 | 回收 |
| --- | --- | --- |
| codex `app-server` 孤儿实例 ×3 对（9/19 启动、PPID=1、`ss -xlp` 无 ESTAB 连接） | 2733928/2733945、2738683/2738700、3014901/3014918 + 2317491 | RSS ≈ 91 MB |
| Xvfb :99（属主 `lxd`，已跑 10 天，全机无任何进程带 `DISPLAY=:99`） | 2537 | 1.5 MB |

实测效果：`used` 2680 → 2647 MB，`available` 443 → 476 MB，`swap` 2044 → 2007 MB。

**保留未动**：
- vscode-server 残留 2 个进程（合计仅 1.6 MB，重连即复用）
- **活跃的 codex 会话** —— 清理时检测到有当天新起的实例，已显式排除在名单外

**复发提醒**：codex CLI 退出后其 `app-server` 会残留（本次残留的是 9/19 那次）。
判据是「PPID=1 + 启动时间久远 + 无 ESTAB 连接」，符合才清：

```bash
# 列出 PPID=1 的孤儿 codex app-server，确认后再 kill
ps -eo pid,ppid,etime,args --no-headers | grep '[c]odex .*app-server' | awk '$2==1'
```

### P3 · 主动重启窗口，替代被动掉线

当前是 **内存顶到 2 GiB 才被动重启**，触发时间随机，可能落在流量高峰。
建议改为**每天凌晨主动重启一次**（此时进程内存还没到顶），把被动变成可控：

```bash
# 凌晨 4:20 主动 reload
20 4 * * * /home/ubuntu/.local/share/fnm/node-versions/v22.14.0/installation/bin/pm2 reload qx-be >/dev/null 2>&1
```

> 注意：线上 `pm2` 不在非交互 SSH 的 PATH 里（用 fnm 而非 nvm），
> **cron 里必须写全路径**，否则会静默失败。

`max_memory_restart: 2G` 保留作为兜底防线。
（更彻底的做法是拆分进程：把 RAG/LLM 重服务与轻量 API 分开，互不影响重启。属架构级改动。）

### P4 · 精确定位增长点（如需根治）

P0~P3 是「治标且有效」；要根治需要知道到底是哪类对象在长：

```python
# 方式一：gc 统计（轻量，可长期开）
# 在 /health 里暴露 len(gc.get_objects()) 与 tracemalloc 峰值，观察增长的是哪类对象

# 方式二：tracemalloc 短期采样（更准，需重启进程）
PYTHONTRACEMALLOC=25 pm2 startOrReload ecosystem.config.cjs   # 记录 25 帧回溯
```

> 注意：P0 实测只能压住**碎片化**；若线上增长是**真实对象泄漏**（某个原生扩展或
> 缓存未释放），P0 只能减缓不能根治，仍需本项定位。

### P5 · 环境变量卫生（⏸ 待办）

`qx-be` 的 env 里混入了大量 VS Code / Codex 的变量（`VSCODE_*`、`KILO_*`、
`MIMALLOC_PURGE_DELAY`、`PM2_USAGE` 等），说明 PM2 是从一个开发用 shell 里启动的，
污染被持久化了。其中 `MIMALLOC_PURGE_DELAY` 尤其容易误导 —— **没有 preload
mimalloc 时它完全不生效**。

**风险提示（重要）**：不要图省事用 `pm2 restart qx-be --update-env` 去「清洗」环境 ——
该参数会用当前 shell 环境覆盖进程环境，会丢掉 `COS_BUCKET / COS_REGION /
COS_SECRET_ID / COS_SECRET_KEY / GEMINI_API_KEY`。这几个**只存在于进程 env**，
且 `upload/router.py` 在 **import 时**就读取，而 `load_dotenv()` 在更晚的模块才被调用
—— 所以放进 `.env` 也未必生效。

正确做法：先把业务变量显式导出到当前 shell，再重启：

```bash
# 1) 从旧进程导出业务变量（避免手抄出错）
tr '\0' '\n' < /proc/<OLD_PID>/environ | grep -E '^(COS_|GEMINI_)' > /tmp/biz.env
# 2) 导出后再重启（此时 --update-env 是安全的，该有的都在当前 shell 里了）
set -a; . /tmp/biz.env; set +a
cd /home/ubuntu/js/Miliastra-toolbox/backend && pm2 startOrReload ecosystem.config.cjs --update-env
```

### P6 · swap 相关

当前进程被换出 **823 MB**，`vm.swappiness=40`。换出会显著增加尾延迟
（页面换入）。降低 RSS（P0/P1）后换出量会自然下降。
**不建议**直接调 `swappiness=0`：3.4G 内存下遇到峰值容易直接 OOM。

---

## 四、执行进展与建议顺序

| 步骤 | 状态 |
| --- | --- |
| **P2 清开发工具** | ✅ 已执行（回收 ~70MB，含 swap） |
| **P0 glibc 调参** | ✅ 已写入 `ecosystem.config.cjs` 并部署（需重启生效） |
| P1 jemalloc | ⏸ 库已装好，降级为备选（实测不如 P0） |
| P3 凌晨定时 reload | ⏸ 待办（建议尽快，消除随机被动重启） |
| P4 精确定位 | ⏸ 待办（若 P0 后增长仍明显） |
| P5 env 卫生 | ⏸ 待办（注意 `--update-env` 会丢 COS_*，见 P5） |

**验证方法**：重启后用同一指标对比 —— **「重启后 RSS 基线」** 与 **「到达 2 GiB 的天数」**。
部署前基线：约 **2.5 天 / 次**，重启时 RSS 约 2.0 GiB。

预期：P0 生效后 RSS 基线应明显下移；若「到达 2 GiB 的天数」显著拉长 → 增长主要是碎片化，
问题基本解决；若天数几乎不变 → 存在真实泄漏，需上 P4。
