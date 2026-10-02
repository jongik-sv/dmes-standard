# MDM 화면 메타 연동과 값 검증 설계 (하위 프로젝트 B·C)

> 상위 요구: `docs/idea.md` 의 "UI 캡션/라벨을 MDM에서 자동으로 가져옴", "Form·Grid 헤더에 마우스를 올리면 툴팁으로 컬럼·도메인 정보", "룰 엔진 실행 검증(화면 값 자동 검증, BE 에서 값 검증 및 체크)".
> 기반: 하위 프로젝트 A [2026-10-02-mdm-meta-cache-design.md](2026-10-02-mdm-meta-cache-design.md)(업무 모듈 MDM 메타 캐시, `/api/{module}/mdmMeta/columns·domains`). 결정 D1~D9 를 그대로 따른다.
> 결정 방식: 사용자가 세부 선택을 위임했다("질문할 내용이 있으면 알아서 최적, 최선의 선택을 하고 결정 결과를 남겨줘"). 아래 결정은 `docs/mdm/decisions.md` D-146·D-147 에도 남긴다.

## 1. 범위

| 하위 | 하는 것 | 하지 않는 것 |
|---|---|---|
| B | 그리드 머리글·폼 라벨 캡션을 MDM 컬럼 사전에서 채운다. 머리글·라벨에 마우스를 올리면 컬럼·도메인 정보 툴팁을 띄운다 | 다국어 캡션, 시스템별 물리명 별칭 매칭(§8 후속) |
| C | 화면: 필수·타입·길이·소수 자리·허용 코드·도메인 표준식을 즉시 검사한다. 서버: 저장할 때 같은 항목과 비즈니스식·지정 룰 세트를 엔진으로 다시 검사하고, 오류를 입력 칸에 표시한다 | 마루 데이터 대상 `MASTER`(엔진·MDM 모두 `MasterLookup.NONE`, §6.6), 자동 끼어들기(AOP) 검증 |

## 2. 확정한 결정

| # | 결정 | 내용 | 이유 |
|---|---|---|---|
| B1 | 캡션 우선순위: 명시 우선, 화면·전역 전환 가능 | 그리드 `header`·폼 `label` 을 적으면 그대로 쓴다. 비우면 MDM 캡션을 쓴다. `MdmMetaProvider captionPriority="mdm"` 이면 MDM 캡션이 이긴다(MDM 에 없으면 적은 값) | 지금 화면의 캡션이 바뀌거나 깜빡이지 않는다. D7 "명시 우선" 과 같은 원칙이다. 새 화면은 캡션을 적지 않으면 MDM 을 따르고, 표준 용어로 통일하려는 화면은 한 줄로 전환한다 |
| B2 | 캡션 칸 | 그리드: `labelShort` → `labelMid` → `labelLong` → `columnName`. 폼: `labelMid` → `labelLong` → `labelShort` → `columnName`. 모두 없거나 MDM 에 없으면 화면 키 | 그리드 칸은 좁고 폼 라벨은 넓다 |
| B3 | 툴팁 내용·순서 | ① 제목: `labelLong`(없으면 `columnName`) + 물리명 ② 설명·사용 메모 ③ 형식: `STRING(20)`·`NUMBER(3,1)`, 필수 여부, 기본값 ④ 도메인: 이름(ID·종류), 단위 ⑤ 표준식 원문 ⑥ 허용 코드: 앞 10개 `코드 이름`, 나머지는 "외 N개" ⑦ 비즈니스 규칙이 있으면 "저장할 때 서버에서 확인" (원문은 싣지 않는다, A spec §4.2) | 무엇을 넣어야 하는지(형식·필수·허용값)를 먼저, 왜 그런지(도메인·식)를 뒤에 둔다 |
| B4 | 받는 시점 | 화면이 열릴 때 그 화면의 그리드·폼이 등록한 이름을 한 틱 동안 모아 모듈마다 POST 한 번(`columns`), 응답의 도메인 ID 로 한 번 더(`domains`). 브라우저 메모리에 모듈+물리명 단위로 5분 둔다. 같은 키의 진행 중 요청은 공유한다 | 툴팁을 처음 올릴 때 기다리지 않는다. 업무 BE 캐시가 가까워 요청 비용이 작다 |
| B5 | 모듈 결정 | 포털 탭의 `pageId`(`모듈:화면`)에서 모듈을 얻는다. `MdmMetaProvider module` 로 덮어쓸 수 있다. 모듈이 `mdmMeta` 를 모르거나(404) 인증·권한이 없거나(401·403) 연결이 안 되면 그 모듈은 세션 동안 메타 없음으로 두고 다시 부르지 않는다. 401 에도 로그인 화면으로 보내지 않는다 | `analog`·`mdm` 처럼 엔드포인트가 없는 모듈이 있다. A 에서 401 리다이렉트가 관리자를 로그아웃시킨 일이 있었다 |
| B6 | 연결 키 | D7 그대로: 그리드 `key`, 폼 `FormGroup name` 을 물리명으로 바꿔(`codeNm`→`CODE_NM`, 대문자는 그대로) 찾는다. 명시 `meta="PHYS_NAME"` 이 이기고 `meta={false}` 면 끈다 | A 와 같은 규칙(`MdmNames.toPhysName`) |
| B7 | 적용 범위 | 포털 탭마다 `MdmMetaProvider` 를 자동으로 씌운다. 그래서 캡션(비운 칸)·툴팁은 모든 화면에 바로 적용된다. 공급자 밖(포털 밖 단독 실행·테스트)에서는 기존 동작 그대로다 | 사용자 요구가 "자동" 이다. 툴팁은 덧붙는 것이라 기존 화면을 깨지 않는다 |
| B8 | shared 변경(사용자 요구로 승인된 범위) | 기존: `GridColumn.header` 선택 칸으로, `GridColumn.meta` 추가, 머리글 툴팁; `FormGroup` 에 `name`·`meta` 추가, `tip` 을 `ReactNode` 까지; 포털 탭에 공급자. 신규: `@dk-oasis/shared` 의 `mdm-meta`(공급자·훅·`MdmMetaCard`), `evalex`(C3) | CLAUDE.md "기존 shared 변경은 승인 뒤" — idea.md 요구가 Form·Grid 를 직접 지목했다. 최종 보고에 바뀐 props·동작을 모두 적는다 |
| C1 | 화면 검증 항목 | 필수, 타입(NUMBER 는 숫자, DATE 류는 형식), 길이(문자열 code point 수 ≤ length), 소수(NUMBER(p,s): 정수부 ≤ p−s, 소수부 ≤ s), 허용 코드(`allowedCodes` 를 받았을 때만), 도메인 표준식(`stdExpr.ast`, `isSupported` 가 거짓이면 건너뛰고 서버에 맡긴다). 비즈니스식은 화면에서 하지 않는다 | 엔진 계약 §10·D8 |
| C2 | 화면 검증 켜기: 화면이 고른다 | 그리드 `mdmValidate` prop(편집 가능하고 MDM 에 연결된 칸만), 폼은 `useMdmValidation()` 훅 + `FormGroup error`. 기본은 꺼짐 | 컬럼 사전은 테이블 구분 없이 물리명 하나로 전역이다(`TB_MDM_COLUMN_SYSTEM` 은 시스템 별칭이지 테이블 대응이 아니다). 잘못 맞은 이름 하나가 포털 전체 입력을 막지 않게 한다 |
| C3 | 화면 평가기 위치 | `m-mdm/src/evalex` 를 `shared/src/evalex` 로 옮기고 `@dk-oasis/shared/evalex` 로 내보낸다. `@dk-oasis/m-mdm/evalex` 는 shared 를 다시 내보내 그대로 둔다. 코퍼스 시험은 m-mdm 에 남긴다 | shared 가 m-mdm 을 가져오면 순환이다 |
| C4 | 서버 검증 API | cactus-core `MdmValidator.check(MdmValidationRequest)`. 업무 서비스 `save()` 안에서 명시적으로 부른다. 검사할 컬럼을 요청에 적는다(암묵 "맞는 키 전부" 없음) | 저장 전 공통 끼어들 지점이 없다(조사). C2 와 같은 이유로 명시 |
| C5 | 길이 단위: code point | 화면·서버 모두 문자열 길이를 code point 수로 센다(JS `[...s].length`, Java `s.codePointCount(0, s.length())`) | PostgreSQL·SQLite 는 글자 단위다. Oracle BYTE 의미는 DB 제약이 마지막에 막는다 |
| C6 | 평가 중 MDM 호출 금지 | 검증 전에 호출자 스레드에서 필요한 컬럼·코드·룰 세트(와 그 룰) 정의를 받아 둔다. 엔진 평가는 캐시만 보는 조회기로 한다. 평가 중 캐시에 없으면 "검증 불가" 로 판정한다 | 엔진 평가 제한 1초 < HTTP read 5초. 엔진 예외는 원인을 잃으므로 문구로 원인을 가리지 않는다 |
| C7 | MDM 장애 정책 | 검사에 필요한 정의를 받을 수 없으면 기본은 저장 거부(`MDM_UNAVAILABLE`, "MDM 정의를 받을 수 없어 검증하지 못했습니다. 잠시 뒤 다시 시도하세요"). 모듈 설정 `cactus.mdm.validation.on-unavailable: PASS` 면 WARN 을 남기고 통과 | D8 "서버가 기준". 받아 둔 정의는 A 캐시가 유휴 60분·최대 24시간 지키므로 장애가 영향을 주는 범위는 오래 안 쓴 정의뿐이다 |
| C8 | 룰 세트 위반 판정 | 받는 노드가 받지 않은 엔진 위반(`EngineEvaluationException`)만 행 오류다. 받는 노드가 받아 처리한 것(`caught`)·결과값(`finalValues`)은 결과로 돌려주고 판정은 호출자가 한다 | 받는 노드 갈래는 대체 처리일 수도 있어 오류로 단정할 수 없다 |
| C9 | 오류 모양 | 기존 `ErrorDetail(grid, rowKey, rowIndex, field, code, message)` + `BusinessException(INVALID_VALUE, "입력값을 확인해주세요.", errors)`. `field` 는 요청 행의 원래 키다. 코드: 필수 `E001`, 그 밖 `E002`, 검증 불가 `MDM_UNAVAILABLE` | 화면이 이미 이 모양을 읽는다(`extractBackendFieldErrors`) |

## 3. 구조

```
포털 탭 ─ MdmMetaProvider(module = pageId 앞부분)
   ├─ AgDataGrid  ─ 열 key → 물리명 등록 → 캡션·머리글 툴팁(MdmMetaCard) · mdmValidate 면 셀 검사
   └─ FormGroup   ─ name → 물리명 등록 → 라벨·툴팁 · error 는 화면이 useMdmValidation 결과로 준다
        │ (한 틱 모음, 모듈당 1회)
        ▼
 POST /api/{module}/mdmMeta/columns · /domains   ← A, 업무 BE 캐시
        ▲
 업무 서비스 save() ─ MdmValidator.check(grid, rows, columns, ruleSets)
        └─ 미리 받기(호출자 스레드) → 길이·소수(cactus) → DomainValidator(엔진) → RuleEngine.evaluateSet(엔진) → ErrorDetail
```

## 4. 화면 공통 계약 (shared)

모든 신규 파일은 `src/frontend/shared/src/mdm-meta/` 아래에 두고 `@dk-oasis/shared/mdm-meta` 서브패스와 루트 색인으로 내보낸다. 이 절의 이름·타입은 병렬 작업이 서로 맞추는 계약이다 — 바꾸지 않는다.

```ts
// types.ts — 업무 BE 응답(A MdmScreenColumn·MdmDomainMeta)과 같은 칸
export interface MdmDomainRef { domainId: string; domainName: string | null; domainKind: string | null }
export interface MdmExpr { text: string | null; ast: Record<string, unknown> | null }
export interface MdmCodeRef { maruCodeId: string; cateId: string | null }
export interface MdmAllowedCode { code: string; name: string | null }
export interface MdmScreenColumn {
  physName: string; columnName: string | null;
  labelLong: string | null; labelMid: string | null; labelShort: string | null;
  description: string | null; usageNote: string | null;
  dataType: string | null; length: number | null; scale: number | null;
  required: boolean; defaultValue: string | null;
  refKind: string | null; refTarget: string | null; refCateId: string | null;
  domain: MdmDomainRef | null; stdExpr: MdmExpr | null;
  bizRuleOnServer: boolean; bizRequiredVars: string[];
  codeRef: MdmCodeRef | null; allowedCodes: MdmAllowedCode[] | null;
}
export interface MdmDomainMeta {
  domainId: string; domainName: string | null; stdName: string | null; domainKind: string | null;
  dataType: string | null; length: number | null; scale: number | null; unitCode: string | null;
  description: string | null; stdExpr: MdmExpr | null; bizRuleOnServer: boolean; codeRef: MdmCodeRef | null;
}
export type MdmCaptionKind = "grid" | "form";
export type MdmCaptionPriority = "explicit" | "mdm";

// names.ts — MdmNames.toPhysName 과 같은 규칙. 비면 null
export function toPhysName(name: string | null | undefined): string | null;

// store.ts — 모듈 수준 상태는 globalThis["__dkOasisMdmMetaStore__"] 하나에 둔다(tsup 분리 빌드에서 중복 방지)
export function requestColumns(module: string, physNames: string[]): Promise<Map<string, MdmScreenColumn | null>>; // 키 = 물리명, null = MDM 에 없음
export function requestDomains(module: string, domainIds: string[]): Promise<Map<string, MdmDomainMeta | null>>;
export function isModuleDisabled(module: string): boolean;   // 404·401·403·연결 실패로 세션 동안 끈 모듈
export function resetMdmMetaStore(): void;                    // 시험용

// context.tsx — React 컨텍스트는 globalThis["__dkOasisMdmMetaContext__"] 로 하나만 만든다(TabPageContext 와 같은 방식)
export interface MdmMetaProviderProps { module?: string; captionPriority?: MdmCaptionPriority; disabled?: boolean; children: React.ReactNode }
export function MdmMetaProvider(props: MdmMetaProviderProps): JSX.Element;
export interface MdmColumnInfo { column: MdmScreenColumn | null; domain: MdmDomainMeta | null; loading: boolean }
export function useMdmColumn(name: string | null | undefined, meta?: string | false): MdmColumnInfo;   // 공급자 밖이면 {null,null,false}
export function useMdmColumns(entries: Array<{ name: string; meta?: string | false }>): Map<string, MdmColumnInfo>; // 키 = name
export function useMdmCaptionPriority(): MdmCaptionPriority;

// caption.ts
export function resolveCaption(column: MdmScreenColumn | null, kind: MdmCaptionKind,
  explicit: string | null | undefined, priority: MdmCaptionPriority, fallbackKey: string): string;

// MdmMetaCard.tsx — 툴팁 본문(B3 순서). 업무 무관 표시 부품
export interface MdmMetaCardProps { column: MdmScreenColumn; domain?: MdmDomainMeta | null }
export function MdmMetaCard(props: MdmMetaCardProps): JSX.Element;

// validate.ts (C)
export type MdmValueIssueCode = "REQUIRED" | "TYPE" | "LENGTH" | "SCALE" | "CODE" | "STD_EXPR";
export interface MdmValueIssue { code: MdmValueIssueCode; message: string }
export function codePointLength(s: string): number;
export function validateMdmValue(column: MdmScreenColumn, value: unknown,
  row?: Record<string, unknown>, caption?: string): MdmValueIssue | null;
export interface MdmRowIssue { rowIndex: number; field: string; issue: MdmValueIssue }
export function useMdmValidation(): {
  validateValue(name: string, value: unknown, row?: Record<string, unknown>, meta?: string | false): MdmValueIssue | null;
  validateRow(row: Record<string, unknown>, names: string[]): Record<string, MdmValueIssue>;
  validateRows(rows: Array<Record<string, unknown>>, names: string[]): MdmRowIssue[];
};
```

기존 shared 변경:

- `GridColumn.header?: string`(선택), `GridColumn.meta?: string | false`. 캡션은 `resolveCaption(…, "grid", col.header, priority, col.key)`. `header` 를 읽던 곳(엑셀 내보내기·열 선택 등)은 모두 해석한 캡션을 쓴다.
- 머리글 툴팁: 열에 MDM 메타가 있고 화면이 `headerTooltip`·`headerComponent` 를 직접 주지 않았으면 AG Grid 사용자 툴팁 컴포넌트로 `MdmMetaCard` 를 띄운다. 그 밖에는 지금 동작 그대로.
- `AgDataGrid` 신규 prop: `mdmValidate?: boolean`(C2), `fieldErrors?: Array<{ rowKey?: string; rowIndex?: number; field: string; message: string }>`(서버 오류 칸 표시, C9).
- `FormGroup` 신규 prop: `name?: string`, `meta?: string | false`. `label` 을 선택 칸으로(비우면 B1·B2 캡션). `tip?: string | React.ReactNode`. MDM 메타가 있고 `tip` 이 없으면 `MdmMetaCard` 를 툴팁으로 쓴다. `FormGroup` 은 입력값을 보지 않는다 — 폼 검증은 훅 + `error` prop 이다.
- 포털 탭(`portal-shell`)이 탭 본문을 `MdmMetaProvider` 로 감싼다.
- 요청은 401 리다이렉트를 하지 않는 POST 로 보낸다(`apiRequest` 금지). 실패 시 그 모듈을 끈다(B5).

## 5. 화면 검증 (C, 화면)

- `validateMdmValue` 순서: 빈 값 정규화(공백만이면 빈 값) → 필수 → 타입 → 길이·소수 → 허용 코드 → 표준식. 첫 실패에서 멈춘다(엔진과 같은 한 칸 한 오류).
- 표준식: `@dk-oasis/shared/evalex` 로 `stdExpr.ast` 를 평가한다. 변수는 엔진과 같게 물리명 키의 레코드(값 칸 자신은 그 물리명)다. `isSupported` 가 거짓이거나 평가가 `FallbackSignal`·오류면 통과(서버 확인)로 본다.
- 문구(캡션 = B2 폼 캡션): 필수 "{캡션}은(는) 필수입니다", 타입 "{캡션}은(는) 숫자여야 합니다"/"…날짜 형식이 아닙니다", 길이 "{캡션}은(는) 최대 {n}자입니다", 소수 "{캡션}은(는) 정수 {p−s}자리, 소수 {s}자리까지입니다", 코드 "{캡션}: 허용되지 않은 코드입니다", 표준식 "{캡션}: 표준 규칙을 만족하지 않습니다({stdExpr.text})".
- 그리드 `mdmValidate`: 편집 가능 + MDM 연결 칸만, 셀 값이 바뀌면 그 셀을 검사해 오류 셀에 `cell-mdm-invalid` 클래스와 셀 툴팁(문구)을 단다. `fieldErrors` 칸도 같은 모양으로 표시한다(서버가 기준 — 같은 칸이면 서버 문구를 보인다).
- 저장 전 전체 검사는 화면이 `useMdmValidation().validateRows` 로 한다.

## 6. 서버 검증 (C, cactus-core)

### 6.1 API

```java
package com.dongkuk.dmes.cactus.mdm;

public record MdmValidationRequest(String grid, List<Map<String, Object>> rows, List<String> columns,
                                   List<String> ruleSets, Instant evalTs) {
    public static Builder rows(String grid, List<Map<String, Object>> rows);
    public static Builder record(Map<String, Object> record);          // 폼 하나 — grid null, rowIndex 0
    // Builder: columns(String...), ruleSet(String), evalTs(Instant), build()
}
public record MdmValidationResult(List<ErrorDetail> errors, List<String> unavailable,
                                  Map<Integer, List<RuleSetResult>> ruleSetResults) {
    public boolean ok();   // errors·unavailable 모두 비었다
}
public class MdmValidator {
    public MdmValidationResult validate(MdmValidationRequest request);
    /** 오류가 있으면 BusinessException(INVALID_VALUE, "입력값을 확인해주세요.", errors). 검증 불가면 C7 정책. */
    public MdmValidationResult check(MdmValidationRequest request);
}
```

### 6.2 동작

1. 행 거르기: `rowStatus` 가 `D`·`deleted` 면 건너뛴다. `rowStatus` 가 없으면(폼) 검사한다. `rowIndex` 는 요청 목록의 자리, `rowKey` 는 행의 `rowKey` 값.
2. 키 정규화: `columns` 의 각 이름과 행 키를 `MdmNames.toPhysName` 으로 맞춘다. 엔진에 넘기는 레코드는 검사 대상 컬럼과 그 `bizRequiredVars` 에 해당하는 행 값만 물리명 키로 담는다(`rowStatus`·`rowKey`·`_` 접두 키·상수 이름 키는 넣지 않는다 — `RecordKeys` 예외 방지). 오류의 `field` 는 행의 원래 키.
3. 미리 받기(호출자 스레드): 검사 컬럼(`COLUMN`), 그 코드 참조(`CODE`), 룰 세트(`RULE_SET`)와 그 `ruleIds`(`RULE`), 그리고 식 AST 를 훑어 `CODE`·`MASTER`·`MASTER_AT` 의 첫 인자 상수(코드 ID)를 `CODE` 로 받는다. 받을 수 없는 키는 `unavailable` 로 모은다.
4. 평가: 엔진에는 캐시만 읽는 조회기를 준다(HTTP 를 부르지 않는다). 평가 중 캐시 부재는 검증 한 번 범위의 부재 기록기로 잡아 `unavailable` 로 돌린다.
5. 컬럼마다: 사전에 없는 컬럼은 서버 오류(프로그램 결함, `IllegalArgumentException`) — 요청에 적은 컬럼이 사전에 없으면 개발 중 바로 드러나야 한다. 있으면 길이·소수(cactus) → `DomainValidator.validate(null, 물리명, 레코드, evalTs)`. 실패를 `ErrorDetail` 로(§2 C9 코드, 문구는 §5 와 같은 꼴, 비즈니스식은 "업무 규칙을 만족하지 않습니다" 로 원문을 싣지 않는다).
6. 룰 세트마다: `RuleEngine.evaluateSet(setId, 레코드, evalTs)` 의 레코드는 행 전체를 물리명 키로(예약 키 제외). `EngineEvaluationException` 의 위반마다 행 오류(`field` = 위반 `name` 의 원래 키, 없으면 null), 결과는 `ruleSetResults` 에 행 번호로.
7. `unavailable` 이 비지 않으면 C7: REJECT 는 `BusinessException(ErrorCode.BUSINESS_ERROR, 문구, [ErrorDetail(code="MDM_UNAVAILABLE", field=null)])`, PASS 는 WARN 후 그 항목만 건너뛴다.

### 6.3 빈과 설정

- `MdmAutoConfiguration`(enabled 일 때): `MdmEvaluator`(캐시 전용 조회기), `DefaultDomainValidator`, `MdmRuleEngine`, `MdmValidator`. 모두 `@ConditionalOnMissingBean`.
- `cactus.mdm.validation.on-unavailable: REJECT`(기본) | `PASS`.
- `MasterLookup` 은 `NONE` 이다. 지금 MDM 도메인 164건 중 표준식·비즈니스식에 `MASTER` 를 직접 쓴 것은 0건이다(2026-10-03 로컬 mdm.db). CODE 도메인 18건은 마루 코드 대상 자동 `MASTER` 라 `CodeLookup` 으로 간다.

### 6.4 가드 (§6.6)

- 마루 데이터 대상 `MASTER` 는 지원하지 않는다. 미리 받기에서 첫 인자 상수가 마루 코드가 아니면(코드 원본 없음) 그 컬럼의 검사를 "검증 불가" 로 돌린다(C7). 화면은 `isSupported` 거짓으로 이미 서버에 맡긴다.

## 7. 파일럿과 문서

- 파일럿 화면: m-mls `lsh/noticeMgmt`. MDM 컬럼 사전에 `TITLE`(STRING 1000)·`CATEGORY`(STRING 240)·`USE_YN`·`SORT_SEQ` 가 있다. 화면은 그 칸의 `header` 를 비워 MDM 캡션을 쓰고(B1 이 눈에 보이게), 머리글 툴팁, 그리드 `mdmValidate`, 서버 `fieldErrors` 표시를 켠다. 서버 `save()` 는 `MdmValidator.check` 로 MDM 정의가 DB 칸보다 느슨하거나 같은 컬럼만 검사한다(DB 길이와 비교해 MDM 이 더 엄격한 칸은 넣지 않는다).
- 문서: 백엔드 가이드 §11.2 "저장 검증", 프런트 가이드(standard-v2 또는 Local-Rules)에 "MDM 캡션·툴팁·검증" 절, `mantine-aggrid-ui` 스킬의 컴포넌트 문서·색인(`mdm-meta`, `MdmMetaCard`, `AgDataGrid`·`FormGroup` 새 prop).

## 8. 후속(이번 범위 밖)

- 시스템별 물리명 별칭 매칭: `TB_MDM_COLUMN_SYSTEM` MES 9,536행 중 5,938행이 표준 물리명과 다르다(예: `ABS_CHM_SLP_AMT` ↔ `ABS_CHM_RPLN_AMT`). 옛 MES 물리명을 쓰는 화면을 맞추려면 metaFeed 가 별칭으로도 찾아야 한다.
- 마루 데이터 `MASTER` 캐시(엔진·MDM 모두 `MasterLookup.NONE`).
- 만료 정의의 장애 시 재사용(stale-if-error).

## 9. 시험

- shared: `toPhysName`·`resolveCaption`·store 묶음 요청/5분/진행 중 공유/모듈 끄기/401 리다이렉트 없음, 공급자 밖 동작 불변, `MdmMetaCard` 순서, `GridColumn` 캡션·머리글 툴팁, `FormGroup name`, `validateMdmValue` 표(필수·타입·길이 code point(이모지·한글)·소수·코드·표준식·isSupported 거짓 통과), 그리드 `mdmValidate`·`fieldErrors`.
- cactus-core: 키 정규화·예약 키 제외, 삭제 행 건너뜀, 길이 code point, 소수, 엔진 실패→ErrorDetail, 룰 세트 위반, 미리 받기 후 평가 중 HTTP 0회, 평가 중 캐시 부재→unavailable, REJECT·PASS, 사전에 없는 컬럼→IAE.
- 파일럿: mls `NoticeMgmtService` 저장 검증 시험, 화면 vitest.
