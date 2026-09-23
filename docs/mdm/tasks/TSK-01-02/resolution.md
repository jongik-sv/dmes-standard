# TSK-01-02 머지 충돌 해소 기록

## 시도 1

- 기준: 개발 브랜치 `dev` @ 9b0e665 (TSK-02-02 승인 전 머지 직후), 머지 대상 `origin/agent/eb6fdb44-shared-contract` @ ea64ea4.
- `docs/mdm/decisions.md` — R8(+R1). 양쪽이 D-019 뒤에 같은 번호 D-020~D-025 를 새로 붙였다(개발 브랜치 쪽 TSK-02-02, 이 브랜치 쪽 TSK-01-02). 개발 브랜치 쪽 D-020~D-025 는 그대로 두고, 이 브랜치의 여섯 항목을 그 뒤에 D-026~D-031 로 번호만 바꿔 붙였다(본문은 한 글자도 바꾸지 않음). 개발 브랜치 쪽 번호는 `engine-contract.md`·`term-embedding.md`·`tasks/TSK-02-02/design.md` 가 참조하므로 바꿀 수 없고, 이 브랜치 쪽 D-020~D-025 는 decisions.md 밖에서 참조하는 곳이 없어(`git grep 'D-02[0-9]'` docs/mdm·src/backend/mdm·src/frontend/m-mdm) 다시 매겨도 깨지는 참조가 없다. 번호 대응: D-020→D-026(mdmSample dma 이동), D-021→D-027(계약 패키지), D-022→D-028(방언 실측·MSSQL 검증), D-023→D-029(MdmErrorCode), D-024→D-030(TB_MDM_SYSTEM 초기 행), D-025→D-031(보류 테이블 DDL 제외). `tasks/TSK-01-02/design.md` 의 `D1`~`D10` 은 design 내부 번호라 바꾸지 않는다.
- `docs/mdm/naming-dialect-rules.md` — 텍스트 충돌 없이 자동 머지(개발 브랜치 #23 행, 이 브랜치 #14~#16 행·§5 판정 문장). 두 변경이 서로 다른 행이라 모두 살아 있음을 확인했다.
- 게이트: 개발 브랜치 396 · MERGE_HEAD 단독 448 · 결과 448
  - 총수 = backend `testAll --rerun-tasks` + m-mdm vitest. 개발 브랜치 395+1, MERGE_HEAD 단독 447+1, 결과 447+1, 신규 실패 0.
  - 보조(총수 밖): m-mdm `tsc --noEmit` 기준선과 같은 1건(`@dk-oasis/shared/layout` 미빌드), m-mcm eslint 23 errors / 44 warnings 기준선과 같음.
