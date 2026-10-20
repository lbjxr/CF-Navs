// ESLint flat config（代码审查三轮第 6 项）。
//
// 目标：低噪声、能在现有代码上直接通过，只拦真实问题（未使用的变量 / 导入、
// 明显的逻辑错误等）。不做格式化、不接 Prettier：缩进、引号、分号等风格交给
// .editorconfig 与评审，避免一次性全仓库重排。
//
// 规则集：@eslint/js recommended + typescript-eslint recommended（非 type-aware，
// 类型层面的检查已由 `npm run type-check` 负责，不重复付出 typed lint 的耗时）+
// eslint-plugin-svelte recommended。下方关掉 / 调整的规则都注明了原因。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'

const SVELTE_FILES = ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js']

export default tseslint.config(
  {
    // 构建产物、依赖、本地 Wrangler 状态与归档目录不参与检查。浏览器扩展是独立发布的
    // MV3 经典脚本（非 ES 模块、chrome.* 全局），不在本轮范围内。
    ignores: [
      'browser-extension/**',
      'dist/**',
      'dist-server/**',
      'node_modules/**',
      '.wrangler/**',
      'tmp/**',
      '_archive/**',
      'coverage/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  // eslint-plugin-svelte 的 recommended 规则块不带 files，会套到所有文件上；其中
  // svelte/no-inner-declarations 在 CommonJS / 经典脚本里会直接崩溃（scope 为空），
  // 且这些规则只对组件与 runes 模块有意义，因此收窄到 .svelte / .svelte.{ts,js}。
  ...svelte.configs.recommended.map((config) =>
    config.files || !config.rules ? config : { ...config, files: SVELTE_FILES },
  ),

  // 运行环境：前端（浏览器）、Worker（Service Worker 风格全局）、共享代码两边都会用。
  {
    files: ['src/**/*.{ts,js,svelte}', 'shared/**/*.ts', 'worker/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
  // 测试、脚本与根目录配置文件跑在 Node 下（测试也会用到 DOM 全局，jsdom project）。
  {
    files: ['tests/**/*.ts', 'scripts/**/*.{js,mjs,cjs}', '*.{js,ts,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Service Worker 源文件（Vite 原样复制到 dist）。
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  // 使用指引页脚本（Vite 原样复制到 dist，纯浏览器环境）。
  {
    files: ['public/guide/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      // CommonJS 脚本只能用 require。
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Svelte 组件里的 <script lang="ts"> 交给 typescript-eslint 解析。
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  // runes 模块（.svelte.ts，如 tests/helpers/reactiveState.svelte.ts）同样由 svelte 解析器
  // 接管以识别 $state 等 rune，脚本本体需交给 typescript-eslint 解析（否则泛型等 TS 语法报错）。
  {
    files: ['**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  {
    rules: {
      // 与 tsconfig 的 noUnusedLocals / noUnusedParameters 保持同一约定：
      // 刻意保留的形参、解构剩余与 catch 变量用 `_` 前缀标注意图。
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // `interface X extends Y {}` 在本仓库用作具名别名（StoredAuthSession、各 *State），
      // 只放行「单一 extends」这种写法，真正的空对象类型仍报错。
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
    },
  },

  // Svelte 规则中三条与现有写法冲突、开启会造成大面积改动或行为变化，暂时关闭：
  {
    files: SVELTE_FILES,
    rules: {
      // 启发式规则，对「async 函数 + 令牌栅栏」的图标加载流程（BookmarkCard /
      // SpotlightBookmarkIcon / Home）报出 38 处疑似循环，均为误报；行为由组件测试覆盖。
      'svelte/infinite-reactive-loop': 'off',
      // 要求可变 Set / Map 改用 SvelteSet / SvelteMap。现有代码中它们是函数内的临时
      // 集合或以不可变方式整体替换，改写会触及响应式语义（15 处），不值得为 lint 改。
      'svelte/prefer-svelte-reactivity': 'off',
      // 给 {#each} 补 key 会改变 DOM 复用方式（keyed each），属于行为变化；
      // 现有 9 处都是短的静态 / 只读列表，补 key 留给需要时逐个评估。
      'svelte/require-each-key': 'off',
    },
  },

  // 测试替身大量使用 `any` 构造部分对象（约 100 处 / 24 个文件）；类型正确性由
  // tsconfig.tests.json 的类型检查负责，这里不再重复要求。
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // scripts/ 是 CDP / 本地回归与验收脚本：
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    rules: {
      // 清理失败必须让脚本失败，finally 中有意 throw（恢复网络 / 下载行为 / 会话撤销失败）。
      'no-unsafe-finally': 'off',
      // 中断探针在页面内用 `debugger` 作为 CDP Debugger 的暂停点（测试显式启用并在 finally 恢复）。
      'no-debugger': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.svelte'],
    rules: {
      // TypeScript 自己就会报未定义标识符，且 no-undef 不理解类型 / 环境声明
      // （typescript-eslint 官方建议在 TS 文件中关闭）；.js / .mjs 仍保留。
      'no-undef': 'off',
    },
  },
)
