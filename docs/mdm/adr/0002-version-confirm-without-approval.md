# ADR-0002: 결재·배포·수신 보류 하의 버전 확정 규칙과 보류 테이블 원칙

- **Status**: PROPOSED
- **Date**: 2026-09-24
- **Decision Date**: —
- **Context Tags**: MDM, VERSION, CONFIRM, APPROVAL-DEFERRED, DDL

## 쉬운 설명 (현업용 요약)

지금은 결재 절차 없이 담당자가 직접 '확정'을 누르면 새 버전이 정해진 적용 시각부터 효력을 갖는다.
확정할 때에는 원래 결재를 올릴 때 하던 검사를 그대로 하되, 결재·배포와 관련된 검사는 빼고
"새 버전의 적용 시각이 직전 버전보다 뒤인가" 로 바꾸어 본다.

아직 효력이 생기지 않은 버전은 한 번에 하나만 둘 수 있다. 확정을 취소하는 기능이 없으므로,
적용 시각을 미래로 잘못 정해 확정하면 그 시각이 올 때까지 바로잡을 수 없다. 그래서 확정 화면은
미래 시각으로 확정할 때 한 번 더 확인을 받는다.

나중에 결재와 배포를 붙일 때 표를 다시 만들지 않도록, 결재·배포·수신에 쓰는 칸과 표는 지금
미리 만들어 두고 비워 둔다.

## Context (배경)

- PRD §2 규칙 7(사용자 결정 2026-09-23, `docs/mdm/decisions.md` D-010·D-011)은 결재·배포·수신을 이번에 구현하지 않고, 04 마스터코드·06 업무기준 버전을 **결재 없이 담당자가 직접 확정**(DRAFT→RELEASED)하게 했다. 검사 8항 중 3항은 apply_from 순서 검사로 대체하고, 결재자 역할도 두지 않는다. DDL 은 설계대로 두고 동작·화면만 뺀다.
- 원천 04·06 은 버전 상태 5종(DRAFT/REQUESTED/APPROVED/RELEASED/CANCELLED)과 상위 객체 상태 3종(CREATED/INUSE/DEPRECATED), 결재 칸(`requested_by, requested_at, emergency_yn, emergency_reason, approved_by, approved_at, reject_reason, released_at, cancelled_at, cancel_reason`)을 정의한다. 결재 칸에는 NOT NULL·CHECK 명시가 없다.
- 원천 06 안에서 "미적용 버전" 정의가 갈린다. 06:1146 은 04:284 와 같이 "DRAFT·REQUESTED·APPROVED 와 apply_from 이 오지 않은 RELEASED" 이고, 06:762·998·1207 은 DRAFT·REQUESTED·APPROVED 만 적는다.
- CREATED→INUSE 는 04:251 "첫 RELEASED 의 apply_from 이 지나면", 06:952 "되면" 이라고만 적었고 무엇이 전이를 일으키는지는 정하지 않았다.
- 활성 테이블에도 배포 칸이 있다: `chg_seq BIGINT NOT NULL`(TB_MDM_DOMAIN·COLUMN·UNIT, 05 네 테이블), `last_chg_seq`(TB_MDM_CODE·TB_MDM_DATA, TB_MDM_DICT_SEQ). 배포를 하지 않으면 이 칸을 채울 주체가 없다.

## Decision (결정)

- **D1 상태와 전이**: 상태 상수 5종과 상위 상태 3종의 이름과 뜻은 원천 그대로 둔다. 이번 범위의 전이는 아래뿐이다.

  | 전이 | 이번 범위 | 조건 |
  |---|---|---|
  | (없음) → DRAFT | 있음 | 새 버전(04: 빈 버전/복원, 06: 정의 복사). 만든 사람이 자동 선점(`owner_id`). 미적용 버전이 있으면 거부 |
  | DRAFT → RELEASED | 있음(**담당자 확정**) | D4 확정 트랜잭션 |
  | DRAFT → (삭제) | 있음 | 소유자만. 06 은 VAR·ROW CASCADE(06:1154) |
  | 상위 CREATED → INUSE | 있음(자동) | D6 |
  | DRAFT→REQUESTED, REQUESTED→DRAFT(반려), REQUESTED→APPROVED, APPROVED→DRAFT(승인 취소), APPROVED→RELEASED(배포), RELEASED→CANCELLED(철회) | **없음** | PRD 규칙 7. 상태 값 REQUESTED·APPROVED·CANCELLED 는 데이터에 생기지 않는다 |
  | 상위 INUSE → DEPRECATED | 원천대로(04:252 — 미적용 버전이 없을 때) | 각 영역 Task |

- **D2 미적용 버전 하나 규칙**: 미적용 버전 = `DRAFT` + `apply_from` 이 현재 시각보다 뒤인 `RELEASED` 다. 하나라도 있으면 새 버전을 만들 수 없다. 04·06 공통이다(04:284, 06:1146 — 원천 안에서 규칙을 정의하는 문장을 따른다). 이번 범위에는 REQUESTED·APPROVED 가 생기지 않으므로 원천 정의와 결과가 같다. 동시 생성으로 둘이 생기면 저장·확정을 막고 DRAFT 삭제로 유도한다(04:293-301. 부분 유니크 인덱스·행 잠금은 쓰지 않는다).
- **D3 DRAFT 소유권**: `owner_id` 가 빈 DRAFT 는 담당자 역할 보유자가 선점한다. 해제·넘기기·저장·삭제·확정은 소유자만 한다. 넘기기를 받는 사람도 담당자 역할 보유자여야 한다. 관리자 강제 해제·넘기기는 없다(04:303, 06:995·999). 다른 사용자는 읽기와 값 테스트만 한다(06:997). 소유권은 역할이 아니라 `owner_id` 로 판정하고, 역할은 "할 수 있는가" 만 판정한다(06:1001). `row_version` 은 저장·상태 전이마다 검사하고 1 올린다. `owner_id` 는 확정 뒤에도 지우지 않는다(RELEASED 뒤에는 기록으로만 남는다).
- **D4 확정 트랜잭션**: 한 트랜잭션으로 처리하며, 하나라도 실패하면 전부 롤백하고 DRAFT 는 그대로 남는다.
  1. 호출자가 DRAFT 소유자이고 `confirm` 권한(담당자)을 가졌는지 확인한다.
  2. 요청의 `row_version` 과 저장값을 비교해 다르면 409 로 거부한다.
  3. 대상별 확정 검사 SPI 를 호출한다.
     - 04: 「상신 시 검사」 1·2·4·6·7·8항 거부 검사, 2-1·2-2 경고(확인 후 진행). **3항은 대체 규칙** — 희망 apply_from 이 직전 RELEASED 버전의 apply_from 보다 뒤(엄격한 `>`)여야 하고, 최초 버전은 면제한다. **5항(배포 대상 1개 이상, 경고)은 건너뛴다** — 배포 대상 지정이 보류라 항상 경고가 되고, 경고는 확정을 막지 않으므로 결과가 같다.
     - 06: 저장 시 검사 전부 + 기대값 있는 테스트 케이스 전부 통과 + 앞 룰 RELEASED 확인(PRD FR-E4) + apply_from 순서(같은 대체 규칙). 룰 참조 검사(배포 대상 시스템 기준)는 하지 않는다(PRD 규칙 7).
  4. 대상 버전: `status='RELEASED'`, `apply_from` = 희망 일시, `apply_to='9999-12-31 00:00:00'`, 결재 칸은 D5, `row_version` + 1.
  5. 직전 RELEASED 버전: `apply_to` = 새 버전의 `apply_from`.
  6. 상위 객체 CREATED→INUSE 판정(D6).
- **D5 결재 칸 처리**: 확정 때 `requested_by` = 확정자, `requested_at` = 확정 일시, `released_at` = 확정 일시로 채운다. `approved_by`·`approved_at`·`emergency_yn`·`emergency_reason`·`reject_reason`·`cancelled_at`·`cancel_reason` 은 NULL 로 둔다. 판별식은 `status='RELEASED' AND approved_by IS NULL` ⇒ 결재 없이 담당자가 직접 확정한 버전이다. 확정자는 `requested_by` 에서 되찾는다 — 감사 칼럼 `U_USR_ID`/`U_AT` 는 다음 버전 확정 때 직전 버전의 `apply_to` 를 닫는 UPDATE 로 덮이므로 확정자 기록으로 쓸 수 없다. 04·06 공통이다.
- **D6 CREATED→INUSE 자동 전이**: 확정 트랜잭션에서 apply_from ≤ 확정 시각이면 즉시 올린다. 그 밖에는 상위 객체의 쓰기 경로(새 버전·헤더 수정·폐기 등)에 들어갈 때 같은 트랜잭션에서 올린다. 조회 응답은 저장 값 대신 계산 값(CREATED 이면서 apply_from ≤ 현재 시각인 RELEASED 가 있으면 INUSE)을 돌려준다. 경계는 포함(`apply_from ≤ 현재 시각`)이며, 적용 구간을 `[apply_from, apply_to)` 로 보는 것과 맞춘다.
- **D7 보류 테이블 원칙**:
  - 대상: 배포 대상 `TB_MDM_CODE_SYSTEM`·`TB_MDM_DATA_SYSTEM`·`TB_MDM_RULE_SYSTEM`·`TB_MDM_DICT_SYSTEM`(`TB_MDM_COLUMN_SYSTEM` 은 칼럼 매핑이라 제외, `TB_MDM_SYSTEM` 은 활성), 배포 순번 `TB_MDM_DICT_SEQ` 와 활성 테이블의 `CHG_SEQ`·`LAST_CHG_SEQ` 칼럼, 수신 로그 `TB_MDM_CODE_RECV`·`TB_MDM_DATA_RECV`·`TB_MDM_DATA_RECV_ITEM`·`TB_MDM_RULE_RECV`.
  - DDL 은 원천 설계대로 만든다(Flyway 두 방언). 엔티티·리포지토리·서비스·BPMN·화면·배치를 만들지 않는다. "코드 없음" 은 이 뜻이며, 보류 테이블을 DDL 에서 빼지 않는다.
  - 활성 테이블의 배포 칸 `CHG_SEQ BIGINT NOT NULL`·`LAST_CHG_SEQ` 에 `DEFAULT 0` 을 준다(0 = 아직 배포 순번을 받은 적 없음). 엔티티는 이 칼럼을 매핑하지 않는다(INSERT 가 기본값을 쓰게). 배포를 구현할 때 0 인 행에 순번을 매기는 일은 그 Task 몫이다. `DEFAULT` 추가는 NOT NULL 을 유지하므로 원천 DDL 과 호환된다.
  - `TB_MDM_DICT_SEQ` 초기 행 시드 여부는 TSK-02-03 이 원천 02 「배포 순번」 대로 정한다.
  - `source_kind` CHECK 는 원천대로 `MDM`/`EXTERNAL` 둘 다 두되, 등록 API·화면은 `MDM` 만 받는다(PRD AC-6).
  - 결재 칸과 `REQUESTED`/`APPROVED`/`CANCELLED` 상태 값도 DDL(CHECK 포함)에 남긴다.

## Consequences (결과)

- **소급 적용 허용**: 3항 대체 규칙은 "직전 RELEASED 보다 뒤" 만 요구하므로 과거 일시도 통과한다(최초 버전은 어떤 일시든 통과). PRD 규칙 7 을 글자대로 따른 결과이며, 이 ADR 은 하한(리드타임·현재 시각)을 새로 만들지 않는다.
- **철회 부재**: 철회가 없고 미적용 버전은 하나뿐이므로, 미래 apply_from 으로 잘못 확정한 버전은 그 시각이 올 때까지 고칠 수단이 없다(새 버전도 만들 수 없다). 확정 화면(TSK-06-05·TSK-08-05)은 apply_from 이 미래이면 이 사실을 확인받는 경고를 띄운다.
- **결재 도입 시**: 결재·배포를 구현하면 이 ADR 을 SUPERSEDED 로 전이하고 새 ADR 로 결재 흐름을 붙인다. 과거 행은 `approved_by IS NULL` 로 결재 없는 확정과 구별되므로 다시 해석하지 않아도 된다. 명명(ADR-0001)과 모듈 경계(ADR-0003)는 그대로 남는다.
- 보류 테이블과 배포 칸이 DDL 에 있으므로, 배포를 붙일 때 마이그레이션으로 표를 새로 만들지 않는다. 대신 그때까지 이 표들은 비어 있고, 활성 테이블의 배포 칸은 0 으로 남는다.
- 인계: TSK-01-03 은 확정 트랜잭션(D4)과 CREATED→INUSE 전이(D6)를 공통 구현한다. TSK-06-05·TSK-08-05 는 미래 apply_from 확정 경고, 결재 칸 처리(D5), 04 의 5항 생략을 구현한다. TSK-02-03 은 보류 테이블 DDL, 배포 칸 `DEFAULT 0`, `TB_MDM_DICT_SEQ` 초기 행을 정한다.

## Alternatives Considered (대안)

- **결재 칸 — `approved_by/at` 을 확정자·확정 일시로 채움**: 결재가 없었는데 결재자를 기록하는 셈이고, 원천 04 가 미결로 둔 "상신자·결재자 겸직" 을 암묵적으로 허용하게 된다(design D3 b).
- **결재 칸 — 모두 비우고 감사 칼럼으로만 확정자를 앎**: 다음 버전 확정 때 직전 행의 `apply_to` 를 닫는 UPDATE 가 감사 칼럼을 덮어 확정자를 잃는다(design D3 c).
- **확정자 전용 칼럼 추가**: 원천 DDL 을 바꾼다(design D3 d).
- **미적용 버전에서 06 만 미래 RELEASED 를 뺌**: 04·06 을 같은 버전 상태 서비스로 묶는 PRD FR-F1 과 어긋난다(design D4 b).
- **미래 RELEASED 를 DRAFT 로 되돌리는 전이 추가(철회 대용)**: PRD 규칙 7 이 만들지 않기로 한 철회 계열 전이를 새로 만든다(design D4 c).
- **CREATED→INUSE 를 주기 배치로 전이**: 이 모듈에 스케줄러 선례가 없고 배치가 실패하면 상태가 멈춘다(design D5 b).
- **CREATED→INUSE 를 저장하지 않고 조회 때 계산만 함**: 원천이 둔 상태 칼럼이 죽은 값이 된다(design D5 c).

## Trigger (PROPOSED 인 경우만)

D'Flow 에서 mdm/TSK-02-01 이 승인(approved)되고, `docs/mdm/tasks/TSK-02-01/design.md` 「담당자 확인 필요 결정」 중 이 ADR 이 근거로 삼은 항목(D3·D4·D5)이 반려되지 않으면 ACCEPTED 로 전환한다. 반려된 항목이 있으면 그 결정을 고친 뒤 다시 판정한다.

## References

- `docs/mdm/PRD.md` §2 규칙 7, §5, FR-E4, FR-F1, AC-6
- [TRD](../TRD.md) §4.1, §6, §9 T4
- `docs/mdm/decisions.md` D-010, D-011, D-017, D-019
- `docs/mdm/tasks/TSK-02-01/design.md` §6.7·§6.8·§6.10, 담당자 확인 필요 결정 D3·D4·D5
- 원천 설계 `/Users/jji/project/mdm/docs/design/basic/04-master-code-deploy-full.md` 「버전 상태와 적용시점」「상신 시 검사」, `06-business-rule.md` 「테이블 설계」「DRAFT와 시험 사본」
- [ADR-0001](0001-physical-naming-audit-dialect.md) — 감사 칼럼과 `row_version`/`VER` 분리
- [ADR-0003](0003-module-boundary-screens-roles.md) — 담당자 역할과 `confirm` 권한
