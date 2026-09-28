# ADR-0002: 결재·배포·수신 보류 하의 버전 확정 규칙과 보류 테이블 원칙

- **Status**: PROPOSED
- **Date**: 2026-09-24
- **Decision Date**: —
- **Context Tags**: MDM, VERSION, CONFIRM, APPROVAL-DEFERRED, DDL

## 쉬운 설명 (현업용 요약)

지금은 결재 절차 없이 담당자가 직접 '확정'을 누르면 새 버전이 정해진 적용 시각부터 효력을 갖는다.
확정할 때에는 원래 결재를 올릴 때 하던 검사를 그대로 하되, 결재·배포와 관련된 검사는 빼고
"새 버전의 적용 시각이 직전 버전보다 뒤인가" 로 바꾸어 본다.

아직 효력이 생기지 않은 버전은 한 번에 하나만 둘 수 있다. 적용 시각을 미래로 잘못 정해 확정했다면,
그 시각이 오기 전에 확정 취소를 눌러 다시 작성 중인 상태로 되돌릴 수 있다. 되돌리면 적용 예정이 풀리고
직전 버전이 다시 끝까지 유효해진다. 이미 적용 시각이 지난 버전은 되돌릴 수 없다.
미래 시각으로 확정할 때에는 확정 화면이 한 번 더 확인을 받는다.

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
  | RELEASED(미적용) → DRAFT | 있음(**확정 취소**) | D8. `apply_from` 이 아직 오지 않은 확정 버전만 |
  | DRAFT → (삭제) | 있음 | 소유자만. 06 은 VAR·ROW CASCADE(06:1154) |
  | 상위 CREATED → INUSE | 있음(자동) | D6 |
  | DRAFT→REQUESTED, REQUESTED→DRAFT(반려), REQUESTED→APPROVED, APPROVED→DRAFT(승인 취소), APPROVED→RELEASED(배포), RELEASED→CANCELLED(철회) | **없음** | PRD 규칙 7. 상태 값 REQUESTED·APPROVED·CANCELLED 는 데이터에 생기지 않는다. D8 의 확정 취소는 철회 계열이 아니라 되돌림이라 `CANCELLED` 를 쓰지 않는다 |
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
- **D8 확정 취소(DRAFT 되돌림)**: 아직 적용 시각이 오지 않은 확정 버전을 다시 작성 중인 상태로 되돌린다. **적용 시각이 이미 지난 버전에는 이 전이가 없다.** 04·06 이 같은 공용 버전 상태 서비스를 쓰므로 그 경로 하나에 연다.
  1. 대상 판정: `status='RELEASED'` 이고 `apply_from > 현재 시각`(D2 의 미적용)일 때만 한다. 경계는 `apply_from = 현재 시각` 이면 이미 적용된 것으로 본다(적용 구간 `[apply_from, apply_to)` 와 맞춘다). 그 외는 거부한다 — `RELEASED` 가 아니면 `MDM002`(문구는 "확정(RELEASED)된 미래 적용 버전만 확정 취소할 수 있습니다" 로 넘긴다), 이미 적용된 `RELEASED` 면 신규 `MDM025`.
  2. 행위자는 D3 과 같다 — 소유자이면서 `confirm` 권한(담당자)을 가진 사람.
  3. 한 트랜잭션이며 D4 와 같은 원칙이다 — 하나라도 실패하면 전부 롤백되어 `RELEASED` 가 그대로 남는다. 요청 `row_version` 이 다르면 `MDM001` 로 409.
  4. 대상 버전: `status='DRAFT'`, `apply_from=NULL`, `apply_to=NULL`, `row_version` + 1, 감사 칼럼 기록.
  5. **확정 칸은 지우지 않는다** — `requested_by`·`requested_at`·`released_at` 을 남긴다. D5 가 이 칸을 "확정자를 되찾는 유일한 수단"으로 정한 목적과, 9항의 삭제 판정·12항의 화면 문구가 읽는 감사 흔적 때문이다. 다시 확정하면 `casConfirm` 이 새 값으로 덮어쓴다.
  6. 직전 `RELEASED` 버전: `apply_to` 를 `9999-12-31 00:00:00` 으로 되돌려 다시 열어 준다. D4-5 `closeApplyTo` 의 역연산이다. 복구 대상은 "자신보다 `ver` 가 작은 `RELEASED` 가운데 최대"(확정이 쓰는 대상과 같다)이며, D2 와 채번 규칙이 **되돌리는 버전이 그 객체의 최대 `ver` 임**을 보장한다. 대상이 없으면(최초 버전) 복구하지 않는다. 이 UPDATE 도 1행이어야 하고 아니면 롤백한다.
  7. 세 선분 테이블(코드 행·카테고리·카테고리 소속)은 건드리지 않는다. `from_ver = V` 인 행은 작성 중일 때의 값 그대로이고 확정도 건드리지 않았으므로, 되돌린 자리에서 그대로 편집을 이어 간다.
  8. 상위 객체 상태(CREATED/INUSE)는 되돌리지 않는다 — 되돌린 행은 되돌리기 전에도 "적용된 `RELEASED`" 에 기여한 적이 없으므로(1항의 경계), 남은 `INUSE` 가 사실과 어긋나지는 않는다. 다만 **상세·확정 화면은 계산값(D6) 을 돌려주고 선택 목록 `search` 는 저장값** 인 차이가 남는다. 저장값 쪽이 늦게 `CREATED` 로 보일 수는 있으나 잘못된 `INUSE` 를 내지는 않는다.
  9. **04 마루 코드 삭제 판정을 함께 바꾼다** — 삭제는 "확정된 적 없음"을 요구하는데, 그 판정을 `STATUS` 만 보면 되돌린 행이 `DRAFT` 이므로 통과해 버려 확정 이력이 있는 마루 코드가 통째로 지워진다(5항이 남긴 흔적까지 함께 사라진다). 따라서 `released_at IS NOT NULL` 도 함께 보도록 판정한다. 서버 판정과 화면 플래그를 같은 식으로 맞춘다.
  10. **06 교차 객체 효과는 고치지 않고 문서화한다** — 되돌린 룰은 `RELEASED` 를 잃는다. 다만 판정자가 "가장 큰 `RELEASED`" 이므로 **이전 확정 버전이 있으면 그 버전이 대신한다** — 막히는 것은 **되돌린 버전이 그 룰의 유일한 확정 버전일 때** 뿐이다. 그때 ① 그 룰을 멤버로 가진 룰 세트 저장·되살리기와 ② 그 룰의 결과를 쓰는 다른 룰의 확정이 막힌다. 시간 경과로 풀리지 않고 **다시 확정하면** 풀린다. 그래서 12항의 문구로 사용자에게 알린다.
  11. 되돌린 버전은 D2 에 따라 여전히 "미적용 버전" 1개로 집계된다. 새 버전 생성·폐기·복원은 계속 막히고 그 자리에서 편집만 열린다. 이것이 이 결정의 목적이므로 미적용 집계를 바꾸지 않는다.
  12. 화면 문구 — 확정 화면의 미래 시각 경고 상수와 그 아래 힌트 문단 **둘 다**(04·06 합계 4곳) "확정 후 확정 취소로 되돌릴 수 있습니다" 로 고친다. "철회 없음"·"철회할 수 없습니다" 표현은 남기지 않는다. 새 버전 채번 안내의 "철회" 표현도 함께 지운다. 06 은 10항 때문에 "되돌리면 이 룰을 쓰는 룰 세트와 다른 룰의 확정이 잠시 막힙니다" 를 덧붙인다. 확정 취소 버튼의 확인창도 같은 문구를 쓴다.
  13. 액션 — 새 액션을 만들지 않는다. **기존 `delete` 액션에 `target` 을 더해** 04 `codeEdit`·06 `ruleEdit` 의 `delete` 경로에서 분기한다(선례: 04 `target:"CODE"`, 06 `target:"VERSION"|"RULE"`). 액션 어휘 16종과 `PERMISSION_ACTION` 시드, BPMN 액션 대조 시험을 건드리지 않는다. 2항의 "`confirm` 권한"은 권한 세트 쪽 판정이며 화면 액션 키와 다르다.
  14. `VersionTransition` 에 되돌림 전이 `REVERT_CONFIRM(RELEASED, DRAFT, true)` 를 추가하고, 전이 목록과 `inScope` 집합을 정확히 고정하는 계약 시험과 그 클래스 주석을 함께 고친다.
  15. 되돌림 UPDATE 는 `STATUS='RELEASED' AND ROW_VERSION = :expected` 조건의 **별도** 조건부 UPDATE 다 — 확정이 쓰는 `STATUS='DRAFT'` 술어 조건을 재사용하지 않는다. 0행이면 `MDM001`, 1행이 아니면 롤백이다. 오류 코드 `MDM025`("이미 적용된 버전은 확정 취소할 수 없습니다")를 신설하고, `RELEASED` 가 아닌 경우의 `MDM002` 는 1항의 문구로 재사용한다.

## Consequences (결과)

- **소급 적용 허용**: 3항 대체 규칙은 "직전 RELEASED 보다 뒤" 만 요구하므로 과거 일시도 통과한다(최초 버전은 어떤 일시든 통과). PRD 규칙 7 을 글자대로 따른 결과이며, 이 ADR 은 하한(리드타임·현재 시각)을 새로 만들지 않는다.
- **확정 취소 존재 — 미래 적용 한정**: D8 로 되돌릴 수 있으므로, 미래 `apply_from` 으로 잘못 확정한 버전은 그 시각이 오기 전에 고칠 수 있다. 그러나 **이미 적용된 버전을 되돌릴 수단은 여전히 없다** — 배포·수신이 보류 상태(D7)라 되돌림의 정합을 이룰 감시점이 없다. 철회(`CANCELLED`)·결재 계열 전이는 그대로 없다. 취소 시 확정 칸은 남기므로 확정자를 되찾을 수 있고, 취소한 사람과 시각은 감사 칼럼에 남는다.
- **되돌린 뒤 판정자 사이의 차이**(D8-10): 되돌린 06 룰이 그 룰의 유일한 확정 버전이었다면, 그 룰을 멤버로 가진 룰 세트 저장과 그 룰의 결과를 쓰는 다른 룰의 확정이 막힌다. 시간이 지나서 풀리지 않고 다시 확정해야 풀린다 — 화면 문구로 알린다.
- **04 마루 코드 삭제 판정 변경**(D8-9): "확정된 적 없음" 판정이 `released_at` 까지 보게 되므로, 확정 취소 이력이 있는 마루 코드는 지워지지 않고 폐기만 가능하다.
- **상위 상태와 조회의 차이**(D8-8): 상위 객체의 `INUSE` 는 되돌리지 않는다. 상세·확정 화면은 계산값이 정확하지만 선택 목록은 저장값이라, 되돌린 뒤 목록에서 늦게 `CREATED` 로 보일 수 있다.
- **결재 도입 시**: 결재·배포를 구현하면 이 ADR 을 SUPERSEDED 로 전이하고 새 ADR 로 결재 흐름을 붙인다. (2026-09-28 정정) 원래 이 ADR 은 과거 행을 `approved_by IS NULL` 로 "결재 없는 확정"과 구별해 재해석하지 않아도 된다고 적었으나, 현 구현은 `approved_by` 를 한 번도 쓰지 않아 이 구별자가 아무 정보도 담지 않는다. 구별 기준을 실제로 채워지는 칸(`released_at` 등)으로 다시 정해야 하며, D8 로 되돌린 과거 행을 결재 없는 확정으로 읽지 않도록 주의한다. 명명(ADR-0001)과 모듈 경계(ADR-0003)는 그대로 남는다.
- 보류 테이블과 배포 칸이 DDL 에 있으므로, 배포를 붙일 때 마이그레이션으로 표를 새로 만들지 않는다. 대신 그때까지 이 표들은 비어 있고, 활성 테이블의 배포 칸은 0 으로 남는다.
- 인계: TSK-01-03 은 확정 트랜잭션(D4)과 CREATED→INUSE 전이(D6)를 공통 구현한다. TSK-06-05·TSK-08-05 는 미래 apply_from 확정 경고, 결재 칸 처리(D5), 04 의 5항 생략을 구현한다. TSK-02-03 은 보류 테이블 DDL, 배포 칸 `DEFAULT 0`, `TB_MDM_DICT_SEQ` 초기 행을 정한다. D8 구현은 위 세 Task 뒤에 별도로 붙으며 공통 경로를 건드린다 — `VersionStateService`·`VersionTransition`·`VersionPreconditions`·`VersionRowStore`(되돌림 UPDATE·`apply_to` 복구)·`MdmErrorCode`(`MDM025`)를 먼저 고치고, 이어 04 `codeEdit`·06 `ruleEdit` 의 `delete` 경로와 화면을 잇는다. 04 의 `MdmErrorCode` 개수 고정 시험(24→25), `VersionContractTest` 의 전이 목록·`inScope` 집합, 두 `ConfirmModal` 의 문구 단언을 함께 고친다.

## Alternatives Considered (대안)

- **결재 칸 — `approved_by/at` 을 확정자·확정 일시로 채움**: 결재가 없었는데 결재자를 기록하는 셈이고, 원천 04 가 미결로 둔 "상신자·결재자 겸직" 을 암묵적으로 허용하게 된다(design D3 b).
- **결재 칸 — 모두 비우고 감사 칼럼으로만 확정자를 앎**: 다음 버전 확정 때 직전 행의 `apply_to` 를 닫는 UPDATE 가 감사 칼럼을 덮어 확정자를 잃는다(design D3 c).
- **확정자 전용 칼럼 추가**: 원천 DDL 을 바꾼다(design D3 d).
- **미적용 버전에서 06 만 미래 RELEASED 를 뺌**: 04·06 을 같은 버전 상태 서비스로 묶는 PRD FR-F1 과 어긋난다(design D4 b).
- **미래 RELEASED 를 DRAFT 로 되돌리는 전이 추가(철회 대용)**: 2026-09-28 개정에서 **채택**했다(design D4 c). 당시의 기각 사유 "PRD 규칙 7 이 만들지 않기로 한 철회 계열 전이를 새로 만든다"는 D8 이 `CANCELLED` 를 쓰지 않는 **되돌림**임을 명시해 해소했다 — 상태 값 REQUESTED·APPROVED·CANCELLED 는 여전히 데이터에 생기지 않는다. 요구는 현업의 "확정 취소를 하면 확정 전 상태로 돌아가야 한다"였다.
- **`RELEASED→CANCELLED`(철회 상태 값)로 되돌리기**: 되돌린 자리에 다시 확정할 수 없고, 06 코드 편집 화면이 "`CANCELLED` 는 읽기 전용 diff"로 정한 규칙과 충돌한다. 되돌림 목적이면 `DRAFT` 로 되돌리는 편이 단순하다.
- **이미 적용된 버전까지 되돌리기**: 조회가 과거로 되감기고, 보류 상태인 배포·수신(`TB_MDM_CODE_RECV` 등)과 정합을 이룰 수단이 없다. 되돌림의 대상을 미래 적용 한정으로 묶었다.
- **확정 시점에 `apply_from ≤ 현재 시각` 을 강제해 미래 확정을 금지**: 위험 자체는 사라지지만 예약 확정 수요를 막고, 원천 04:284·378 이 미적용 `RELEASED` 를 규칙으로 둔 근거를 없앤다.
- **상태 전이 없이 적용 시각만 앞당기기**: "확정 전 상태로 돌아간다"는 요구를 충족하지 못한다. 값만 바뀌면 작성 중 상태가 아니어서 편집이 열리지 않는다.
- **CREATED→INUSE 를 주기 배치로 전이**: 이 모듈에 스케줄러 선례가 없고 배치가 실패하면 상태가 멈춘다(design D5 b).
- **CREATED→INUSE 를 저장하지 않고 조회 때 계산만 함**: 원천이 둔 상태 칼럼이 죽은 값이 된다(design D5 c).

## Trigger (PROPOSED 인 경우만)

D'Flow 에서 mdm/TSK-02-01 이 승인(approved)되고, `docs/mdm/tasks/TSK-02-01/design.md` 「담당자 확인 필요 결정」 중 이 ADR 이 근거로 삼은 항목(D3·D4·D5)이 반려되지 않으면 ACCEPTED 로 전환한다. 반려된 항목이 있으면 그 결정을 고친 뒤 다시 판정한다.

2026-09-28 개정으로 추가된 **D8 확정 취소** 도 이 판정 대상에 넣는다. D8 은 2026-09-28 사용자 요구("확정은 했지만 날짜가 안 지난 것은 되돌릴 수 있어야 한다")에서 나왔고, TSK-02-01 이 만든 결정 목록에 없으므로 그 설계서에 항목을 더해 승인받아야 한다.

## References

- `docs/mdm/PRD.md` §2 규칙 7, §5, FR-E4, FR-F1, AC-6
- [TRD](../TRD.md) §4.1, §6, §9 T4
- `docs/mdm/decisions.md` D-010, D-011, D-017, D-019
- `docs/mdm/tasks/TSK-02-01/design.md` §6.7·§6.8·§6.10, 담당자 확인 필요 결정 D3·D4·D5
- 원천 설계 `/Users/jji/project/mdm/docs/design/basic/04-master-code-deploy-full.md` 「버전 상태와 적용시점」「상신 시 검사」, `06-business-rule.md` 「테이블 설계」「DRAFT와 시험 사본」
- [ADR-0001](0001-physical-naming-audit-dialect.md) — 감사 칼럼과 `row_version`/`VER` 분리
- [ADR-0003](0003-module-boundary-screens-roles.md) — 담당자 역할과 `confirm` 권한

## 개정 이력

- **2026-09-28 — D8 확정 취소 추가.** 현업 요구("확정 취소를 하면 확정 전 상태로 돌아가야 한다")를 반영했다. 범위 결정 2건 — ① 되돌릴 수 있는 버전은 **미래 적용(`apply_from > 현재 시각`) 한정**, 이미 적용된 버전은 배포·수신이 보류 상태(D7)라 정합을 이룰 감시점이 없다. ② **04·06 공통** — 두 영역이 이미 같은 공용 버전 상태 서비스를 쓰므로 그 경로에 연다. 함께 고친 것: D1 전이 표(행 추가), 쉬운 설명, Consequences 의 "철회 부재" 항목, Alternatives 의 해당 기각 항목(채택으로 이동)과 새 대안 4건. Status 는 PROPOSED 유지.
- **2026-09-28 (같은 날) — D8 을 적대 검토로 보강.** 멀티에이전트 검토가 상 2·중 4·하 4 건을 냈고 전부 D8 에 반영했다. 상 — ① "확정된 적 없음" 판정이 `STATUS` 만 봐서 되돌린 마루 코드가 통째로 삭제되던 것을 D8-9 로 막고, ② 06 교차 객체 차단(되돌린 룰이 멤버 룰 세트와 다른 룰의 확정을 막음)이 문서에 없던 것을 D8-10 으로 적고 화면 문구로 알리기로 정했다. 중 — 조회 계산값 전제 범위(D8-8), 화면 문구 4곳(D8-12), `VersionTransition`·계약 시험 갱신(D8-14), 액션을 기존 `delete` + `target` 으로 재사용(D8-13). 하 — 최대 `ver` 불변식 전제(D8-6), 조건부 UPDATE 술어 분리(D8-15), `MDM002` 문구, 인계 목록. 검토가 "결함 없음"으로 확인한 축도 3건이다 — 되돌린 뒤 재확정 경로, 최초 버전 되돌리기에서 구간 구멍 없음, 직전 `apply_to` 복구의 충분성. 같은 검토가 지적한 `approved_by IS NULL` 구별자가 현 구현에서 아무 정보도 담지 않는 건(Consequences "결재 도입 시") 기존 문장의 정합성 결함이라 같은 날 정정했다.
