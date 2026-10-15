# scripts/archive

一次性探针/实验脚本的归档目录。这些脚本为某个已关闭的 issue（Issue #31 图标性能系列）做的一次性测量，结论已沉淀到代码和文档中，不再作为日常工具使用。

- `ordinary-icon-concurrency-experiment.mjs`：IP-P2 普通图标并发实验（证据门控的生产 bound 结论）。
- `ordinary-icon-perf-probe.mjs`：Issue #31 只读性能探针（生产域名零写入测量）。
- `ordinary-icon-scale-fixtures.mjs`：IP-P1 规模测试的 fixture 脚手架。

如需复现当时的测量，可直接用 node 运行；日常入口仍以 `package.json` 的 npm scripts 为准。
