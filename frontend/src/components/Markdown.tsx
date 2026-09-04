import ReactMarkdown, {
  defaultUrlTransform,
  type UrlTransform,
} from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * 仅对 <img src> 放行 data:image/* 的 data URI。
 * react-markdown 默认的 defaultUrlTransform 会把 data: 协议的 URL
 * 替换为空字符串，导致 base64 图片无法渲染。
 * 链接等其他场景仍走默认安全策略，避免 data:text/html 等注入风险。
 */
const DATA_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+[;,]/i

const markdownUrlTransform: UrlTransform = (url, key, node) => {
  if (
    key === 'src' &&
    node.tagName === 'img' &&
    DATA_IMAGE_PATTERN.test(url)
  ) {
    return url
  }
  return defaultUrlTransform(url)
}

interface MarkdownProps {
  children: string
}

export default function Markdown({ children }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={markdownUrlTransform}
    >
      {children}
    </ReactMarkdown>
  )
}
