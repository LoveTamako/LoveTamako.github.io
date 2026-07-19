import { createContentLoader } from 'vitepress'

export interface Post {
  title: string
  url: string
  date: string
  tags: string[]
  type: 'note' | 'post'
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
        tags: frontmatter.tags || [],
        type: frontmatter.type || 'note',
        description: frontmatter.description || '',
        excerpt: excerpt || ''
      }))
      .filter(post => post.date && post.url !== '/')
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
      )
  }
})