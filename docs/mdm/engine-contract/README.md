# engine-contract/ — TSK-02-02 초안 원본 (정본 아님)

이 폴더의 `java/`·`schema/`·`ts/`·`samples/` 는 TSK-02-02 설계 때 쓴 **초안 원본**이다. 2026-09 TSK-03-01 에서 정본을 옮긴 뒤로 갱신하지 않는다.

| 대상 | 정본 |
|---|---|
| JSON 스키마 | `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json` |
| Java 계약 타입 | `src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/**` |
| TS 타입 | `src/frontend/m-mdm/src/contract/engine-contract.generated.ts`(`pnpm --filter @dk-oasis/m-mdm gen:contract` 로 생성) |
| 설명 문서 | `docs/mdm/engine-contract.md` |

계약을 바꿀 때는 위 네 벌을 한 커밋에서 함께 바꾸고, 이 폴더는 건드리지 않는다.
