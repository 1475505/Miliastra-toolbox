#!/usr/bin/env node
/**
 * 主爬虫脚本 - 支持并发爬取
 * 支持并发控制，生成 markdown 文件
 */

import { FirecrawlClient } from './utils/firecrawl.js';
import { URLEntry, CrawlConfig } from './types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { buildRelativeMarkdownPath } from './utils/documentPath.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量（从 spider 目录）
dotenv.config({ path: path.join(__dirname, '.env') });

// 速率限制配置
const RATE_LIMIT_PER_MINUTE = 4;
const MS_PER_REQUEST = Math.ceil(60000 / RATE_LIMIT_PER_MINUTE); // 15000ms

class Crawler {
  private firecrawl: FirecrawlClient;
  
  constructor() {
    // 验证环境变量
    this.validateEnv();
    
    // 初始化 Firecrawl 客户端
    this.firecrawl = new FirecrawlClient(process.env.FIRECRAWL_API_KEY!);
  }
  
  private validateEnv() {
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error('缺少必需的环境变量: FIRECRAWL_API_KEY\n请检查 .env 文件');
    }
  }
  
  /**
    * 爬取单个 URL
    */
  async crawlURL(entry: URLEntry, force: boolean = false, since?: Date) {
    const { id, title, url, scope } = entry;

    console.log(`\n📄 [${scope}] ${title}`);
    console.log(`   URL: ${url}`);
    console.log(`   ID: ${id}`);

    // 检查是否已有对应的 markdown 文件
    const knowledgeDir = path.join(__dirname, '..');
    const localPath = entry.localPath || buildRelativeMarkdownPath(entry);
    const filePath = path.join(knowledgeDir, localPath);

    try {
      await fs.access(filePath);
      if (!force) {
        // 文件已存在，根据 since 参数判断是否跳过
        if (since) {
          // since 提供了日期：检查 crawledAt 是否存在且晚于 since 日期
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const crawledAtMatch = fileContent.match(/crawledAt:\s*(.+)/);
          if (crawledAtMatch) {
            const crawledAtStr = crawledAtMatch[1].trim();
            const crawledAt = new Date(crawledAtStr);
            if (!isNaN(crawledAt.getTime()) && crawledAt > since) {
              console.log(`   ⏭️ 跳过：文件已爬取且时间晚于 ${since.toISOString().split('T')[0]}`);
              return { success: true, skipped: true };
            }
          }
        } else {
          // since 未提供：默认不覆盖
          console.log(`   ⏭️ 跳过：文件已存在（未指定 --since 参数）`);
          return { success: true, skipped: true };
        }
      }
    } catch {
      // 文件不存在，继续爬取
    }

    try {
      // 爬取内容（Firecrawl 会自动保存 markdown 文件）
      console.log('   ↓ 爬取中...');
      const result = await this.firecrawl.scrapeURL(url, {
        scope: scope,
        saveMarkdown: true,
        documentId: entry.id,
        title: entry.title, // 传递正确的标题
        checkChanges: force // 如果强制重爬，检查内容是否变化
      });

      if (!result.success) {
        console.error(`   ✗ 爬取失败: ${result.error}`);
        return { success: false, error: result.error };
      }

      console.log(`   ✓ 爬取成功`);
      if (result.fileSaved) {
        console.log(`   ✓ Markdown 文件已保存`);
      } else {
        console.log(`   ✓ 内容未变化，跳过覆盖`);
      }

      return { success: true };
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`   ✗ 爬取失败: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
  
  /**
    * 批量爬取（支持并发）
    */
  async scrapeMultiple(entries: URLEntry[], options: { force?: boolean; concurrency?: number; since?: Date } = {}) {
    const concurrency = options.concurrency || 1;
    console.log(`\n🚀 开始爬取 ${entries.length} 个文档 (并发度: ${concurrency})`);
    console.log(`⏳ 速率限制: ${RATE_LIMIT_PER_MINUTE} 请求/分钟 (每请求间隔 ${MS_PER_REQUEST}ms)\n`);

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    let processedCount = 0;

    // 按scope统计
    const scopeStats: Record<string, number> = {};

    // 分批处理以控制并发
    for (let i = 0; i < entries.length; i += concurrency) {
      const batchStartTime = Date.now(); // 记录批次开始时间
      const batch = entries.slice(i, i + concurrency);
      const batchPromises = batch.map(entry => this.processEntry(entry, options.force, options.since));

      const batchResults = await Promise.allSettled(batchPromises);
      
      let apiCallsInBatch = 0;

      batchResults.forEach((result, index) => {
        processedCount++;
        const entry = batch[index];

        if (result.status === 'fulfilled') {
          const value = result.value;
          if (value.success) {
            if (value.skipped) {
              skippedCount++;
            } else {
              successCount++;
              scopeStats[entry.scope] = (scopeStats[entry.scope] || 0) + 1;
              apiCallsInBatch++;
            }
          } else {
            failCount++;
            const error = value.error;
            console.error(`\n❌ [${entry.scope}] ${entry.title} (${entry.id})`);
            console.error(`   错误: ${error}`);
            apiCallsInBatch++;
          }
        } else {
          failCount++;
          const error = result.reason;
          console.error(`\n❌ [${entry.scope}] ${entry.title} (${entry.id})`);
          console.error(`   错误: ${error}`);
          apiCallsInBatch++;
        }

        // 进度报告
        const percentage = ((processedCount / entries.length) * 100).toFixed(1);
        console.log(`\n📊 进度: ${processedCount}/${entries.length} (${percentage}%)`);
        console.log(`   成功: ${successCount} | 跳过: ${skippedCount} | 失败: ${failCount}`);
        const categoriesStr = Object.entries(scopeStats)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' | ');
        console.log(`   ${categoriesStr}`);
      });

      // 批次间延迟（基于速率限制）
      if (i + concurrency < entries.length) {
        const elapsed = Date.now() - batchStartTime;
        
        if (apiCallsInBatch > 0) {
          const requiredTime = apiCallsInBatch * MS_PER_REQUEST;
          const waitTime = Math.max(1000, requiredTime - elapsed); // 至少等待 1000ms
          console.log(`   ⏱️  速率限制等待: ${(waitTime / 1000).toFixed(1)} 秒...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // 如果没有 API 调用（全部跳过），仅做极短延迟
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n✅ 爬取完成`);
    console.log(`  总数: ${entries.length}`);
    console.log(`  成功: ${successCount}`);
    console.log(`  跳过: ${skippedCount}`);
    console.log(`  失败: ${failCount}`);
    console.log(`  耗时: ${duration}s`);
    console.log(`  平均速度: ${(successCount / parseFloat(duration)).toFixed(2)} 文档/秒`);

    // 按scope统计
    console.log(`\n📂 scope统计:`);
    Object.entries(scopeStats).forEach(([scope, count]) => {
      console.log(`  ${scope}: ${count}`);
    });
  }

  /**
   * 处理单个文档条目
   */
  private async processEntry(entry: URLEntry, force: boolean = false, since?: Date) {
    try {
      const result = await this.crawlURL(entry, force, since);
      return result;
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔧 文档爬虫启动（支持并发）\n');
  
  // 解析命令行参数
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const testMode = args.includes('--test');
  const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='))?.split('=')[1];
  const sinceArg = args.find(a => a.startsWith('--since='))?.split('=')[1];
  
  const testLimit = limitArg ? parseInt(limitArg, 10) : 5;
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 1;
  
  // 处理日期筛选
  const defaultSinceDate = '2025.10.25';
  const configFilterDateStr = sinceArg || defaultSinceDate;
  // 将 2025.10.25 格式转换为 2025-10-25 以便 Date 解析
  const formattedConfigFilterDate = configFilterDateStr.replace(/\./g, '-');
  const configFilterDate = new Date(formattedConfigFilterDate);
  
  if (isNaN(configFilterDate.getTime())) {
    console.error(`❌ 无效的日期格式: ${configFilterDateStr}，请使用 YYYY.MM.DD 或 YYYY-MM-DD 格式`);
    process.exit(1);
  }

  // 用于比较 crawledAt 的日期（仅当提供了 --since 时）
  let sinceDate: Date | undefined;
  let sinceDateStr: string = '';
  
  if (sinceArg) {
    sinceDate = configFilterDate;
    sinceDateStr = configFilterDateStr;
  }

  console.log(`🔄 强制重爬: ${force ? '是' : '否'}`);
  console.log(`📅 配置筛选日期: ${configFilterDateStr} (只处理配置中更新时间晚于此日期的文档)`);
  if (sinceDate) {
    console.log(`📅 爬虫模式: 已指定 --since，文件如果早于 ${sinceDateStr} 则重新爬取`);
  } else {
    console.log(`📅 爬虫模式: 未指定 --since，将默认不覆盖现有文件`);
  }
  console.log(`🧪 测试模式: ${testMode ? '是' : '否'}${testMode ? ` (限制: ${testLimit})` : ''}`);
  console.log(`🚀 并发度: ${concurrency}\n`);
  
  // 读取配置 - 支持多个配置文件
  try {
    // 检查 config 目录下的所有 urls-*.json 文件
    const configDir = path.join(__dirname, '..', 'config');
    const configFiles = await fs.readdir(configDir);
    const urlsFiles = configFiles.filter(file => file.startsWith('urls-') && file.endsWith('.json'));
    
    if (urlsFiles.length === 0) {
      throw new Error('在 config 目录下没有找到 urls-*.json 配置文件');
    }
    
    console.log(`📁 找到配置文件: ${urlsFiles.join(', ')}\n`);
    
    // 读取所有配置文件并合并 entries
    let allEntries: URLEntry[] = [];
    
    for (const file of urlsFiles) {
      const filePath = path.join(configDir, file);
      console.log(`📖 读取配置文件: ${file}`);
      const configFile = await fs.readFile(filePath, 'utf-8');
      const config: CrawlConfig = JSON.parse(configFile);
      
      if (config.entries && config.entries.length > 0) {
        // 根据 updated_at 筛选
        const filteredEntries = config.entries.filter(entry => {
          if (!entry.updated_at) return false;
          const entryDate = new Date(entry.updated_at);
          return entryDate > configFilterDate;
        });

        allEntries.push(...filteredEntries);
        console.log(`   ✓ 加载 ${config.entries.length} 个条目 (筛选后: ${filteredEntries.length} 个)`);
      }
    }
    
    if (allEntries.length === 0) {
      throw new Error('所有配置文件中都没有文档条目');
    }
    
    // 测试模式：只处理前 N 个条目
    let entriesToProcess = allEntries;
    if (testMode) {
      entriesToProcess = allEntries.slice(0, testLimit);
      console.log(`🧪 测试模式启用，只处理前 ${entriesToProcess.length} 个文档`);
      console.log(`   (总共 ${allEntries.length} 个文档)`);
      
      const testScopeStats: Record<string, number> = {};
      entriesToProcess.forEach(e => {
        testScopeStats[e.scope] = (testScopeStats[e.scope] || 0) + 1;
      });
      const testScopesStr = Object.entries(testScopeStats)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
      console.log(`   ${testScopesStr}\n`);
    } else {
      console.log(`📋 共 ${allEntries.length} 个文档待处理`);
      
      // 统计所有条目的分类信息
      const scopeStats: Record<string, number> = {};
      allEntries.forEach(e => {
        scopeStats[e.scope] = (scopeStats[e.scope] || 0) + 1;
      });
      const scopesStr = Object.entries(scopeStats)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
      console.log(`   ${scopesStr}\n`);
    }
    
    // 执行爬取
    const crawler = new Crawler();
    await crawler.scrapeMultiple(entriesToProcess, { force, concurrency, since: sinceDate });
    
    if (testMode) {
      console.log(`\n🧪 测试完成！已处理 ${entriesToProcess.length}/${allEntries.length} 个文档`);
      console.log(`   要处理所有文档，请运行: npm run scrape\n`);
    } else {
      console.log('\n🎉 所有任务完成！\n');
    }
  } catch (error) {
    console.error(`\n❌ 错误: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// 运行
main().catch((error) => {
  console.error('❌ 未捕获的错误:', error);
  process.exit(1);
});