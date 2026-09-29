/**
 * `import src from "inline-worker:./x.worker.ts"` — 그 파일을 따로 한 덩어리(IIFE)로 묶어 소스 문자열로 넣는다. 화면은 이 문자열을
 * Blob URL 로 띄운다(`new Worker(new URL(…, import.meta.url))` 는 dist 를 가져다 쓰는 포털 번들러가 경로를 따라가야 해서 쓰지 않는다).
 *
 * - tsup(esbuild): 실제로 묶는다. watch 는 worker 가 가져다 쓰는 파일이 바뀌어도 다시 묶는다.
 * - vitest(vite): 빈 문자열 — 화면 코드가 Worker 를 못 띄우고 즉시(동기) 검사로 돈다.
 */
import path from "node:path";

import type { Options } from "tsup";
import type { Plugin as VitePlugin } from "vitest/config";

type EsbuildPlugin = NonNullable<Options["esbuildPlugins"]>[number];

const PREFIX = "inline-worker:";
const NAMESPACE = "inline-worker";

export function inlineWorkerEsbuild(): EsbuildPlugin {
  return {
    name: "inline-worker",
    setup(build) {
      build.onResolve({ filter: /^inline-worker:/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.slice(PREFIX.length)),
        namespace: NAMESPACE,
      }));
      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async (args) => {
        const out = await build.esbuild.build({
          entryPoints: [args.path],
          bundle: true,
          format: "iife",
          platform: "browser",
          target: "es2022",
          charset: "utf8",
          minify: true,
          write: false,
          metafile: true,
          absWorkingDir: process.cwd(),
        });
        const code = out.outputFiles[0].text;
        return {
          contents: `export default ${JSON.stringify(code)};`,
          loader: "js",
          watchFiles: Object.keys(out.metafile.inputs).map((f) => path.resolve(process.cwd(), f)),
        };
      });
    },
  };
}

export function inlineWorkerViteStub(): VitePlugin {
  return {
    name: "inline-worker-stub",
    enforce: "pre",
    resolveId(id) {
      return id.startsWith(PREFIX) ? `\0${id}` : null;
    },
    load(id) {
      return id.startsWith(`\0${PREFIX}`) ? 'export default "";' : null;
    },
  };
}
