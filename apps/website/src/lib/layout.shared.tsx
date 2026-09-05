import { uiTranslations } from 'fumadocs-ui/i18n'
import { i18n } from '~/lib/i18n'
import { appName, gitConfig } from './shared'
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add({
    en: {
      displayName: 'English',
    },
    zh: {
      'displayName': '简体中文',
      'Search(search dialog)': '搜索文档',
      'Search(search trigger)': '搜索',
      'No results found(search dialog)': '没有找到相关内容',
      'On this page(table of contents)': '本页目录',
      'Table of Contents(inline table of contents)': '目录',
      'Edit on GitHub(edit page)': '在 GitHub 上编辑',
      'Last updated on(page footer)': '最后更新于',
      'Previous Page(pagination)': '上一页',
      'Next Page(pagination)': '下一页',
      'Page Not Found(404 not found page)': '页面不存在',
      'Back to Home(404 not found page)': '返回首页',
      'Choose a language(language switcher)': '选择语言',
      'Copy Markdown(page actions)': '复制 Markdown',
      'View as Markdown(page actions)': '查看 Markdown',
      'Open(page actions)': '打开',
    },
  })

export function baseOptions(locale: string): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img src='/favicon.svg' width={20} height={20} alt='' />
          {appName}
        </>
      ),
      url: locale === i18n.defaultLanguage ? '/' : `/${locale}`,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  }
}
