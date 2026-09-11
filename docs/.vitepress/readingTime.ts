import readingTime from 'reading-time'

interface MarkdownToken {
  type: string
  tag: string
  content: string
  children?: MarkdownToken[]
}

interface MarkdownState {
  Token: new (type: string, tag: string, nesting: number) => MarkdownToken
  env: {
    frontmatter?: Record<string, unknown>
  }
  tokens: MarkdownToken[]
}

interface MarkdownRenderer {
  core: {
    ruler: {
      push: (name: string, rule: (state: MarkdownState) => void) => void
    }
  }
}

function shouldShowReadingTime(state: MarkdownState) {
  const frontmatter = state.env.frontmatter ?? {}

  return (
    frontmatter.readingTime !== false &&
    frontmatter.layout !== 'home' &&
    frontmatter.layout !== 'page'
  )
}

function collectReadableText(tokens: MarkdownToken[]) {
  const text: string[] = []
  let insideTitle = false

  for (const token of tokens) {
    if (token.type === 'heading_open' && token.tag === 'h1') {
      insideTitle = true
      continue
    }

    if (token.type === 'heading_close' && token.tag === 'h1') {
      insideTitle = false
      continue
    }

    if (insideTitle || token.type !== 'inline' || !token.children) continue

    for (const child of token.children) {
      // 只统计自然语言正文，链接文字仍属于 text；行内代码和图片说明不计入。
      if (child.type === 'text') text.push(child.content)
    }
  }

  return text.join(' ')
}

export function readingTimeMarkdownPlugin(md: MarkdownRenderer) {
  md.core.ruler.push('reading-time', (state) => {
    if (!shouldShowReadingTime(state)) return

    const titleEndIndex = state.tokens.findIndex(
      (token) => token.type === 'heading_close' && token.tag === 'h1'
    )

    if (titleEndIndex === -1) return

    const stats = readingTime(collectReadableText(state.tokens))
    const minutes = Math.max(1, Math.ceil(stats.minutes))
    const words = Math.max(0, stats.words)
    const component = new state.Token('html_block', '', 0)

    component.content = `<ReadingTime :minutes="${minutes}" :words="${words}" />\n`
    state.tokens.splice(titleEndIndex + 1, 0, component)
  })
}
