import type { Config } from "@docusaurus/types";
import type { Options, ThemeConfig } from "@docusaurus/preset-classic";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "Agility Workbench",
  tagline: "A fast, composable data grid for serious web applications.",
  favicon: "img/favicon.svg",
  url: "https://agilityworkbench.dev",
  baseUrl: "/",
  organizationName: "agility-workbench",
  projectName: "agility-workbench",
  onBrokenLinks: "throw",
  markdown: { mermaid: false },
  plugins: [
    function generatedModuleCompatibilityPlugin() {
      return {
        name: "agility-generated-module-compatibility",
        configureWebpack() {
          return {
            module: {
              rules: [
                {
                  test: /[\\/]\.docusaurus[\\/](registry|client-modules)\.js$/,
                  type: "javascript/auto",
                },
              ],
            },
          };
        },
      };
    },
  ],
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts",
          showLastUpdateTime: true,
          editUrl: "https://github.com/agility-workbench/agility-workbench/edit/main/apps/docs/",
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Options,
    ],
  ],
  themeConfig: {
    image: "img/social-card.svg",
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Agility Workbench",
      logo: { alt: "Agility Workbench", src: "img/logo-mark.svg" },
      items: [
        { type: "docSidebar", sidebarId: "docs", position: "left", label: "Documentation" },
        { to: "/docs/examples/columns", label: "Examples", position: "left" },
        { to: "/docs/api/grid-options", label: "API", position: "left" },
        { href: "https://github.com/agility-workbench/agility-workbench", label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Learn",
          items: [
            { label: "Getting started", to: "/docs/getting-started/installation" },
            { label: "Examples", to: "/docs/examples/columns" },
            { label: "API reference", to: "/docs/api/grid-options" },
          ],
        },
        {
          title: "Packages",
          items: [
            { label: "Core", href: "https://www.npmjs.com/package/@agility-workbench/grid" },
            { label: "React", href: "https://www.npmjs.com/package/@agility-workbench/react-grid" },
            { label: "Angular", href: "https://www.npmjs.com/package/@agility-workbench/angular-grid" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: "https://github.com/agility-workbench/agility-workbench" },
            { label: "Issues", href: "https://github.com/agility-workbench/agility-workbench/issues" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Agility Workbench. MIT licensed.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "typescript"],
    },
  } satisfies ThemeConfig,
};

export default config;
