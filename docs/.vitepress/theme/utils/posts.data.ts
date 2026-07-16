import { createContentLoader } from 'vitepress'

export interface Post {
  title: string
  url: string
  date: string
  type: 'notes' | 'article' | 'essay'
  tags: string[]
  description?: string
  excerpt?: string
}

declare const data: Post[]
export { data }

export default createContentLoader('**/*.md', {
  excerpt: true,
  transform(rawData): Post[] {
    return rawData
      .map(({ url, frontmatter, excerpt }) => ({
        title: frontmatter.title || 'Untitled',
        url,
        date: frontmatter.date || '',
        type: frontmatter.type || 'notes',
        tags: frontmatter.tags || [],
        description: frontmatter.description || '',
        excerpt: excerpt || ''
      }))
      .filter(post => post.date && post.url !== '/') // 过滤掉首页和没有日期的文章
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }
})
