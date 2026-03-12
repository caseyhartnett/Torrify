import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Torrify Docs',
  description: 'Documentation for Torrify across the web app and desktop app',
  base: '/docs/',
  themeConfig: {
    nav: [
      { text: 'Website', link: 'https://torrify.org/' },
      { text: 'GitHub', link: 'https://github.com/caseyhartnett/torrify' },
      { text: 'Docs Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started/' },
      { text: 'Features', link: '/features/' },
      { text: 'Developer', link: '/developer/' },
      { text: 'Reference', link: '/reference/' }
    ],

    sidebar: {
      '/getting-started/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/getting-started/' },
            { text: 'Start Here', link: '/getting-started/START_HERE' },
            { text: 'Install or Access Torrify', link: '/getting-started/installation' },
            { text: 'Quickstart', link: '/getting-started/QUICKSTART' },
            { text: 'Start Desktop App', link: '/getting-started/START_APP' },
            { text: 'Troubleshooting', link: '/getting-started/TROUBLESHOOTING' }
          ]
        }
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Overview', link: '/features/overview' },
            { text: 'CAD Backends', link: '/features/CAD_BACKENDS' },
            { text: 'AI Integration', link: '/features/LLM_INTEGRATION' },
            { text: 'Settings', link: '/features/SETTINGS' },
            { text: 'Streaming AI', link: '/features/STREAMING_AI' },
            { text: 'Image Import', link: '/features/IMAGE_IMPORT' },
            { text: 'Knowledge Base', link: '/features/KNOWLEDGE_BASE' },
            { text: 'Menu Bar', link: '/features/MENU_BAR' },
            { text: "What's New", link: '/features/WHATS_NEW' }
          ]
        }
      ],
      '/developer/': [
        {
          text: 'Developer',
          items: [
            { text: 'Overview', link: '/developer/' },
            { text: 'Developer Guide', link: '/developer/README' },
            { text: 'Testing', link: '/developer/TESTING' },
            { text: 'Web Deployment', link: '/developer/WEB_DEPLOYMENT' },
            { text: 'Architecture', link: '/architecture/' }
          ]
        }
      ],
      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/' },
            { text: 'System Architecture', link: '/architecture/ARCHITECTURE' },
            { text: 'Web Runtime Transition', link: '/architecture/WEBSERVICE_TRANSITION_PLAN' },
            { text: 'Windows Build Requirements', link: '/architecture/WINDOWS_BUILD_REQUIREMENTS' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Runtime Matrix', link: '/reference/RUNTIME_MATRIX' },
            { text: 'FAQ', link: '/reference/faq' },
            { text: 'Quick Reference', link: '/reference/QUICK_REFERENCE' },
            { text: 'Project Format', link: '/reference/PROJECT_FORMAT' }
          ]
        }
      ],
      '/security/': [
        {
          text: 'Security',
          items: [{ text: 'Security Overview', link: '/security/' }]
        }
      ],
      '/': [
        {
          text: 'General',
          items: [
            { text: 'Documentation Home', link: '/' },
            { text: 'Getting Started', link: '/getting-started/' },
            { text: 'Features', link: '/features/' },
            { text: 'Developer', link: '/developer/' },
            { text: 'Reference', link: '/reference/' },
            { text: 'Security', link: '/security/' }
          ]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/caseyhartnett/torrify' }],

    footer: {
      message: 'Released under GPL-3.0.',
      copyright: 'Copyright © 2026 Torrify'
    }
  },
  ignoreDeadLinks: false
})
