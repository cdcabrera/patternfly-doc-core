/**
 * ============================================================================
 * LOCAL DEVELOPMENT & TESTING STUB ONLY
 * ============================================================================
 * This configuration is used when developing or running tests locally inside
 * the @patternfly/patternfly-doc-core repository.
 *
 * NOTE: Production builds (api.patternfly.org / main.patternfly-org.pages.dev)
 * DO NOT use this file. Production is built and deployed from the consumer site
 * repository (patternfly-org) using its own root pf-docs.config.mjs.
 *
 * The package list below is statically defined to mirror the standard set of
 * core and extension packages for local verification and crawler audits. Be
 * aware when testing there is the potential for drift with this list.
 * ============================================================================
 */

export const config = {
  content: [
    // example content entry for local content, this would feed all markdown files in the content directory to the
    // documentation core with a content identifier of 'content':
    // {
    //   base: 'content',
    //   pattern: "*.md",
    //   name: 'content'
    // },
    //
    // example content entry for remote content, this would fetch all markdown files matching the glob in 'pattern'
    // from the specified npm package and serve them with a content identifier of 'react-component-docs':
    //
    // Core React Components
    {
      packageName: '@patternfly/react-core',
      pattern: '**/components/**/*.md',
      name: 'react-component-docs',
    },
    // React Table
    {
      packageName: '@patternfly/react-table',
      pattern: '**/components/**/*.md',
      name: 'react-table-docs',
    },
    // React Code Editor
    {
      packageName: '@patternfly/react-code-editor',
      pattern: '**/components/**/*.md',
      name: 'react-code-editor-docs',
    },
    // Core HTML / CSS Documentation
    {
      packageName: '@patternfly/patternfly',
      pattern: '*/**/*.md',
      name: 'core-docs',
    },
    // Quickstarts
    {
      packageName: '@patternfly/quickstarts',
      pattern: '*/patternfly-docs/**/*.md',
      name: 'quickstarts-docs',
    },
    // User Feedback Plugin
    {
      packageName: '@patternfly/react-user-feedback',
      pattern: 'patternfly-docs/**/*.md',
      name: 'user-feedback-docs',
    },
    // Data View Plugin
    {
      packageName: '@patternfly/react-data-view',
      pattern: 'patternfly-docs/**/*.md',
      name: 'data-view-docs',
    },
    // Extensions: Component Groups
    {
      packageName: '@patternfly/react-component-groups',
      pattern: '**/patternfly-docs/**/*.md',
      name: 'component-groups-docs',
    },
    // Extensions: ChatBot
    {
      packageName: '@patternfly/chatbot',
      pattern: '**/patternfly-docs/**/*.md',
      name: 'chatbot-docs',
    },
    // Extensions: Topology
    {
      packageName: '@patternfly/react-topology',
      pattern: '**/patternfly-docs/**/*.md',
      name: 'topology-docs',
    },
  ],
  outputDir: './dist',
  propsGlobs: [
    {
      include: ['*/@patternfly/react-*/src/**/*.tsx'],
      exclude: [
        '/**/examples/**',
        '/**/__mocks__/**',
        '/**/__tests__/**',
        '/**/*.test.tsx',
      ],
    },
  ],
  navSectionOrder: ['get-started', 'design-foundations'],
  scope: {},
}
