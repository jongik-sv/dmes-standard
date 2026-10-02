# ADR-0006: 룰 세트·레이아웃·헤더에 버전 관리를 두고 네 대상의 번호를 major/minor 로 통일한다

- **Status**: ACCEPTED
- **Date**: 2026-10-02
- **Decision Date**: 2026-10-02
- **Context Tags**: MDM, VERSIONING, RULE, RULE_SET, LAYOUT, HEADER

## 쉬운 설명 (현업용 요약)

지금까지 버전을 두고 확정하는 대상은 마스터코드와 룰뿐이었다. 룰 세트(룰을 어떤 순서·갈래로 돌릴지 그린 흐름도)와
전문 레이아웃·헤더는 저장하면 바로 운영에 반영됐다. 그래서 고치는 도중의 흐름이나 레이아웃이 운영에 나가고,
"그때 어떤 정의로 판정·전문을 만들었는지"를 되짚을 수 없었다.

사용자가 2026-10-02 에 다음을 결정했다.

- 룰 세트·레이아웃·헤더도 룰처럼 **고치는 버전(초안)과 운영 버전을 나눈다.** 초안은 저장해도 운영에 나가지 않고,
  담당자가 확정하고 적용 시작 시각을 정해야 반영된다. 그러면 편집 중 운영 보호, 적용 시점 예약, 과거 판정 재현,
  이전 버전으로 되돌리기를 모두 할 수 있다.
- 세트가 룰을, 전문이 헤더를 쓸 때 **특정 버전을 지정하지 않는다.** 판정하는 시각에 유효한 운영 버전을 자동으로 쓴다.
  룰만 새로 확정해도 그 적용 시작 시각부터 세트 안에서 새 룰이 쓰인다.
- 네 대상(마스터코드·룰·룰 세트·레이아웃)의 **번호와 버튼을 같게 맞춘다.** 번호는 `1.000` 처럼 소수 셋째 자리까지
  쓰고, 큰 변경은 "새 버전(major)"(1.000 → 2.000), 작은 변경은 "새 버전(minor)"(1.000 → 1.001)으로 만든다.
  두 버튼의 차이는 번호와 종류 표시뿐이고 확정 절차는 같다.

한꺼번에 하지 않고 세 단계로 나눈다. 1단계(룰의 major/minor)는 구현을 마쳤고, 2단계(룰 세트)와 3단계(레이아웃·헤더)는
단계마다 계획·구현·병합을 따로 한다.

## Context (배경)

- 2026-09-07 결정은 "버전·승인·배포 단위는 룰이고, 룰 세트는 버전 없는 실행 순서 목록"이었다
  (06-business-rule.md:905·:927, PRD AC-4, [ADR-0005](0005-rule-set-runs-in-engine.md):72). 2026-09-09 결정은 레이아웃에
  "상태·승인·소유자를 두지 않고 저장하면 바로 배포한다"였다(03-interface-layout.md:72, 06:988). 룰 세트는 흐름도가
  되면서(ADR-0005) 정의가 커졌고, 편집 도중 운영 반영과 이력 없음이 문제로 드러났다.
- 룰 버전은 정수였고(06:971, V8, `VersionTarget.BUSINESS_RULE` scale 0) 마스터코드는 `NUMERIC(7,3)` 소수 버전(V9)을
  이미 쓴다. 버전 확정·확정취소·선점·해제·넘기기 엔진은 [ADR-0002](0002-version-confirm-without-approval.md) 로 이미
  공통화돼 있어 대상만 더하면 재사용할 수 있다.
- 설계 정본: [`2026-10-02-mdm-object-versioning-design.md`](../../superpowers/specs/2026-10-02-mdm-object-versioning-design.md).

## Decision (결정)

사용자 확정(2026-10-02). 번호는 스펙 §3 과 같다.

| # | 결정 | 내용 |
|---|---|---|
| K1 | 참조는 판정 시각으로 해석 | 세트→룰, 전문→헤더, EAI→헤더, 세트→하위 세트 모두 ID 만 참조한다. 실행·직렬화 시각 T 에 유효한 RELEASED 버전을 고른다. 참조하는 쪽 버전에 상대 버전을 박지 않는다 |
| K2 | 세트와 룰은 독립 | 세트 새 버전은 흐름만 바꾸고 룰 버전을 건드리지 않는다. 룰만 새 버전을 확정하면 그 `apply_from` 부터 세트 안에서도 새 룰 버전이 쓰인다 |
| K3 | 번호 체계 통일 | 네 대상 모두 `VER NUMERIC(7,3)` + `VER_KIND`(MAJOR·MINOR). major 는 `floor(최대)+1`, minor 는 `최대+0.001`(minor 상한 999). 차이는 번호와 종류 표시뿐이고 처리 경로는 같다. `VER_KIND` 는 만든 뒤 바꾸지 않는다 |
| K4 | 헤더도 버전 대상 | 헤더 레이아웃은 전문 레이아웃과 같은 버전 흐름을 갖는다 |
| K5 | 소유자 | 룰 세트·레이아웃·헤더의 DRAFT 도 소유자(선점·해제·넘기기)를 둔다 |
| K6 | 저장 구조 | 룰 세트는 버전 행에 정의 JSON 을 둔다. 레이아웃은 자식 테이블 키에 `VER` 를 넣는다 |
| K7 | 단계 분할 | 1단계 공통 엔진+룰, 2단계 룰 세트, 3단계 레이아웃·헤더. 단계마다 계획·구현·병합을 따로 한다 |

### 번복 대상

| 기존 결정 | 위치 | 바뀌는 내용 |
|---|---|---|
| 룰 세트는 버전 없는 실행 순서 목록(2026-09-07) | 06:905, 06:927, PRD AC-4, ADR-0005:72 | 룰 세트도 버전 단위. 저장은 DRAFT 에만 쓰고 확정해야 운영에 반영된다 |
| 레이아웃은 상태·승인·소유자 없이 저장하면 바로 배포(2026-09-09) | 03:72, 06:988 | 레이아웃·헤더도 DRAFT·소유자·확정·확정취소를 갖는다 |
| 레이아웃 "바뀌었을 때만 +1"(I15), 헤더 저장 시 사용 전문 연쇄 재계산(I18) | tasks/TSK-05-03/design.md | 둘 다 폐지. 버전은 사람이 새 버전 버튼으로 만들고, 헤더 변경은 판정 시각 해석으로 전문에 반영된다 |
| 룰 버전은 정수 | 06:971, V8, `VersionTarget.BUSINESS_RULE` scale 0 | `NUMERIC(7,3)` + `VER_KIND` |
| 하위 세트는 호출 시점의 저장된 현재 행(D-135 C-D2) | subset-call 스펙 :257, §14 | 하위 세트도 판정 시각의 RELEASED 버전 |

ADR-0005 의 해당 문장(:72)은 ACCEPTED 본문이라 고치지 않고, 이 ADR 이 그 부분을 번복한다.

## Consequences (결과)

- **1단계(룰 major/minor)는 구현을 마쳤다.** 구현에서 계획과 달라진 점은 다음 셋이다.
  1. V17 마이그레이션은 SQLite `RENAME` 으로 테이블을 바꿔치지 않고 `_BAK` 테이블을 거쳐 다시 만든다. RENAME 이 자식
     테이블 FK 의 부모 표 이름까지 고치는지가 `legacy_alter_table` 설정에 달려 있기 때문이다. sqlite-jdbc 기본값에서는
     고쳐지지만 macOS `sqlite3` CLI 기본값에서는 자식 FK 가 `TB_MDM_RULE_VER_NEW` 를 가리킨 채 남아, 이후 INSERT·DELETE
     가 "no such table" 로 깨진다. 설정과 무관하게 안전한 `_BAK` 경유 재생성 순서를 썼다. 자식→부모 순으로 DROP 해
     CASCADE 삭제를 피한 것은 이와 별개의 위험 대응이다. 기존 정수 n 은 `n.000`·MAJOR 로 옮기고, 데이터 보존과
     `PRAGMA foreign_key_check` 를 시험한다.
  2. 룰 버전 계약은 문자열 `"1.000"`(`BigDecimal.toPlainString()` 의 scale 3 결과, 표시는 `v1.000`)이다. 엔진
     (`maru-mdm-engine`) 정의·결과·트레이스의 JSON 은 number 이고 `BigDecimal` 이다. 비교는 `compareTo`, 해시는
     `stripTrailingZeros`, 저장·바인딩은 `setScale(3)` 로 한다.
  3. 새 버전 가능 여부(major·minor 각각, minor 999 도달 포함)는 ruleMng view 의 `flags` 안에 내려 화면이 다시
     계산하지 않는다.
- 감사 카운터(`VER`·`AUD_VER`·`auditVer`)는 업무 버전이 아니므로 바꾸지 않는다.
- 룰 화면은 "새 버전(major)"·"새 버전(minor)" 두 버튼을 쓴다. 마스터코드의 권한 action `reg`→`copy` 정리는 역할 권한
  데이터 이행이 따라 별도 작업으로 뺐다.
- **2단계**: 룰 세트 버전 테이블(V18), 흐름도 편집기를 내 DRAFT 에만 저장, 룰 세트 확정 화면·검사, 엔진
  `ruleSet(setId, evalTs)`. 지금까지 세트는 덮어쓰기라 이전 흐름이 없어 과거 판정 재현은 이행 시점 이후부터 보장된다.
- **3단계(레이아웃·헤더) 구현 완료(e2e 첫 실행 전 — 서버·프런트 단위 시험은 통과, 브라우저 e2e 는 격리 서버에서 아직 미실행)**(D-148). 레이아웃·헤더 버전 테이블은 V21(당초 V19 — 메타 캐시 V20 이 dev 에 먼저 들어가 Flyway
  outOfOrder=false 라 번호를 옮겼다). 저장은 내 DRAFT 에만 쓰고, 헤더 연쇄 재계산(I18)은 없앴고, 직렬화·총 길이를 시각 T 기준으로
  합성하고, 전문·헤더 공용 확정 화면(`dmb/layoutConfirm`)을 둔다. 이전 전문 버전은 스냅샷으로만 남고 항목 행 복원은 하지 않는다.
  구현에서 스펙과 달라지거나 스펙이 열어 둔 점은 다음과 같다.
  1. 직렬화기·파서는 순수 함수로 두고 시각 T 는 `MdmLayoutSnapshotResolver` 가 받는다(스펙 §7 "계약에 T" 의 구현 방식).
  2. 버전 행 길이 `OWN_LENGTH` 는 그 버전 자신의 항목 길이 합이고, 전문 총 길이는 T 의 헤더 버전으로 합성한 값이다. 본문 항목
     `OFFSET` 저장값은 본문 시작 기준 상대값이다(헤더 버전에 따라 절대 위치가 달라지므로).
  3. 상수 재정의 키는 헤더 항목 물리명이라 헤더 버전이 바뀌어도 짝이 유지되고, 대상이 사라지면 헤더 확정 경고(`ORPHAN_OVERRIDE`)다.
  4. 이행 전 이력은 `LEGACY_SNAPSHOT_YN='Y'` 버전의 합성 스냅샷 그대로(읽기 전용)다.
  5. "전문 총 길이 규칙"은 MSG_LENGTH 칸 자리수 용량(L16)과 상수 재정의 값 길이(L12)로 해석한다.
  6. DMB 담당자 권한은 CONFIRM 이다. 새 버전·등록은 담당자 역할이 필요 없고 확정·선점은 담당자다. 확정은 소유자만 한다.
  7. **EAI 는 버전 대상이 아니다.** 쓰는 전문이 있으면 인코딩·패딩 변경을 거부한다. 헤더의 EAI 연결은 헤더 버전 행 `EAI_CODE` 에 두고,
     EAI 표준 헤더는 시각 T 에 RELEASED 인 헤더 버전 중 그 EAI 를 주장하는 가장 늦게 적용 시작한 버전(같은 시각이면 헤더 ID 가 큰 쪽)으로 해석한다. 확정은
     `TB_MDM_EAI.HEADER_LAYOUT_ID` 를 옮기지 않는다(그 칼럼은 운영이 더 읽지 않는다). 표준 헤더가 바뀌는 헤더 확정은
     `EAI_STANDARD_HEADER_SWITCH` 경고(넘겨받기·되찾기·내려놓기)로 드러낸다. 전문 저장의 표준 헤더 끼움(I14)은 그 헤더에 저장
     시각 RELEASED 가 있을 때만 하고 확정 검사는 저장된 구성 그대로 본다(판정 P3-15·P3-17).
  8. 레이아웃 4표의 감사 카운터는 `AUD_VER` 로 바꿨고, 레이아웃 계열 DTO 의 `ver` 는 업무 버전 문자열이다.
  9. **부모 칸은 버전이 없다.** 레이아웃 이름·송신·수신 시스템(헤더는 이름)은 부모 행이라 DRAFT 저장 때 바로 반영되고 확정 기록에는
     남지 않는다(2단계 세트명과 같다). 전문 바이트에는 영향이 없다(판정 P3-8).
  10. **메타 기록·피드**: 부모 칸 변경은 메타 변경 기록에 남는다(RELEASED 가 있을 때만, 헤더 이름은 쌓은 전문까지). 메타 피드 LAYOUT 은
      RELEASED 버전 목록과 쌓은 헤더의 버전 경계로 나눈 합성 구간을 주고, 업무 모듈이 판정 시각으로 고른다
      ([ADR-0007](0007-mdm-meta-hybrid-cache-revision.md), 판정 P3-14·P3-16).
  11. **헤더 확정 취소 가드**: 그 헤더를 쌓은 RELEASED(현재·미래) 전문 버전의 적용 구간 합성을 깨는 취소는 `MDM028` 로 거부하고 사용 전문
      목록을 오류에 담는다. 사용자는 걸린 전문의 미래 버전을 먼저 확정 취소한다. 메타 피드의 키 단위 failed(R4)를 정상 경로에서 막기 위함이다
      (판정 P3-22, [ADR-0002](0002-version-confirm-without-approval.md) D8-16).
  12. **헤더 확정 검사**: EAI 표준 헤더 전환 경고는 apply_from 이후 그 EAI 를 주장하는 헤더 RELEASED 경계마다 비교하고(판정 P3-24), 이미 있던
      L12·L16 은 오류가 아니라 WARNING 으로 낮춘다(판정 P3-25).
  13. **운영 이행 전 점검(V21, 최종 검토 M3·M4)**: V21 본문은 그대로 두고, 운영 DB 에 V21 을 적용하기 전(V20 모양) 아래 두 쿼리를 돌려
      결과를 보고 판단한다. 로컬 mdm.db 사본(2026-10-03)에서 점검 1 은 레이아웃 100·201 부모 행 2건(첫 버전이라 APPLY_FROM 은 이행 하한이고
      표시 시각 `RELEASED_AT` 만 9 시간 늦다), 점검 2 는 0행이었다.
      - 점검 1 — 정수 `C_AT` 이 "KST 벽시계를 UTC epoch 로 넣은" 값으로 보이는 행. V21 은 정수 `C_AT` 을 진짜 Instant 로 보고 +9 시간 하므로
        이런 행은 9 시간 늦게 옮겨진다. 밀리초가 000 이고 그 값을 벽시계로 읽은 시각이 문자열 `C_AT` 형제 행과 10분 안이면 의심한다. 걸린 행이
        이력(`TB_MDM_LAYOUT_VER`)의 둘째 이후 버전이면 구간 경계가 9 시간 밀리므로, 이행 전에 그 행의 `C_AT` 을 문자열 KST 로 고쳐 둔다.

        ```sql
        WITH ROWS_AT AS (
          SELECT 'TB_MDM_LAYOUT' AS TBL, LAYOUT_ID, NULL AS LAYOUT_VERSION, C_AT FROM TB_MDM_LAYOUT
          UNION ALL
          SELECT 'TB_MDM_LAYOUT_VER', LAYOUT_ID, LAYOUT_VERSION, C_AT FROM TB_MDM_LAYOUT_VER
        )
        SELECT r.TBL, r.LAYOUT_ID, r.LAYOUT_VERSION, r.C_AT,
               datetime(r.C_AT / 1000, 'unixepoch')             AS READ_AS_WALLCLOCK,
               datetime(r.C_AT / 1000, 'unixepoch', '+9 hours') AS V21_RESULT
        FROM ROWS_AT r
        WHERE typeof(r.C_AT) = 'integer' AND r.C_AT % 1000 = 0
          AND EXISTS (SELECT 1 FROM ROWS_AT s
                       WHERE typeof(s.C_AT) = 'text'
                         AND abs(CAST(strftime('%s', substr(replace(s.C_AT, 'T', ' '), 1, 19)) AS INTEGER) - r.C_AT / 1000) <= 600)
        ORDER BY r.TBL, r.LAYOUT_ID, r.LAYOUT_VERSION;
        ```

      - 점검 2 — 한 헤더를 표준 헤더로 가리키는 EAI 가 여럿인 경우. V21 은 코드 순 첫 EAI 만 헤더 버전 행 `EAI_CODE` 로 옮기므로 나머지 EAI 는
        이행 뒤 표준 헤더가 "없음" 이 되어 그 EAI 전문 저장 때 헤더 자동 끼움이 멈춘다. 행이 나오면 이행 전에 EAI 마다 헤더를 따로 두도록 정리한다.
        표준 헤더가 없는 EAI 는 빼고 센다(`IS NOT NULL` — 원안 쿼리에 더한 조건).

        ```sql
        SELECT HEADER_LAYOUT_ID, COUNT(*) FROM TB_MDM_EAI WHERE HEADER_LAYOUT_ID IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
        ```
- 세트·레이아웃 모두 확정 전에는 운영에 반영되지 않으므로, 확정을 잊으면 수정이 운영에 안 나가는 운영 부담이 생긴다.
  확정 검사(참조 룰의 `apply_from` 시점 RELEASED 존재, 테스트 케이스 통과 등)로 확정 시점에 막는다.
- 판정 시각에 RELEASED 세트·헤더가 없으면 엔진 판정 오류다(기존 "룰 없음"과 같은 등급).

### 후속 (갱신 대상)

원천 설계 문서(`docs/mdm/design` → 다른 저장소 `/Users/jji/project/mdm/docs/design` 심볼릭 링크)는 이 저장소에서 고치지
않는다. 아래를 해당 저장소에서 단계별로 갱신한다.

- 06-business-rule.md:905, :927 (룰 세트는 버전 없는 목록), :971 (룰 버전 정수), :988 (레이아웃 저장 즉시 배포)
- 03-interface-layout.md:72 (레이아웃은 상태·승인·소유자 없음)
- 이 저장소: PRD AC-4, [ADR-0005](0005-rule-set-runs-in-engine.md):72 갱신 메모, `docs/mdm/engine-contract.md:50`(2단계),
  D-135 스펙 C-D2·§14(2단계 병합 뒤)

## Alternatives Considered (대안)

- **세트 노드·전문이 상대 버전을 고정(B·C안)**: 참조하는 쪽이 룰·헤더 버전을 박으면 룰 하나를 새로 확정할 때마다 세트·전문
  새 버전이 연쇄로 필요하다. 판정 시각 해석(K1)이면 이 연쇄가 없다. 채택하지 않고 범위 밖으로 둔다.
- **룰 버전을 정수로 유지**: 큰 변경과 작은 수정을 구분하지 못하고 마스터코드·레이아웃과 번호 체계가 갈린다. 소수
  버전은 마스터코드가 이미 쓰는 방식이라 엔진을 재사용한다. 채택하지 않는다.
- **레이아웃·세트를 JSON 스냅샷 한 칸으로만 저장**: 항목 단위 검색·영향도 조회(`LayoutImpactFinder`)와 항목 행 편집이
  어려워진다. 룰 세트는 정의 JSON(K6)을 쓰지만 레이아웃은 자식 테이블 키에 `VER` 를 넣는다. 스냅샷은 이행 이전 이력의
  읽기 전용 보관에만 쓴다.
- **세 대상을 한 번에 구현**: 변경 범위가 커서 검토·회귀 위험이 크다. 단계 분할(K7)을 택한다.

## References

- 설계 스펙: [`docs/superpowers/specs/2026-10-02-mdm-object-versioning-design.md`](../../superpowers/specs/2026-10-02-mdm-object-versioning-design.md)
- [ADR-0002](0002-version-confirm-without-approval.md), [ADR-0005](0005-rule-set-runs-in-engine.md)
- [`docs/mdm/decisions.md`](../decisions.md) D-144, D-148(3단계 구현 결정)
- [Local-Rules §24](../../guide/FrontEnd/Local-Rules.md) MDM 버전 버튼 규약
