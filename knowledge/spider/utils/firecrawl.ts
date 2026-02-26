/**
 * Firecrawl 集成模块 - 简化版本
 * 封装 Firecrawl API 调用，保留核心功能
 */

import Firecrawl, {
  CrawlJob,
  CrawlResponse,
  Document,
  FormatOption
} from '@mendable/firecrawl-js';
import { URLEntry, ScrapeResult, URLExtractResult } from '../types.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export class FirecrawlClient {
  private client: Firecrawl;
  
  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Firecrawl API Key is required');
    }
    this.client = new Firecrawl({ apiKey });
  }
  
  /**
   * 启动爬取任务并返回任务信息
   * 这是推荐的方式，因为它只返回任务 ID 而不是轮询整个任务。
   */
  async startCrawl(url: string, options?: { limit?: number }): Promise<CrawlResponse> {
    const crawlOptions = options ? { limit: options.limit || 500 } : { limit: 500 };
    const result: CrawlResponse = await this.client.startCrawl(url, crawlOptions);
    return result;
  }

  /**
   * 获取爬取任务状态和结果
   * 直接返回 SDK 的 CrawlJob 类型，确保类型安全
   */
  async getCrawlStatus(crawlId: string): Promise<CrawlJob> {
    const result: CrawlJob = await this.client.getCrawlStatus(crawlId);
    return result;
  }

  /**
   * 使用便捷方法启动爬取任务并等待完成
   * 适合需要等待所有结果的应用场景
   */
  async crawlAndWait(url: string, options?: { limit?: number; timeout?: number }): Promise<CrawlJob> {
    const result: CrawlJob = await this.client.crawl(url, {
      limit: options?.limit || 500,
      timeout: options?.timeout || 300 // 默认 5 分钟超时
    });
    return result;
  }

  /**
   * 提取URL列表并等待完成
   * 统一封装爬取逻辑，便于迁移到其他API
   */
  async extractURLs(url: string, scope: string, options?: { limit?: number }): Promise<URLExtractResult> {
    console.log(`   🔄 启动爬取任务...`);
    
    // 启动爬取任务
    const job: CrawlJob = await this.crawlAndWait(url);
    // 爬取已经完成，直接使用结果
    const completed = job.completed || 0;
    const total = job.total || 0;
    
    console.log(`   ✓ 爬取完成: ${completed}/${total} 个页面`);

    if (job.status != 'completed') {
      throw new Error(`Crawl task failed ${job.status}`);
    }
    
    // 提取所有链接及其元数据
    const entries: URLEntry[] = [];
    
    if (job.data) {
      for (const [idx, page] of job.data.entries()) {
        // 从每个页面的 markdown 内容中解析链接
        const markdown = page.markdown || '';
        
        // 保存页面markdown到指定路径
        const dataDir = path.join(__dirname, '..', 'data');
        await fs.mkdir(dataDir, { recursive: true });
        const scopeFilePath = path.join(dataDir, `${scope}_${idx}.md`);
        await fs.writeFile(scopeFilePath, markdown, 'utf-8');
        
        // 正则表达式匹配 [标题](URL) 格式的链接
        const linkRegex = /\[([^\]]+)\]\((https:\/\/act\.mihoyo\.com\/ys\/ugc\/[a-z0-9/]+)\)/g;
        
        let match;
        while ((match = linkRegex.exec(markdown)) !== null) {
          const title = match[1];
          const pageUrl = match[2];
                      
          // 从 URL 提取 ID（格式：.../detail/mh29wpicgvh0）
          const idMatch = pageUrl.match(/\/detail\/([a-z0-9]+)$/);
          const id = idMatch ? idMatch[1] : `unknown-${Date.now()}`;
          
          entries.push({
            id,
            title: title,
            url: pageUrl,
            uniqueId: pageUrl, // 使用URL作为唯一标识符
            scope: scope,
          });
        }
      }
    }

    // 按 title 字典序 排序
    entries.sort((a, b) => a.title.localeCompare(b.title));
    
    return {
      entries,
      totalPages: total,
      completedPages: completed,
    };
  }

  /**
    * 爬取单个 URL（使用 scrape 方法）
    * 按照官方文档格式处理响应，并保存 markdown 文件
    */
  async scrapeURL(url: string, options?: {
    scope?: string;
    saveMarkdown?: boolean;
    outputDir?: string;
    documentId?: string;
    title?: string; // 新增：支持传递自定义标题
    checkChanges?: boolean; // 新增：检查内容是否变化
  }): Promise<ScrapeResult & { fileSaved?: boolean }> {
    try {
      // 优化的 Firecrawl 配置：只提取 .doc-view 容器内的内容
      const result: Document = await this.client.scrape(url, {
        formats: ['markdown' as const],
        includeTags: ['.doc-view'], // 只提取文档主体内容，过滤导航、页脚等
        excludeTags: ['nav', 'footer', 'header', 'aside', 'script', 'style'], // 排除不需要的标签
        onlyMainContent: true, // 只提取主要内容
        waitFor: 2000, // 等待动态内容加载完成
        timeout: 180000, // 3分钟超时
        maxAge: 4 * 60 * 60 * 1000, // 4小时内的缓存结果
      });
      
      // 新版本直接返回数据，没有success属性
      const markdown = result.markdown || '';
      const metadata = result.metadata || {};
      
      if (!markdown) {
        return {
          success: false,
          markdown: '',
          metadata: { title: '' },
          error: 'No content returned from scrape',
        };
      }

      // 保存 markdown 文件
      const saveMarkdown = options?.saveMarkdown ?? true;
      let fileSaved = false;
      if (saveMarkdown) {
        const outputDir = options?.outputDir || path.join(__dirname, '..', 'data');
        const documentId = options?.documentId || this.extractIdFromUrl(url);
        const scope = options?.scope || 'tutorial';
        const title = options?.title || metadata.title || '未命名文档'; // 优先使用传入的标题
        
        try {
          fileSaved = await this.saveMarkdownFile(
            markdown,
            outputDir,
            scope,
            documentId,
            title,
            {
              title: title,
              url: url,
              sourceURL: metadata.sourceURL || url,
              description: metadata.description,
              language: metadata.language || 'zh',
            },
            options?.checkChanges
          );
        } catch (saveError) {
          console.warn(`警告: 保存 markdown 文件失败 - ${(saveError as Error).message}`);
        }
      }
      
      return {
        success: true,
        markdown,
        metadata: {
          title: metadata.title || '未命名文档',
          description: metadata.description,
          language: metadata.language || 'zh',
          sourceURL: metadata.sourceURL || url,
        },
        fileSaved
      };
    } catch (error) {
      return {
        success: false,
        markdown: '',
        metadata: { title: '' },
        error: (error as Error).message,
      };
    }
  }

  /**
   * 从 URL 中提取 ID
   */
  private extractIdFromUrl(url: string): string {
    const idMatch = url.match(/\/detail\/([a-z0-9]+)$/);
    return idMatch ? idMatch[1] : `unknown-${Date.now()}`;
  }

  /**
   * 保存 markdown 文件到 knowledge/{scope} 目录，使用 {id}_{title} 命名格式
   */
  private async saveMarkdownFile(
    markdown: string,
    outputDir: string,
    scope: string,
    documentId: string,
    title: string,
    metadata: {
      title: string;
      url: string;
      sourceURL?: string;
      description?: string;
      language?: string;
    },
    checkChanges: boolean = false
  ): Promise<boolean> {
    // 确保 knowledge 目录根路径存在
    const knowledgeDir = path.join(__dirname, '..', '..'); // knowledge/ 目录
    const scopeDir = path.join(knowledgeDir, scope);
    await fs.mkdir(scopeDir, { recursive: true });

    // 生成前置元数据
    const frontmatter = {
      id: documentId,
      title: metadata.title,
      url: metadata.url,
      sourceURL: metadata.sourceURL || metadata.url,
      description: metadata.description,
      language: metadata.language || 'zh',
      scope: scope,
      crawledAt: new Date().toISOString(),
    };

    // 组合 markdown 内容（前置元数据 + 内容）
    const markdownContent = `---\n${
      Object.entries(frontmatter)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
    }\n---\n\n${markdown}`;

    // 生成安全的文件名：{id}_{title}.md
    const safeTitle = title
      .replace(/[<>:"/\\|?*]/g, '_') // 替换非法字符
      .replace(/\s+/g, '_') // 替换空格为下划线
      .replace(/_+/g, '_') // 多个下划线合并为一个
      .replace(/^_|_$/g, ''); // 移除开头和结尾的下划线

    const fileName = `${documentId}_${safeTitle}.md`;
    const filePath = path.join(scopeDir, fileName);

    // 检查内容是否变化
    if (checkChanges) {
      try {
        const existingContent = await fs.readFile(filePath, 'utf-8');
        // 移除 frontmatter
        const existingMarkdown = existingContent.replace(/^---\n[\s\S]*?\n---\n\n/, '');
        if (existingMarkdown.trim() === markdown.trim()) {
          return false; // 内容未变化，跳过保存
        }
      } catch (error) {
        // 文件不存在或读取失败，继续保存
      }
    }

    await fs.writeFile(filePath, markdownContent, 'utf-8');
    return true;
  }
}