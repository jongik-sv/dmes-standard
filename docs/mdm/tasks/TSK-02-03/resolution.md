# TSK-02-03 머지 충돌 해소 기록

## 시도 1

- 기준 HEAD: `7fc2380`(origin/dev) · 머지 대상: `origin/agent/7b4c7ea2-erd-design`(`ccf7c68`)
- `docs/mdm/decisions.md` — R1. 양쪽이 파일 끝에 결정 항목을 이어 붙이며 같은 번호를 썼다(개발 브랜치 D-020~D-031: TSK-02-02·TSK-01-02, 이 브랜치 D-020~D-022: TSK-02-03). 개발 브랜치 항목과 순서를 그대로 두고 이 브랜치 세 항목을 뒤에 붙여 D-032·D-033·D-034 로 다시 번호를 매겼다. 내용이 겹치는 항목은 없다.
- 번호 변경에 따른 참조 갱신(이 브랜치가 추가한 문장만, 개발 브랜치의 D-0xx 참조는 손대지 않음): 이 브랜치의 옛 D-022(AUD_VER 개명)를 가리키던 곳을 D-034 로 바꿨다. 그대로 두면 개발 브랜치의 D-022(엔진 AST JSON 스키마)를 가리키게 된다.
  - `docs/mdm/naming-dialect-rules.md` §2 예외 항목·§6.1 인계 표 두 행(텍스트 충돌 없이 자동 머지된 파일)
  - `docs/mdm/erd/README.md` 이탈 1번, `docs/mdm/erd/verify/Verify.java` 주석 한 줄, `docs/mdm/erd/04-master-code.sqlite.sql` 머리말 주석("D-020 계열" → D-034)
  - `docs/mdm/tasks/TSK-02-03/design.md` M2·V5·D8 Source·Build 이탈 1번(R7, 이 Task 폴더)
- 의미 확인: 개발 브랜치 D-024(TB_MDM_TERM EMBEDDING 칼럼)는 이 브랜치 design D4 가 범위 밖으로 둔 항목이라 ERD 초안과 충돌하지 않는다. D-031(보류 테이블 DDL 은 TSK-02-03 담당)은 이 브랜치 산출물과 맞는다.
- ERD 검증 스크립트 `Verify.java` 체크 a~i 를 머지 결과 트리에서 다시 돌려 모두 PASS.
- 게이트: 개발 브랜치 447 · MERGE_HEAD 단독 395 · 결과 447 (신규 실패 0, `./gradlew testAll`)
