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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量（从 spider 目录）
dotenv.config({ path: path.join(__dirname, '.env') });

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
  async crawlURL(entry: URLEntry, force: boolean = false) {
    const { id, title, url, scope } = entry;

    console.log(`\n📄 [${scope}] ${title}`);
    console.log(`   URL: ${url}`);
    console.log(`   ID: ${id}`);

    // 检查是否已有对应的 markdown 文件
    const knowledgeDir = path.join(__dirname, '..');
    const scopeDir = path.join(knowledgeDir, scope);
    const safeTitle = title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    const fileName = `${id}_${safeTitle}.md`;
    const filePath = path.join(scopeDir, fileName);

    try {
      await fs.access(filePath);
      if (!force) {
        console.log(`   ⏭️ 跳过：Markdown 文件已存在`);
        return { success: true, skipped: true };
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
  async scrapeMultiple(entries: URLEntry[], options: { force?: boolean; concurrency?: number } = {}) {
    const concurrency = options.concurrency || 2;
    console.log(`\n🚀 开始爬取 ${entries.length} 个文档 (并发度: ${concurrency})\n`);

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    let processedCount = 0;

    // 按scope统计
    const scopeStats: Record<string, number> = {};

    // 分批处理以控制并发
    for (let i = 0; i < entries.length; i += concurrency) {
      const batch = entries.slice(i, i + concurrency);
      const batchPromises = batch.map(entry => this.processEntry(entry, options.force));

      const batchResults = await Promise.allSettled(batchPromises);

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
            }
          } else {
            failCount++;
            const error = value.error;
            console.error(`\n❌ [${entry.scope}] ${entry.title} (${entry.id})`);
            console.error(`   错误: ${error}`);
          }
        } else {
          failCount++;
          const error = result.reason;
          console.error(`\n❌ [${entry.scope}] ${entry.title} (${entry.id})`);
          console.error(`   错误: ${error}`);
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

      // 批次间短暂延迟（避免 API 限流）
      if (i + concurrency < entries.length) {
        console.log(`   ⏱️  批次间延迟 0.5 秒...`);
        await new Promise(resolve => setTimeout(resolve, 500));
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
  private async processEntry(entry: URLEntry, force: boolean = false) {
    try {
      const result = await this.crawlURL(entry, force);
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
  
  const testLimit = limitArg ? parseInt(limitArg, 10) : 5;
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 2;
  
  console.log(`🔄 强制重爬: ${force ? '是' : '否'}`);
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
        allEntries.push(...config.entries);
        console.log(`   ✓ 加载 ${config.entries.length} 个条目`);
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
    await crawler.scrapeMultiple(entriesToProcess, { force, concurrency });
    
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