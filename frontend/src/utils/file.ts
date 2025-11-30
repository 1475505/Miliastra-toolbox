export function formatTimestamp(date: Date): string {
  const pad = (n: number, length = 2) => n.toString().padStart(length, '0')
  const YYYY = date.getFullYear()
  const MM = pad(date.getMonth() + 1)
  const DD = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  // Add underscore between date and time: yyyyMMdd_hhmmss
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`
}

export function generateDefaultFileName(originalName: string, mimeType?: string): string {
  if (!originalName) originalName = 'file'
  let base = originalName
  let ext = ''
  const lastDot = originalName.lastIndexOf('.')
  if (lastDot !== -1) {
    base = originalName.slice(0, lastDot)
    ext = originalName.slice(lastDot + 1)
  } else if (mimeType) {
    const parts = mimeType.split('/')
    if (parts.length > 1) ext = parts[1]
  }
  // sanitize base name
  base = base.trim().replace(/[\\/\\s]+/g, '_')
  const timestamp = formatTimestamp(new Date())
  return `${base}_${timestamp}${ext ? `.${ext}` : ''}`
}
