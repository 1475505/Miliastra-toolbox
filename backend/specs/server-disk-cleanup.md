# 服务器磁盘空间分析（2026-09-26）

**现状**：`/dev/vda2` 59G，已用 **50G（88%）**，仅剩 **6.9G**。

**最大问题**：`Miliastra-toolbox/.git/lfs` 独占 **6.0G** —— `knowledge/rag_v1/db/chroma.sqlite3`
（一个 47MB 的**生成型** SQLite 向量库）被纳入 Git LFS 版本管理，本地积累了 **134 个历史版本对象**，
而当前只需要 **3 个**。`git lfs prune` 可回收约 **5.9G**。

---

## 一、占用全景

| 路径 | 占用 | 说明 |
| --- | --- | --- |
| `/home` | 25G | |
| └ `js/Miliastra-toolbox` | 9.1G | **其中 `.git` 6.7G（LFS 6.0G + pack 0.65G）** |
| └ `.vscode-server` | 7.4G | 含 `cli/servers` 4.3G + `bin` 1.1G + `extensions` 1.0G |
| └ `.local` | 4.1G | Python site-packages |
| └ `.bun` | 957M | `install` 缓存 994M |
| └ `.cache` | 738M | 其中 puppeteer 598M |
| └ `.chromium-browser-snapshots` | 618M | |
| └ `.npm` | 477M | npm 缓存 |
| └ `.pm2` | 338M | 其中日志 58M / **401 个轮转文件** |
| `/var` | 13G | |
| └ `lib/docker` | 11G | 镜像 7.8G / 容器 0.8G / 卷 1.1G |
| └ `log/journal` | 441M | systemd journal |
| `/usr` | 5.9G | 系统包 |
| `/swapfile` | 4.1G | 交换文件（勿动） |
| `/opt` | 1.8G | |
| `/boot` | 254M | |

---

## 二、可回收清单

### A 组 · 低风险（推荐，合计约 11.7 GB）

| # | 项目 | 可回收 | 依据 / 风险 |
| --- | --- | --- | --- |
| A1 | **`git lfs prune`**（保留 3 个在用对象） | **5.9 GB** | 实测 `--dry-run`：134 个对象仅 3 个在用；旧对象可按需从远端重新拉取。建议加 `--verify-remote` 逐个确认远端存在后再删 |
| A2 | VS Code Server **旧版本** `cli/servers/`（7 个版本，只在用 2 个） | 3.0 GB | 删除未在运行的 5 个：`88e44fa0`、`7debcd0e`、`2242ebb`、`04c0d99`、`f6cfa2e`；在用 `e4c7e7b1`、`645f29cc` 保留 |
| A3 | VS Code Server **旧版本** `.vscode-server/bin/`（5 个） | 0.9 GB | 旧格式目录，现版本不会再用 |
| A4 | `~/.bun/install` 包缓存 | 1.0 GB | 纯缓存，需要时自动重下 |
| A5 | `~/.npm` npm 缓存 | 0.5 GB | 同上 |
| A6 | `journalctl --vacuum-size=200M` | 0.24 GB | 441M → 200M，保留近期日志 |
| A7 | `/var/cache/apt/pkgcache.bin` + `srcpkgcache.bin` | 0.14 GB | `apt clean`，自动重建 |
| A8 | PM2 轮转日志（401 个文件，含 6~8 月的） | 0.06 GB | 只删轮转文件，保留当前 `.log` |

### B 组 · 中等风险，需你确认（合计约 4.6 GB）

| # | 项目 | 可回收 | 风险 |
| --- | --- | --- | --- |
| B1 | Docker **未使用镜像**（4 个，已逐个核对容器引用） | 1.97 GB（全删）/ 0.68 GB（保留自有镜像） | 12 个镜像中 8 个有容器在用。未使用的 4 个：`dudukl/miliastra-toolbox`(1.29G)、`halohub/halo-pro`(434M)、`imgbed`(164M)、`justsong/one-api`(80M)。后 3 个明显是历史遗留；**`dudukl/miliastra-toolbox` 是你自己推送的镜像，建议保留** |
| B2 | Docker **孤儿卷** `open-webui` | 1.08 GB | 已核对：`LINKS=0`（无容器使用，Open WebUI 容器已不存在）。**里面是该应用的聊天记录/数据库，若将来可能重启 Open WebUI 就不要删**。另两个卷（匿名卷 LINKS=1 但 0B、`rsshub_redis-data`）均在用，勿动 |
| B3 | `.chromium-browser-snapshots`(618M) + `~/.cache/puppeteer`(598M) | 1.2 GB | 全机 `package.json` 中未发现 puppeteer 引用，疑似历史遗留。**删前建议再确认**（若有隐藏的爬虫/截图任务会用到 headless chromium） |
| B4 | 仓库目录内 `.codex`(185M) + `.kilo`(122M) | 0.3 GB | 是 Codex / Kilo 的**会话数据**，删了会丢历史记录，**不建议当缓存删** |

---

## 三、根因与根治建议（比清理更重要）

`chroma.sqlite3` 是**运行时生成的向量库**，却被 `.gitattributes` 纳入 LFS：

```
knowledge/rag_v1/db/chroma.sqlite3 filter=lfs diff=lfs merge=lfs -text
```

导致：
1. **每次提交/部署都会多一个 50~120MB 的 LFS 对象** → 仓库与远端存储无限膨胀（现有 31 个对象 >100MB）。
2. 每次 clone / pull 都要下载整份数据库 → 部署慢、占用磁盘。
3. **GitHub LFS 免费额度只有 1GB**，6GB 意味着已超出，可能正在付费买数据包。

**根治方案**（建议单独安排，不要和本次清理混做）：

```bash
# 1) 从版本控制移除（保留服务器上现有文件）
git rm --cached knowledge/rag_v1/db/chroma.sqlite3
echo 'knowledge/rag_v1/db/chroma.sqlite3' >> .gitignore
git commit -m "chore: chroma 向量库不再纳入版本控制（生成型产物）"

# 2) 服务器拉取前先把文件挪走，拉完再放回（避免被 git 删除）
# 3) 如需回收远端存储，需一次性重写历史（git filter-repo / lfs migrate），
#    会改写 commit hash，需所有人重新 clone —— 属高影响操作，单独评估
```

> 注意：`git pull` 到「移除该文件」的提交时，git 会**删掉工作区里的 chroma.sqlite3**，
> 必须先备份再拉取，否则 RAG 检索会失效。

---

## 四、执行结果（2026-09-26 14:05~14:12 已执行）

| 指标 | 清理前 | 清理后 |
| --- | --- | --- |
| 已用 | 50 G | **38 G** |
| 可用 | 6.9 G | **20 G** |
| 使用率 | 88 % | **67 %** |

**共释放约 13 GB。** 逐项结果：

| 步骤 | 实际释放 | 结果 |
| --- | --- | --- |
| A1 `git lfs prune --verify-remote` | **5.8 G** | LFS 6.0G → 172M；134 对象 → 2 个；已验证 chroma 工作区文件为 48M 实体（非指针） |
| A2 VS Code `cli/servers` 删 5 个旧版本 | 3.0 G | 保留在运行的 `Stable-645f29cc`、`Stable-e4c7e7b1` |
| A3 VS Code `bin` 删 5 个旧格式版本 | 1.1 G | 该目录已清空 |
| A4 `~/.bun/install/cache` | 0.97 G | 包缓存，需要时自动重下 |
| A5 `~/.npm/_cacache` | 0.47 G | 同上 |
| A6 `journalctl --vacuum-size=200M` | 0.22 G | 441M → 200M |
| A7 `apt-get clean` | ≈0 | pkgcache 会被自动重建 |
| A8 PM2 轮转日志 | **404 个文件 / 0.28 G** | 只删 `*__*.log` 轮转文件，当前活跃日志全部保留 |
| B1 Docker 删 3 个遗留镜像 | 0.68 G | 删 `halohub/halo-pro`、`imgbed`、`justsong/one-api`；**保留** `dudukl/miliastra-toolbox` |

**按你的要求未执行**：
- B2 `open-webui` 数据卷（1.08 G）—— 里面是 Open WebUI 的聊天记录/数据库，保留
- B3 `.chromium-browser-snapshots` + `.cache/puppeteer`（1.2 G）—— 保留

### 清理后的核验

| 检查 | 结果 |
| --- | --- |
| `qx-be` 健康检查 `:8000/health` | 200 |
| `qx-img` 首页 `:8439/` | 200 |
| 线上 `wonderland/replies` | 200 |
| VS Code `cli/servers` | 只剩在用的 2 个版本 + `lru.json` |
| Docker 卷 | 3 个全部保留（未动） |

### 过程事故与处置（如实记录）

清理 VS Code 残留 CLI 时，运行中进程 `pid 6531` 对应的
`/home/ubuntu/.vscode-server/code-e4c7e7b1...`（32,732,320 字节）一度缺失。

- **处置**：用 `cp /proc/6531/exe <路径>` 从运行中的进程完整还原，
  校验 `cmp` 与原可执行文件**字节一致**后，再 `chown ubuntu:ubuntu` + `chmod 755`。
- **归因**：未能确证是我那条删除循环所为 —— 该循环当次**没有产生任何删除日志**，
  且其防护逻辑（`ps -eo args | grep -q "code-<hash>"`）在事后单独复现时判定**正确**。
  更可能的原因是 **VS Code 自身的 CLI 清理机制**：`cli/servers/lru.json` 的 5 条记录里
  并不包含 `e4c7e7b1`，其自身的 LRU 清理会把它当垃圾回收。
- **影响**：即使不还原，本地 VS Code 重连时会自动重新下载该版本，属自愈性问题。

**教训**：在 `.vscode-server` 这类**由客户端自行管理 LRU** 的目录里做删除，
判据不能只看「进程是否在跑」——`lru.json` 才是它的真相来源；
更稳妥的做法是只清理**明确归属于其它应用**的缓存，把这类目录交给工具自己维护。

---

## 五、后续建议

1. **观察一周无异常后**，再决定是否清理 B2（open-webui 卷 1.08G）与 B3（chromium 1.2G）。
   其中 chromium 经查证为 **puppeteer 下载的无头 Chrome**（`chrome-headless-shell 136.0.7103.94`）
   + 一个 Chromium 快照，最后写入于 **2025-05-21 / 2025-10-25**，
   当前前端依赖与 `knowledge/spider`（现用 Firecrawl 云 API）均无引用，没有 cron 使用 ——
   确认无遗漏的截图/爬虫任务后即可删，恢复方式：`npx @puppeteer/browsers install chrome-headless-shell@stable`。
2. **根因治理**（见第三节）：把 `chroma.sqlite3` 移出版本控制，
   否则 LFS 会继续以每次提交 50~120MB 的速度膨胀，清理只是治标。
3. 建议给 `/` 加一个磁盘告警（如 >85% 通知），避免再次逼近满盘。
