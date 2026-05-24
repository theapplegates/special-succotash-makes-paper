import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import config from "./astro-paper.config";
export default defineConfig({
  site: config.site.url,
  integrations: [
    mdx(),
    sitemap({
      filter: page =>
        config.features?.showArchives !== false || !page.endsWith("/archives/"),
    }),
  ],
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    remarkPlugins: [remarkToc, [remarkCollapse, { test: "Table of contents" }]],
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Wotfard",
      cssVariable: "--font-wotfard",
      provider: fontProviders.local(),
      fallbacks: ["sans-serif"],
      weights: [100, 200, 300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
      formats: ["woff2", "ttf"],
      options: {
        variants: [
          {
            weight: 100,
            style: "normal",
            src: [
              "./src/assets/fonts/Wotfard-Roman/woff2/wotfard-thin-webfont.woff2",
              "./src/assets/fonts/Wotfard-Roman/ttf/wotfard-thin-webfont.ttf",
            ],
          },
          {
            weight: 200,
            style: "normal",
            src: [
              "./src/assets/fonts/Wotfard-Roman/woff2/wotfard-extralight-webfont.woff2",
              "./src/assets/fonts/Wotfard-Roman/ttf/wotfard-extralight-webfont.ttf",
            ],
          },
          {
            weight: 300,
            style: "normal",
            src: [
              "./src/assets/fonts/Wotfard-Roman/woff2/wotfard-light-webfont.woff2",
              "./src/assets/fonts/Wotfard-Roman/ttf/wotfard-light-webfont.ttf",
            ],
          },
          {
            weight: 400,
            style: "normal",
            src: [
              "./src/assets/fonts/Wotfard-Roman/woff2/wotfard-regular-webfont.woff2",
              "./src/assets/fonts/Wotfard-Roman/ttf/wotfard-regular-webfont.ttf",
            ],
          },
          {
            weight: 500,
            style: "normal",
            src: [
              "./src/assets/fonts/Wotfard-Roman/woff2/wotfard-medium-webfont.woff2",
              "./src/assets/fonts/Wotfard-Roman/ttf/wotfard-medium-webfont.ttf",
            ],
          },
          {
            weight: 600,
            style: "normal",
            src: [
              "./src/assets/fonts/Wotfard-Roman/woff2/wotfard-semibold-webfont.woff2",
              "./src/assets/fonts/Wotfard-Roman/ttf/wotfard-semibold-webfont.ttf",
            ],
          },
          {
            weight: 700,
            style: "normal",
            src: [
              "./src/assets/fonts/Wotfard-Roman/woff2/wotfard-bold-webfont.woff2",
              "./src/assets/fonts/Wotfard-Roman/ttf/wotfard-bold-webfont.ttf",
            ],
          },
          {
            weight: 100,
            style: "italic",
            src: [
              "./src/assets/fonts/Wotfard-Italic/woff2/wotfard-thinitalic-webfont.woff2",
              "./src/assets/fonts/Wotfard-Italic/ttf/wotfard-thinitalic-webfont.ttf",
            ],
          },
          {
            weight: 200,
            style: "italic",
            src: [
              "./src/assets/fonts/Wotfard-Italic/woff2/wotfard-extralightitalic-webfont.woff2",
              "./src/assets/fonts/Wotfard-Italic/ttf/wotfard-extralightitalic-webfont.ttf",
            ],
          },
          {
            weight: 300,
            style: "italic",
            src: [
              "./src/assets/fonts/Wotfard-Italic/woff2/wotfard-lightitalic-webfont.woff2",
              "./src/assets/fonts/Wotfard-Italic/ttf/wotfard-lightitalic-webfont.ttf",
            ],
          },
          {
            weight: 400,
            style: "italic",
            src: [
              "./src/assets/fonts/Wotfard-Italic/woff2/wotfard-regularitalic-webfont.woff2",
              "./src/assets/fonts/Wotfard-Italic/ttf/wotfard-regularitalic-webfont.ttf",
            ],
          },
          {
            weight: 500,
            style: "italic",
            src: [
              "./src/assets/fonts/Wotfard-Italic/woff2/wotfard-mediumitalic-webfont.woff2",
              "./src/assets/fonts/Wotfard-Italic/ttf/wotfard-mediumitalic-webfont.ttf",
            ],
          },
          {
            weight: 600,
            style: "italic",
            src: [
              "./src/assets/fonts/Wotfard-Italic/woff2/wotfard-semibolditalic-webfont.woff2",
              "./src/assets/fonts/Wotfard-Italic/ttf/wotfard-semibolditalic-webfont.ttf",
            ],
          },
          {
            weight: 700,
            style: "italic",
            src: [
              "./src/assets/fonts/Wotfard-Italic/woff2/wotfard-bolditalic-webfont.woff2",
              "./src/assets/fonts/Wotfard-Italic/ttf/wotfard-bolditalic-webfont.ttf",
            ],
          },
        ],
      },
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
      PUBLIC_CLOUDINARY_CLOUD_NAME: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});
