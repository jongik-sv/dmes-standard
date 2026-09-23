/**
 * 엔진 공유 계약 TS 타입 생성(TSK-03-01 design.md §6.6).
 *
 * 스키마 정본은 엔진 resources 의 한 벌이다. m-mdm 에는 사본을 두지 않고 상대경로로 읽는다.
 * tests/engine-contract.generated.test.ts 가 같은 함수로 다시 생성해 커밋된 파일과 견준다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.resolve(
  HERE,
  "../../../backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json",
);
export const OUTPUT_PATH = path.resolve(HERE, "../src/contract/engine-contract.generated.ts");

// 절대경로·시각을 넣지 않는다 — 어긋남 테스트가 환경마다 달라진다.
const BANNER = `/* 생성 파일 — 직접 고치지 않는다.
 * 정본: src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json
 * 재생성: pnpm --filter @dk-oasis/m-mdm gen:contract (어긋나면 tests/engine-contract.generated.test.ts 가 실패한다) */`;

export async function generateEngineContract() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  return compile(schema, "EngineContract", {
    bannerComment: BANNER,
    unreachableDefinitions: true,
    cwd: path.dirname(SCHEMA_PATH),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT_PATH, await generateEngineContract());
}
