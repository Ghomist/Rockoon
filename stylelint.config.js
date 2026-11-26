// @ts-check

/**
 * 只检查 src 下的 .css（Tailwind v4 + 自己写的变量 / 动效）。
 * 以前 Vue 时代的 scss / vue / html 配置已经去掉：那几个插件早就不在依赖里，留着会让 stylelint 直接报错退出。
 * 不排属性顺序、不管空行：styles.css 是紧凑写法；自动重排属性还可能把简写 / 展开写法的先后换掉，改变覆盖结果。
 *
 * @type {import("stylelint").Config}
 */
export default {
  extends: ["stylelint-config-standard"],
  plugins: ["stylelint-prettier"],
  rules: {
    "prettier/prettier": true,
    "selector-class-pattern": null,
    "no-descending-specificity": null,
    // Tailwind v4 的指令
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "tailwind",
          "theme",
          "custom-variant",
          "variant",
          "utility",
          "plugin",
          "source",
          "apply",
          "config",
          "reference"
        ]
      }
    ],
    "rule-empty-line-before": null,
    "at-rule-empty-line-before": null,
    "comment-empty-line-before": null,
    "declaration-empty-line-before": null,
    "custom-property-empty-line-before": null,
    // 颜色沿用 shadcn 的 oklch 写法（亮度用小数、色相不带 deg）
    "lightness-notation": null,
    "hue-degree-notation": null,
    // 字体名（Consolas、Menlo）按原样大写
    "value-keyword-case": ["lower", { ignoreKeywords: ["/^[A-Z]/"] }],
    // Tailwind / 包名的 @import 不能写成 url()
    "import-notation": "string"
  },
  ignoreFiles: ["**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx", "report.html"]
};
