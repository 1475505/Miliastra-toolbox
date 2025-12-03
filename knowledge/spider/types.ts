/**
 * 通用类型定义 - 简化版本
 * 只保留 URL 和 Firecrawl 相关的类型定义
 */

// URL相关类型（与业务逻辑相关，不依赖具体服务）
export interface URLEntry {
  id: string;
  title: string;
  url: string;
  scope: string;
  uniqueId: string; // 用于去重的唯一标识符
  updated_at?: string;
}

export interface URLConfig {
  entries: URLEntry[];
  metadata: {
    source: string;
    extractedAt: string;
    totalCount: number;
    scopes: Record<string, number>;
  };
}

// 爬取配置类型（通用配置结构）
export interface CrawlConfig {
  entries: URLEntry[];
  metadata?: {
    source?: string;
    extractedAt?: string;
    totalCount?: number;
    scopes?: Record<string, number>;
  };
}

// 与业务逻辑相关的Firecrawl包装接口（便于迁移和统一管理）
export interface ScrapeResult {
  success: boolean;
  markdown: string;
  metadata: {
    title: string;
    description?: string;
    language?: string;
    sourceURL?: string;
  };
  error?: string;
}

/**
 * 爬取任务结果接口
 * 封装了从 startCrawl 和 getCrawlStatus 返回的数据
 * 与Firecrawl API直接相关
 */
export interface URLExtractResult {
  entries: URLEntry[];
  totalPages: number;
  completedPages: number;
}