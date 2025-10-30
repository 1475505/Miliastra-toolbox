#!/usr/bin/env node
/**
 * URL 生成脚本
 * 使用 Firecrawl crawl 模式自动发现所有文档链接
 */

import { FirecrawlClient } from './utils/firecrawl.js';
import { URLEntry, URLConfig, URLExtractResult } from './types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量（从 knowledge 目录）
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// 源页面配置
const SOURCES = {
  guide: {
    url: 'https://act.mihoyo.com/ys/ugc/tutorial/detail/mh29wpicgvh0',
    name: '综合指南',
  },
  tutorial: {
    url: 'https://act.mihoyo.com/ys/ugc/tutorial/course/detail/mhhw2l08o6qo',
    name: '教程',
  },
};

class URLGenerator {
  private firecrawl: FirecrawlClient;

  constructor() {
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error('缺少 FIRECRAWL_API_KEY 环境变量');
    }
    this.firecrawl = new FirecrawlClient(process.env.FIRECRAWL_API_KEY);
  }

  /**
   * 使用 Firecrawl crawl 模式提取所有链接（带标题和ID）
   */
  async crawlAndExtractURLs(url: string, name: string, scope: string): Promise<URLEntry[]> {
    console.log(`\n🔍 爬取 ${name}: ${url}`);

    try {
      // 使用统一的URL提取方法
      const result: URLExtractResult = await this.firecrawl.extractURLs(url, scope, { limit: 500 });
      console.log(`   📊 处理结果: ${result.completedPages}/${result.totalPages} 个页面`);
      
      return result.entries;
    } catch (error) {
      console.error(`   ✗ 爬取失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 生成 URL 配置文件
   */
  async generate(scopes: string[] = ['guide', 'tutorial']) {
    console.log('🚀 开始生成 URL 列表\n');
    console.log(`📋 类型: ${scopes.join(', ')}\n`);

    const allEntries: URLEntry[] = [];
    const scopeStats: Record<string, number> = { guide: 0, tutorial: 0 };

    for (const scope of scopes) {
      const source = SOURCES[scope as keyof typeof SOURCES];
      if (!source) {
        console.error(`⚠️  未知类型: ${scope}，跳过`);
        continue;
      }

      const entries = await this.crawlAndExtractURLs(
        source.url,
        source.name,
        scope
      );
      
      allEntries.push(...entries);
      scopeStats[scope] = entries.length;

      // 避免 API 限流
      if (scopes.length > 1) {
        console.log('   ⏱️  等待 2 秒...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // 按scope分开保存JSON文件
      await this.saveScopeConfigs(entries, scope);
    }

    console.log('\n📊 统计信息:');
    console.log(`   总提取: ${allEntries.length} 个`);
    console.log(`   guide: ${scopeStats.guide} 个`);
    console.log(`   tutorial: ${scopeStats.tutorial} 个`);

    console.log(`\n✅ JSON配置文件生成完成`);
    console.log(`   共 ${allEntries.length} 个条目\n`);
  }

  /**
   * 保存JSON配置文件
   */
  private async saveScopeConfigs(entries: URLEntry[], scope: string) {
    const configDir = path.join(__dirname, '..', 'config');
    await fs.mkdir(configDir, { recursive: true });

    // 按title排序
    entries.sort((a, b) => a.title.localeCompare(b.title));

    const config: URLConfig = {
      entries,
      metadata: {
        source: scope,
        extractedAt: new Date().toISOString(),
        totalCount: entries.length,
        scopes: {
          [scope]: entries.length
        },
      },
    };

    const outputPath = path.join(configDir, `urls-${scope}.json`);
    await fs.writeFile(outputPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`   ✓ 写入json - ${scope}: ${outputPath} (${entries.length} 个条目)`);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('URL 生成器启动\n');

  // 解析命令行参数
  const args = process.argv.slice(2);
  const typeArg = args.find(a => a.startsWith('--type='))?.split('=')[1];
  
  let scopes: string[];
  if (typeArg) {
    scopes = [typeArg];
  } else {
    // 默认生成所有类型
    scopes = ['guide', 'tutorial'];
  }

  console.log(`📝 生成类型: ${scopes.join(', ')}\n`);

  try {
    const generator = new URLGenerator();
    await generator.generate(scopes);
    console.log('🎉 完成！\n');
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