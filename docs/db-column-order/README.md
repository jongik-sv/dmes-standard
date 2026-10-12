# DB 컬럼 순서 맞추기 레인 공통 규칙

2026-10-12 착수. 전 모듈 Oracle 표의 컬럼 순서를 규칙 순서로 맞추고, 재발을 시험으로 막는다. 근거 = `docs/idea.md` 「DB 컬럼 순서 맞추기 (2026-10-11 결정, 운영 전)」. 세션 2개에 레인으로 나눠 진행.
조정 세션 = **dmes-standard-d7**.

| 세션 | 레인 | 브랜치 |
|---|---|---|
| col-order-gen | 생성기·V1 다시 쓰기·재배치 V 파일·pdb.mjs repair·검증 | `col-order-gen` |
| col-order-guard | CommSyncMng 컬럼 명시·순서 검사 시험·기존 시험 기대값·스킬 규칙 | `col-order-guard` |

레인의 할 일·소유 파일·금지 파일 정본 = 조정 세션의 지시 메시지.

## 0. 확정 규칙 (사용자 결정 10-11·10-12)

- 컬럼 순서 = PK 컬럼(PK 제약 순서, 업무 PK 의 `VER` 포함) → 엔티티(Java)에 선언된 필드 순서(상속 필드는 부모 클래스 먼저. 단 버전·감사 컬럼은 아래처럼 뒤로) → 버전 컬럼(`VER`·`AUD_VER`·`ROW_VERSION`) → 감사 컬럼(가진 것만, 표준 8개 순서)
  - 감사 8개 표준 순서 = 감사 기반 클래스(`McmAuditEntity`·`CactusAuditEntity`·`CaravanAuditBase`) 선언 순서
  - 엔티티 없는 표 = PK 맨 앞, 버전·감사 컬럼 맨 뒤로만 옮기고 나머지는 지금 순서 유지
- 기준선: 각 스키마 `V1__baseline.sql` 의 `create table` 컬럼 줄만 규칙 순서로 다시 배열(머지된 V 파일 수정 금지의 승인된 예외, V1 한정). 손으로 쓰지 않고 생성기 스크립트로 만든다. 줄의 내용·다른 문장(시퀀스·GRANT·뷰·주석·수작업 보정)은 바꾸지 않는다
- V1 뒤 V 파일(mcm V3·V7·V13·V14, mdm V6~V9 등)은 고치지 않는다. 스키마마다 **재배치 V 파일 하나**(새 번호)를 더해, 비-PK 컬럼을 규칙 순서로 `INVISIBLE` → `VISIBLE` 한다. 새 DB(V1 부터 적용)·기존 DB 모두 이 파일 뒤에 규칙 순서가 된다
- 기존 DB = 바뀐 V1 체크섬만 repair 하면, 기동 때 Flyway 가 재배치 V 파일을 적용한다
- 공용 DB(L_MAIN·TPL_*) 반영·각 PC 안내 = 머지 뒤 조정자 몫. 레인은 자기 복제 PDB 만 쓴다
- ERD 엔진(새 표에 VER 자리, 저장된 모델의 컬럼 순서) = 이번 회차 밖(후속 회차)

## 1. 작업 방식

- 작업 방식·시험·보고·병목 대기 = 착수 지시 메시지를 따름
- 레인 안에서 파일이 겹치지 않는 항목 = 병렬 가능, 겹치면 순서대로

## 2. 작업 공간

- 레인마다 워크트리 분리(`/Users/jji/project/dmes-standard-wt/<레인>`). 기준 = `dev` 최신 커밋
- 이 리포 CLAUDE.md 와 RULE.md 의 작업 규칙을 따른다. PC별 실행 파일·경로는 각 PC 의 CLAUDE.md 와 `.coord.local.json` 이 정한다
- Oracle 시험 = 자기 복제 PDB(`scripts/oracle/pdb.mjs clone`, gradle `-Pdmes.ora.test=clone`). L_MAIN·TPL_* 에 쓰기 금지. PDB 를 만들었으면 보고 전에 `drop`
- 메인 저장소에서 실행 중인 로컬 서버·FE 의 종료·재기동 금지

## 3. 규율

- V1 다시 쓰기 = 같은 표의 컬럼 줄 집합이 그대로이고 순서만 바뀌었음을 생성기가 스스로 검사(문장 단위 비교)
- **자기 레인의 소유 파일만 수정.** 금지 파일을 고쳐야 하면 먼저 조정 세션에 질문
- 공용 파일 `scripts/oracle/pdb.mjs` = col-order-gen 소유
- **삭제 금지.** 쓰지 않는 파일 = archive 로 이동
- 커밋 = Conventional Commits. 작업 중 체크포인트 커밋, 머지 요청 직전 레인 전체를 한 커밋으로 합치고 `dev` tip 위로 옮김(`_shared/node/squash-branch.mjs --rebase`)

## 4. 머지 절차

1. col-order-gen 이 먼저 단독 머지. col-order-guard 의 B2~B4 는 그 뒤
   - col-order-guard 의 B1·B5 는 먼저 머지 가능(독립)
   - 머지 요청 직전 `dev` 최신을 합치고 시험 재실행
2. 조정 세션에 `머지 요청`. 「머지 허가」 뒤에만 메인 저장소에서 `git merge --ff-only <SHA>`
3. 머지 뒤 `머지 완료`, 워크트리 정리(`git worktree remove`, `git branch -d`) 뒤 `정리 완료`
4. 레인은 push 금지

## 5. 보고

- 형식·정본 메모·재개 확인 = 착수 지시의 「보고 방식」
