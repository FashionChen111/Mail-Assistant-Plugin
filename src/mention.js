function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildTriggerRegex(explicitPrefix = '@mail') {
  const prefix = typeof explicitPrefix === 'string' && explicitPrefix.trim()
    ? explicitPrefix.trim()
    : '@mail'
  const escaped = escapeRegExp(prefix)
  return new RegExp(`(?<![A-Za-z0-9_.-])${escaped}(?![A-Za-z0-9_-]|\\.[A-Za-z0-9])`, 'i')
}

export function containsMailTrigger(text, explicitPrefix = '@mail') {
  if (typeof text !== 'string' || text.length === 0) return false
  return buildTriggerRegex(explicitPrefix).test(text)
}

function extractMessageText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(block)
    } else if (block && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

export function isUserMessageTriggeringMail(message, explicitPrefix = '@mail') {
  if (!message || typeof message !== 'object') return false
  if (message.source?.kind !== 'user') return false
  const text = extractMessageText(message.content)
  return containsMailTrigger(text, explicitPrefix)
}
