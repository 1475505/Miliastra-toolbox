export default function Tools() {
  const tools = [
    {
      name: '千星沙箱全特效预览',
      url: 'https://ys.keqizu.com/',
      description: '查看游戏中所有特效的在线预览工具',
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 p-6 pl-16 lg:pl-6">
        <h2 className="text-2xl font-semibold">工具链接</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          {tools.map((tool, idx) => (
            <a
              key={idx}
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block border border-gray-200 rounded-lg p-6 hover:border-gray-300 transition-colors"
            >
              <h3 className="font-semibold text-lg mb-2">{tool.name}</h3>
              <p className="text-gray-600 text-sm mb-3">{tool.description}</p>
              <div className="text-blue-600 text-sm">
                {tool.url} ↗
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
