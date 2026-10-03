# MDM 컬럼 시스템 별칭 매칭 설계 (B·C 후속)

> 상위: [2026-10-03-mdm-screen-meta-validation-design.md](2026-10-03-mdm-screen-meta-validation-design.md) §8 후속 1번, [2026-10-02-mdm-meta-cache-design.md](2026-10-02-mdm-meta-cache-design.md)(metaFeed·변경 기록).
> 사용자 지시(2026-10-03): "별칭 매칭부터 진행해". 세부 선택은 위임받아 아래처럼 정했다(decisions.md D-149).

## 1. 문제

화면·서버 검증은 화면 키를 물리명(`MdmNames.toPhysName`)으로 바꿔 `TB_MDM_COLUMN.PHYS_NAME`(표준 물리명)으로만 찾는다. 그런데 시스템마다 실제 물리명이 다르다. `TB_MDM_COLUMN_SYSTEM`(COLUMN_ID, SYSTEM_CODE, PHYS_NAME, TRANSFORM)에 시스템별 이름이 있다. 로컬 mdm.db 기준(2026-10-03):

| 시스템 | 행 | 표준과 다른 이름 |
|---|---|---|
| MES | 9,536 | 5,938 (예: `ABS_CHM_SLP_AMT` ↔ 표준 `ABS_CHM_RPLN_AMT`, `0CALDAY` ↔ `DATE`) |
| APS | 1,429 | 729 |
| MDM·ERP·L2 | 198·4·1 | 162·4·1 |

- 컬럼 하나에 같은 시스템 별칭이 여럿일 수 있다(컬럼 157 ← `SPARE1`~`SPARE10`, 대소문자만 다른 `Spare1` 도 함께).
- MES 별칭 6개는 다른 컬럼의 표준 물리명과 같다(예: 별칭 `CUS` → 컬럼 4640, 표준 `CUS` → 컬럼 4653).
- `TRANSFORM` 은 1행(`ALPHA`)만 있다.

## 2. 결정

| # | 결정 | 내용 | 이유 |
|---|---|---|---|
| L1 | 순서: 표준 먼저, 별칭은 보조 | 키가 표준 물리명과 맞으면 그 컬럼. 없을 때만 모듈의 시스템 별칭으로 찾는다 | 지금 맞는 이름의 뜻이 하나도 바뀌지 않는다(겹치는 6개도 표준 쪽). 회귀 0 |
| L2 | 시스템은 모듈 설정 | `cactus.mdm.system-code`(기본 없음 = 별칭 매칭 끔). 다섯 업무 모듈 yml 은 `MES` | 모듈마다 실제 DB 의 시스템이 다르다. 켜고 끄기가 명시적이다 |
| L3 | 별칭 비교는 대소문자 무시 | 키(이미 대문자)와 `UPPER(PHYS_NAME)` 비교. 같은 별칭이 여러 컬럼을 가리키면 모호 → "없음" + MDM WARN | 저장값에 `Spare1` 같은 대소문자 혼용이 있다. 모호한 이름으로 엉뚱한 정의를 쓰지 않는다 |
| L4 | 응답 칸 | 별칭으로 맞으면 컬럼 메타에 `matchedSystem`(시스템 코드)·`systemPhysName`(저장된 별칭 원문)을 더한다. `physName` 은 표준 물리명 그대로. 표준으로 맞으면 둘 다 null | 툴팁이 "MES 이름 X · 표준 Y" 를 보일 수 있다. 엔진 정의는 표준 그대로 |
| L5 | 캐시 키 | 업무 모듈 캐시는 지금처럼 요청 키(별칭 이름)로 둔다 | 모듈 하나는 시스템 하나라 키가 충돌하지 않는다 |
| L6 | 무효화 | 컬럼 변경 기록에 그 컬럼의 표준 이름과 **모든 시스템 별칭**(대문자)을 COLUMN 키로 함께 남긴다. 컬럼 저장에서 별칭 행이 바뀌면 바뀌기 전·뒤 별칭을 모두 남긴다. 도메인 하위 트리 펼침의 컬럼에도 별칭을 더한다 | 별칭 키로 캐시된 항목·"없음" 항목이 바뀐 정의를 놓치지 않는다 |
| L7 | TRANSFORM 은 무시 | 값 변환은 하지 않는다 | 1행뿐이고 의미가 정해지지 않았다 |
| L8 | 비즈니스식 요구 변수는 표준 이름 그대로 | 별칭 칸을 검사할 때 `bizRequiredVars`(표준 이름)를 행의 별칭 키로 옮기지 않는다 — 요구 변수가 없으면 지금처럼 BIZ_VAR_MISSING | 범위를 작게 둔다. 후속 과제로 남긴다 |

## 3. 계약

- metaFeed `search`(type=COLUMN) 요청 `params.systemCode`(선택). 다른 type 에는 영향 없음. 없거나 빈 값이면 별칭 매칭을 하지 않는다.
- 응답 `ColumnMeta` 에 `matchedSystem: string|null`, `systemPhysName: string|null` 추가(MDM `MetaFeedPayloads.ColumnMeta`, cactus `MdmColumnMeta`·`MdmScreenColumn`, 화면 `MdmScreenColumn`). cactus 는 모르는 칸을 무시하므로 MDM 이 먼저 배포돼도 깨지지 않는다.
- cactus `MdmMetaClient` 는 COLUMN 요청에만 `systemCode` 를 싣는다.
- 화면 `MdmMetaCard` 제목 줄: 별칭으로 맞았으면 `{캡션} {요청 이름}` 아래에 "MES 이름 · 표준 {physName}" 한 줄.

## 4. 시험

- MDM: 표준 우선(겹치는 이름은 표준), 별칭 대소문자 무시, 모호 별칭은 missing, systemCode 없으면 별칭 안 봄, 응답 칸, 기록기(컬럼 저장 시 별칭 전·후, 도메인 펼침에 별칭), cactus 클라이언트와의 계약 HTTP 시험(`MdmMetaFeedContractHttpTest`)에 별칭 사례.
- cactus: 설정 바인딩, COLUMN 요청에만 systemCode, 새 칸 역직렬화, 화면 메타에 칸 전달.
- 화면: 카드의 별칭 줄, 표준 매칭이면 줄 없음.
