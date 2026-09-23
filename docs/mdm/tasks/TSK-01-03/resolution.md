# TSK-01-03 머지 충돌 해소 기록

## 시도 1

- 기준: `origin/dev` aa8b8f5 · 머지 대상 `origin/agent/c7f0c4f6-shell-rbac-version` ebac351 (merge-base 7fc2380)
- 충돌 파일 2개. 양쪽이 함께 고친 파일은 이 둘과 `ContractStubCompileTest.java`(자동 병합, 컴파일·시험 통과) 셋이다.

| 파일 | 규약 | 판단 |
|---|---|---|
| `src/frontend/m-mdm/src/index.ts` | R1·R8 | 개발 브랜치의 `export type * from "./contract/engine-contract.generated";`(TSK-03-01)를 앞에, 이 브랜치의 `export * from "./shell";` 을 뒤에 둔다. 머리 주석은 두 재수출을 모두 설명하도록 합쳤다. `engine-contract.generated.test.ts` 의 재수출 문자열 단언이 그대로 참이다 |
| `docs/mdm/decisions.md` | R8(+R1 순서) | 개발 브랜치의 D-032~D-038(TSK-02-03·TSK-04-01)은 번호·위치를 그대로 두고, 이 브랜치의 8건을 그 뒤에 붙였다. 이 브랜치 항목이 D-035~D-042 로 개발 브랜치 항목과 번호가 겹쳐 D-039~D-046 으로 옮겼다(D-035→D-039, D-036→D-040, D-037→D-041, D-038→D-042, D-039→D-043, D-040→D-044, D-041→D-045, D-042→D-046). 본문은 고치지 않았다 |
| `docs/mdm/tasks/TSK-01-03/design.md` | R7 | 이 Task 폴더라 이 브랜치 판이다. decisions 번호를 적은 두 줄(E6·X12)에 D-039~D-046 으로 옮겼다는 문장만 덧붙였다. 서버 결정 key(D1~D11)는 design.md 안의 번호라 바뀌지 않는다 |

- 게이트: 개발 브랜치 1373 · MERGE_HEAD 단독 687 · 결과 1456 (신규 실패 0, GATE_PASS need=1373)
  - 백엔드 `./gradlew testAll`: 개발 브랜치 1211 · MERGE_HEAD 510 · 결과 1274 (1211 + 이 브랜치가 더한 63), 실패 0
  - m-mdm `vitest`: 개발 브랜치 6 · MERGE_HEAD 21 · 결과 26, 실패 0
  - shared `test:unit:shared`: 156 · 156 · 156, 실패 0
  - m-mdm `tsc --noEmit`(build:libs 뒤)·`tsup` 빌드 통과
