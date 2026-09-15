# EvalEx 3.x 가이드: 문법과 마루 MDM 적용 방법

> 기준: EvalEx **3.7.0** — 2026-09-01 확인 시점의 최신 릴리스(GitHub Release 2026-07-10, Maven Central `latest`/`release` = 3.7.0, lastUpdated 2026-07-10). 공식 문서에는 문법 단독 페이지가 없어 문서(references/operators, functions, constants, concepts/datatypes)와 소스(`operators/OperatorIfc.java`, `parser/Tokenizer.java`, `config/ExpressionConfiguration.java`)를 합쳐 정리함.
>
> 소스는 `main` 브랜치를 읽었으나 3.7.0 태그와 비교(`compare/3.7.0...main`, 6커밋)한 결과, 토큰 규칙·연산자 우선순위·표준 연산자 집합은 3.7.0과 동일함을 확인했다. 3.7.0 이후 `main`에만 있는 것은 `DT_TRUNCATE` 함수(미출시), JPMS `module-info`, 사용자 정의 후위/중위 연산자 모호성 해소뿐이다(표준 연산자에는 후위 연산자가 없어 영향 없음). 공식 문서 사이트는 `main` 기준으로 빌드되므로 미출시 항목이 섞여 있을 수 있다.

## 1. 토큰 규칙 (Tokenizer)

| 항목 | 규칙 | 예 |
| --- | --- | --- |
| 식별자(변수·함수명) | 첫 글자: 문자(유니코드 `Character.isLetter`) 또는 `_`. 이후: 문자, 숫자, `_` | `COIL_THK`, `두께`, `_tmp` |
| 대소문자 | 변수는 기본 `MapBasedDataAccessor`가 대소문자 무시. 함수·연산자 사전도 대소문자 무시 | `sqrt(4)` = `SQRT(4)` |
| 숫자 리터럴 | 십진수, 소수점 1개, 지수 `e`/`E`(부호 가능), 16진수 `0x`/`0X`. 언더스코어 구분 미지원. 모든 숫자는 `BigDecimal` | `3.5`, `1.5e-3`, `0xFF` |
| 문자열 리터럴 | 큰따옴표 `"…"`. 작은따옴표 `'…'`는 설정 `singleQuoteStringLiteralsAllowed(true)` 필요 | `"A급"` |
| 이스케이프 | `\"` `\'` `\\` `\n` `\r` `\t` `\b` `\f` | `"1\"인치"` |
| 불린 | 상수 `TRUE`, `FALSE`. 숫자→불린: 0은 false, 그 외 true. 문자열 `"true"`(대소문자 무관)만 true | |
| NULL | 상수 `NULL` (또는 `null`) | `COALESCE(x, 0)` |
| 배열 접근 | `이름[인덱스]`, 0부터 시작, 중첩 가능. 설정 `arraysAllowed`(기본 true) | `values[i-1]`, `m[2][1]` |
| 구조체 접근 | `이름.필드`, 중첩 가능. 공백 포함 키는 `이름."key name"`. 설정 `structuresAllowed`(기본 true). `.` 뒤가 숫자면 소수점으로 해석 | `order.positions[0].amount` |
| 배열·구조체 리터럴 | 표현식 안에서 `[1,2]`나 `{...}`로 직접 생성하는 문법은 없음. Java에서 `List`/`Map`으로 전달 | |
| 암묵적 곱셈 | 설정 `implicitMultiplicationAllowed`(기본 true)일 때 `)(`, `숫자 변수`, `숫자 함수`, `숫자 (` 사이에 `*` 삽입 | `2x`, `2(3+1)`, `3SQRT(4)` |
| 함수 호출 | `이름(인자, 인자, …)`. 인자 없는 함수도 괄호 필수 | `MAX(a, b, c)`, `DT_NOW()` |
| 공백 | 모두 무시 | |
| 주석 | 미지원 | |
| 문장·대입·세미콜론 | 없음. 표현식 1개 = 값 1개 | |

## 2. 연산자와 우선순위 (OperatorIfc)

숫자가 클수록 먼저 계산. 같은 우선순위는 왼쪽부터.

| 우선순위 | 상수 | 연산자 | 종류 | 의미 |
| --- | --- | --- | --- | --- |
| 80 | `POWER_HIGHER` | (옵션) | | 거듭제곱을 단항보다 높게 두고 싶을 때 설정으로 사용 |
| 60 | `UNARY` | `+x` `-x` `!x` | 단항 접두 | 부호, 논리 부정 |
| 40 | `POWER` | `^` | 이항 | 거듭제곱 |
| 30 | `MULTIPLICATIVE` | `*` `/` `%` | 이항 | 곱, 나눗셈, 나머지 |
| 20 | `ADDITIVE` | `+` `-` | 이항 | 덧셈(문자열이면 연결), 뺄셈 |
| 10 | `COMPARISON` | `<` `<=` `>` `>=` | 이항 | 비교 (숫자·문자열·날짜) |
| 7 | `EQUALITY` | `=` `==` `!=` `<>` | 이항 | 같음 / 다름 (`=`와 `==` 동일, `!=`와 `<>` 동일) |
| 4 | `AND` | `&&` | 이항 | 논리곱 |
| 2 | `OR` | `\|\|` | 이항 | 논리합 |

주의
- 기본 설정에서 `-2^2`는 단항(60)이 거듭제곱(40)보다 높아 `(-2)^2 = 4`로 계산된다. 수학 관례(`-4`)를 원하면 `POWER_HIGHER` 옵션 사용.
- 삼항 연산자 `? :` 없음. `IF(조건, 참값, 거짓값)` 함수 사용 (참·거짓 인자는 지연 평가).
- 문자열 연결은 `+`. 한쪽이 문자열이면 문자열 결합.
- `&&`, `||`는 단락 평가(short-circuit) 지원.

## 3. 표준 상수

| 상수 | 값 |
| --- | --- |
| `TRUE`, `FALSE` | 불린 |
| `NULL` | null |
| `PI` | 3.14159265358979323846… |
| `E` | 2.71828182845904523536… |
| `DT_FORMAT_ISO_DATE_TIME` | `yyyy-MM-dd'T'HH:mm:ss[.SSS][XXX]['['VV']']` |
| `DT_FORMAT_LOCAL_DATE_TIME` | `yyyy-MM-dd'T'HH:mm:ss[.SSS]` |
| `DT_FORMAT_LOCAL_DATE` | `yyyy-MM-dd` |

## 4. 표준 함수

### 기본·수학
| 함수 | 인자 | 설명 |
| --- | --- | --- |
| `ABS(v)` | 1 | 절댓값 |
| `CEILING(v)` / `FLOOR(v)` | 1 | 올림 / 내림 |
| `ROUND(v, scale)` | 2 | 소수 `scale` 자리로 반올림(설정의 RoundingMode) |
| `SQRT(v)` | 1 | 제곱근 |
| `LOG(v)` / `LOG10(v)` | 1 | 자연로그 / 상용로그 |
| `FACT(n)` | 1 | 팩토리얼 |
| `MIN(v, …)` / `MAX(v, …)` | 가변, 배열 가능 | 최소 / 최대 |
| `SUM(v, …)` / `AVERAGE(v, …)` | 가변, 배열 가능 | 합 / 평균 |
| `IF(cond, a, b)` | 3 | 조건 분기. `a`, `b`는 지연 평가 |
| `SWITCH(expr, v1, r1, v2, r2, …[, default])` | 가변 | 값 일치 분기 |
| `COALESCE(v, …)` | 가변 | 첫 번째 NULL 아닌 값 |
| `NOT(v)` | 1 | 논리 부정 (`!v`와 동일) |
| `RANDOM()` | 0 | 0-1 난수. **검증식에서는 제외 권장(비결정적)** |

### 문자열 (`STR_`)
`STR_LENGTH`, `STR_UPPER`, `STR_LOWER`, `STR_TRIM`, `STR_LEFT(s, n)`, `STR_RIGHT(s, n)`, `STR_SUBSTRING(s, start[, end])`, `STR_CONTAINS(s, sub)`(대소문자 무시), `STR_STARTS_WITH(s, sub)`, `STR_ENDS_WITH(s, sub)`(대소문자 구분), `STR_MATCHES(s, regex)`, `STR_SPLIT(s, sep)`→배열, `STR_FORMAT(fmt, args…)`(Java `String.format`)

### 삼각함수
도(degree) 기준: `SIN COS TAN COT SEC CSC ASIN ACOS ATAN ACOT ATAN2`
라디안 기준(접미 `R`): `SINR COSR TANR COTR SECR CSCR ASINR ACOSR ATANR ACOTR ATAN2R`
쌍곡(접미 `H`): `SINH COSH TANH COTH SECH CSCH ASINH ACOSH ATANH ACOTH`
변환: `DEG(rad)`, `RAD(deg)`

### 날짜·시간 (`DT_`)
`DT_NOW()`, `DT_TODAY([zone])`, `DT_DATE_NEW(y, m, d[, h, mi, s, ms[, zone]])` 또는 `DT_DATE_NEW(epochMillis)`, `DT_DATE_PARSE(str[, zone][, fmt…])`, `DT_DATE_FORMAT(dt[, fmt][, zone])`, `DT_DATE_TO_EPOCH(dt)`, `DT_TRUNCATE(dt, unit[, zone])`(**3.7.0 미포함, main에만 있음**), `DT_DURATION_NEW(days[, h, mi, s, ms])`, `DT_DURATION_PARSE(iso)`, `DT_DURATION_FROM_MILLIS(ms)`, `DT_DURATION_TO_MILLIS(dur)`
날짜끼리 `-` → DURATION, 날짜 `+`/`-` DURATION → 날짜, 비교 연산자 사용 가능.

## 5. 데이터 타입 ↔ Java

| EvalEx | Java |
| --- | --- |
| NUMBER | `BigDecimal` (int/long/double/BigInteger 등은 자동 변환) |
| BOOLEAN | `Boolean` |
| STRING | `String` |
| DATE_TIME | `java.time.Instant` |
| DURATION | `java.time.Duration` |
| ARRAY | `java.util.List` (배열도 허용) |
| STRUCTURE | `java.util.Map` |
| NULL | `null` |

## 6. 문법에 영향을 주는 설정 (`ExpressionConfiguration`)

| 설정 | 기본 | 효과 |
| --- | --- | --- |
| `mathContext` | 정밀도 68, HALF_EVEN | 모든 연산의 정밀도·반올림 |
| `decimalPlacesRounding` | 무제한 | 연산마다 소수 자리 반올림 |
| `stripTrailingZeros` | true | `9.0` → `9` |
| `implicitMultiplicationAllowed` | true | `2x` 허용 여부 |
| `arraysAllowed` / `structuresAllowed` | true | `[ ]` / `.` 허용 여부 |
| `singleQuoteStringLiteralsAllowed` | false | `'문자열'` 허용 |
| `lenientMode` | false | 미정의 변수를 예외 대신 NULL로 |
| `allowOverwriteConstants` | true | `with()`로 넣는 변수 이름이 상수(TRUE/FALSE/NULL/PI/E 등)와 같으면 상수를 지우고 변수로 대체. false면 예외 |
| `maxRecursionDepth` | 2000 | 중첩 깊이 제한 |
| `functionDictionary` / `operatorDictionary` | 표준 사전 | 함수·연산자 화이트리스트 교체 지점 |
| `dataAccessor` | Map 기반(대소문자 무시) | 변수 공급·제한 지점 |

## 7. 도메인 검증식 작성 예 (마루 MDM 용)

```
value >= 0.1 && value <= 3.5                       범위
value >= COIL_THK                                  교차 컬럼
value % 0.1 == 0                                   0.1 단위 (BigDecimal이라 정확)
STR_MATCHES(value, "^[A-Z0-9]{10,20}$")            형식
IF(GRADE == "A", value <= 2.0, value <= 3.5)       조건부 범위
value >= COALESCE(COIL_THK, 0)                     다른 컬럼 NULL 방어
```

감싸는 대상은 검증 대상 `value`가 아니라 참조하는 다른 컬럼이다. `value`는 02 「제약 관리」의 실행 순서가 필수 검사에서 이미 걸러내므로, 검증식 안에서 `value` 자신을 다시 COALESCE로 감쌀 필요가 없다.

검증식은 결과가 BOOLEAN이어야 하며, `RANDOM()`·`DT_NOW()`처럼 비결정적인 함수는 화이트리스트에서 제외한다.

3.7.0 릴리스 노트의 보안 변경 두 가지는 서버 쪽에 그대로 해당된다: `FACT` 입력 상한(CWE-400, DoS 방지), `STR_MATCHES` 타임아웃(CWE-1333, ReDoS 방지). 화면 인터프리터에는 `FACT`가 없고 `STR_MATCHES`에는 타임아웃이 없으므로, 정규식은 저장 시점에 **중첩 수량자**(`(a+)+` 꼴)를 검사해 걸러낸다. 같은 시점에 `(?i)`·소유 한정자·원자 그룹 같은 **Java 전용 문법**도 거부한다. 화면 `new RegExp()`가 SyntaxError를 내고 `isSupported()`는 패턴 문자열을 보지 않아 폴백으로 못 막기 때문이다(06 「저장 시 검사」). 길이는 기준으로 쓰지 않는다. 실제 일자를 판정하는 일자 도메인 식이 219자인데 수량자 중첩이 없어 선형이기 때문이다(02 "일자 도메인 정규식").

## 8. 화면(JS)에서 EvalEx 규칙을 실행하는 방법

EvalEx는 Java 전용이고 JS 포트가 없다. 화면에서 같은 규칙을 실행하려면 **파싱은 서버 EvalEx가 하고, 화면은 AST(JSON)만 해석**한다. JS에 별도 파서(math.js, expr-eval 등)를 두면 우선순위·`^`·`==`·문자열 규칙이 EvalEx와 달라 화면과 서버 결과가 어긋난다.

### 8.1 흐름

```
[표현식 저장 시 1회]  표현식 텍스트 ──EvalEx 파싱──▶ ASTNode ──AstExporter──▶ AST JSON
                     → 표현식 텍스트와 AST JSON을 같은 행에 함께 저장 (예: validation_rule + validation_ast)
[조회·배포]           저장된 AST JSON을 그대로 내려줌. 재파싱 없음
[화면]               AST JSON + 입력값 ──evalex-ast-interpreter.js(decimal.js)──▶ 즉시 결과 (미리보기)
[서버 저장 검증]       같은 표현식 ──EvalEx 평가──▶ 정식 결과 (기준)
```

**AST 생성은 표현식을 저장할 때 한 번만 한다.**
- 저장 API가 파싱 → 변수·함수 화이트리스트 검사(`AstExporter.assertDomainRule`) → AST JSON 생성을 한 트랜잭션에서 수행한다.
- 파싱 실패, 화이트리스트 위반, 결과 타입 불일치(검증식인데 boolean이 아님)는 **저장 거부** 사유다. 잘못된 표현식이 DB에 들어가지 않는다.
- 표현식 텍스트가 바뀔 때만 AST JSON을 다시 만든다. 조회·배포·화면 평가에서는 다시 파싱하지 않는다. 서버 검증은 저장된 텍스트로 `Expression`을 만들어 평가하되, 컴파일 결과를 캐시해 평가마다 다시 만들지 않는다(06 엔진 모듈의 컴파일 캐시, 2026-09-09).
- 텍스트와 AST가 어긋나는 일이 없도록 두 컬럼은 항상 같은 UPDATE로 갱신하고, 텍스트만 바꾸는 경로를 두지 않는다.

### 8.2 서버 측 API (EvalEx 3.x, 확인됨)

| 메서드 | 용도 |
| --- | --- |
| `Expression.getAbstractSyntaxTree()` | 루트 `ASTNode` |
| `ASTNode.getToken()` / `getParameters()` | 토큰(타입·값)과 자식 노드 |
| `Expression.getAllASTNodes()` | 전체 노드 순회 → 함수 화이트리스트 검사 |
| `Expression.getUsedVariables()` | 참조 변수 → 컬럼 사전 존재 검사 |
| `Expression.evaluateSubtree(node)` | 부분 트리 평가 (지연 평가 함수 구현 시) |

### 8.3 AST JSON 형식

```json
{ "type": "INFIX_OPERATOR", "value": "&&", "params": [
    { "type": "INFIX_OPERATOR", "value": ">=", "params": [
        { "type": "VARIABLE_OR_CONSTANT", "value": "value" },
        { "type": "NUMBER_LITERAL", "value": "0.1" } ] },
    { "type": "INFIX_OPERATOR", "value": "<=", "params": [
        { "type": "VARIABLE_OR_CONSTANT", "value": "value" },
        { "type": "NUMBER_LITERAL", "value": "3.5" } ] } ] }
```

| type | value | params | 해석 |
| --- | --- | --- | --- |
| `NUMBER_LITERAL` | 원문(`"0.1"`, `"1e-3"`, `"0xFF"`) | 없음 | `new Decimal(value)` (16진수는 변환) |
| `STRING_LITERAL` | 문자열 | 없음 | 그대로 |
| `VARIABLE_OR_CONSTANT` | 이름 | 없음 | 상수(TRUE/FALSE/NULL/PI/E) 우선, 없으면 변수(대소문자 무시) |
| `PREFIX_OPERATOR` | `-` `+` `!` | 1 | 단항 |
| `INFIX_OPERATOR` | 산술·비교·논리 기호 | 2 | 이항. `&&` `\|\|`는 단락 평가 |
| `POSTFIX_OPERATOR` | (표준에는 없음) | 1 | 미지원 → 서버 폴백 |
| `FUNCTION` | 함수명 | n | 화이트리스트 함수만. `IF`, `SWITCH`는 인자 지연 평가 |
| `ARRAY_INDEX` | `[` | 2 | `params[0][params[1]]` |
| `STRUCTURE_SEPARATOR` | `.` | 2 | `params[0]` 객체의 `params[1].value` 필드 |

### 8.4 화면 인터프리터가 맞춰야 할 EvalEx 의미

| 항목 | EvalEx 규칙 | JS 구현 |
| --- | --- | --- |
| 숫자 | 모두 `BigDecimal`, precision 68, HALF_EVEN | `Decimal.clone({precision:68, rounding:ROUND_HALF_EVEN})`. **native double 금지** |
| `+` | 한쪽이 문자열이면 연결, 아니면 덧셈 | 동일 |
| `=`/`==` | 숫자끼리 `compareTo == 0`(`1.0 == 1` 참), 그 외 값 비교. 양쪽 타입이 다르면 값을 보지 않고 거짓(`3 == "3"` 거짓, 소스 기준). 한쪽만 NULL이면 타입 불일치로 거짓, 둘 다 NULL이면 참 | `Decimal.eq`. 한쪽이 Decimal이면 다른 쪽을 승격해 `3 == "3"`이 참. 타입을 섞지 않는 것이 계약이다(06 엔진 계약. 도메인 검증도 같다, 02 실행 순서 3단계, 2026-09-09) |
| `!=`/`<>` | `==`의 부정. 한쪽만 NULL이면 참. 06 op-code 절이 `V != NULL &&` 가드를 붙이는 이유다 | 동일 |
| 비교 `< <= > >=` | 숫자·문자열·불린 | `Decimal.cmp`, 문자열은 사전순 |
| 불린 변환 | 숫자 0 → false, 문자열 `"true"`(대소문자 무관) → true | 동일 |
| `&&` `\|\|` | 단락 평가 | 오른쪽 노드를 조건부로만 평가 |
| `-2^2` | 단항(60) > 거듭제곱(40) → 4 | AST가 이미 `(-2)^2` 구조라 별도 처리 불필요 |
| 변수 | 대소문자 무시. 조회는 상수 사전이 먼저이나, 값을 `with()`로 넣을 때 기본 설정(`allowOverwriteConstants` true)에서는 같은 이름의 상수를 지우고 변수가 남는다. 엔진은 이 설정을 false로 고정한다 | 키를 대문자로 정규화, 상수가 변수보다 우선 |
| 미정의 변수 | 예외 (lenient면 NULL) | 동일 옵션 제공 |
| `ROUND(v, n)` | MathContext의 RoundingMode(기본 HALF_EVEN) | `toDecimalPlaces(n, ROUND_HALF_EVEN)` |
| `INSTR(s, sub)` | 커스텀(`AbstractFunction`). 대소문자 구분, 1부터 센 위치, 없으면 0, 인자가 NULL이면 NULL. 06 CONTAINS·INSTR op가 쓴다(2026-09-08) | 인자 중 하나라도 null·undefined면 그 자리에서 NULL을 돌린다. 아니면 `s.indexOf(sub) + 1`. 표준 `STR_CONTAINS`는 대소문자를 무시하므로 대신 쓰지 않는다 |
| `STR_MATCHES` | Java 정규식, 전체 일치. **3.7.0부터 ReDoS 방지용 타임아웃 내장**(CWE-1333) | `^(?:…)$`로 감싼 JS RegExp. JS에는 타임아웃이 없으므로 저장 시 중첩 수량자 검사로 대신한다(7절. 길이는 기준으로 쓰지 않는다). `(?i)`·소유 한정자 `a++`·원자 그룹 `(?>…)` 같은 Java 전용 문법은 저장 시 거부한다(06 「저장 시 검사」 Expression). `isSupported()`가 패턴 문자열을 보지 않아 폴백으로는 못 막는다 |

### 8.5 운영 규칙

0. **화면에 배포되는 것은 도메인의 표준 검증식 AST뿐이다.** 비즈니스 검증식(비즈니스 커스텀 함수 사용, 서버 전용 칸)은 배포하지 않으며, 화면은 해당 항목을 "서버 확인"으로 표시하고 디바운스 서버 평가로 보완한다. 칸별 화이트리스트를 저장 시 검사하므로 화면 AST에 서버 전용 함수가 나타나지 않는다(02-term-domain-column.md 도메인 설계 절).

1. **화이트리스트**: 도메인 검증·룰 미리보기용 함수만 화면에 구현한다(`IF SWITCH COALESCE NOT ABS CEILING FLOOR SQRT ROUND MIN MAX SUM AVERAGE STR_*` + 커스텀 `INSTR`). 화이트리스트 밖 노드가 있으면 `isSupported()`가 false → 화면은 평가를 건너뛰고 서버 API 결과를 쓴다. `RANDOM`, `DT_NOW`처럼 비결정적 함수는 서버·화면 모두 검증식에서 금지한다.
   - **MDM 조회 함수** `MASTER("<ID>", "<카테고리>", key)`와 시각을 넷째 인자로 받는 `MASTER_AT("<ID>", "<카테고리>", key, base_dt)`(마지막에 `attr`을 더하면 추가 컬럼 값을 주는 `MASTER(id, cate, key, attr)`·`MASTER_AT(id, cate, key, base_dt, attr)`. `attr`은 `"attr01"`-`"attr10"` 문자열 리터럴이고 마루 코드·마루 데이터 모두 쓸 수 있다. 2026-09-09)는 예외적으로 허용한다. ID는 마루 코드 ID 또는 마루 데이터 ID를 문자열 리터럴로 그대로 적고, 함수가 ID로 가른다. 카테고리도 리터럴이며 전체는 "BASE"다(2026-09-08 통합. 구 `CODE_EXISTS`·`MASTER_EXISTS`·`MASTER_ATTR`. 시각 인자는 2026-09-09에 `MASTER_AT`로 나눴다). 시그니처는 05-master-data.md 조회 함수 절이, 마루 코드 대상의 판정 규칙은 02-term-domain-column.md 제약 관리 절이 정한다. `MASTER`와 `MASTER_AT`는 `AbstractFunction` 둘이고 조회 코드는 하나다. 마지막 파라미터 `attr`에 `@FunctionParameter(isVarArg = true)`를 붙인다. 파서는 가변 인자 함수의 최소 인자 수(`MASTER` 셋, `MASTER_AT` 넷)만 검사하므로 그보다 둘 이상 많으면 저장 시 검사가 AST로 거르고, 평가에서 만나면 `EvaluationException`이다. 반환은 `EvaluationValue`라 `attr`이 없으면 불리언, 있으면 추가 컬럼 값을 저장된 문자열 그대로 돌려준다. `MASTER`는 엔진이 평가마다 한 번 정해 `withValues`로 레코드와 함께 넣은 예약 변수 `EVAL_TS`(평가 시각)를 `evaluate(Expression expression, …)`의 `expression` 데이터 접근자에서 읽고, `MASTER_AT`는 넷째 인자를 쓴다. 함수가 시계를 직접 읽지 않는다(06 「엔진 골격」 엔진 계약). 서버는 배포된 로컬 사본을 읽고, 화면은 `evaluate(ast, vars, { functions: { MASTER: { fn: ... }, MASTER_AT: { fn: ... } } })`로 같은 이름의 함수를 주입한다. 화면의 두 함수는 콤보용으로 이미 받아 둔 마루 코드의 카테고리 해석 결과(`Set`)가 있는 대상만 판정하고, 마루 데이터처럼 받아 두지 않은 대상은 `isSupported()`를 false로 돌려 서버 API 미리보기로 폴백한다. DB FK는 걸지 않는다(02-term-domain-column.md 제약 관리 절).
2. **정합성 테스트**: 표현식·입력·기대값 코퍼스를 서버 EvalEx와 화면 인터프리터에 같이 돌린다. 다르면 서버가 기준이고 인터프리터를 고친다.
3. **정식 판정은 서버**: 화면 결과는 즉시 피드백용이다. 저장 API가 같은 규칙을 EvalEx로 다시 평가한다.
4. **AST 버전**: AST JSON은 표현식 저장 시 1회 생성해 텍스트와 같은 행에 두고, 도메인·룰 버전과 함께 배포한다. 텍스트가 바뀔 때만 다시 만든다. 조회·배포·화면 평가에서는 텍스트를 재파싱하지 않는다. 서버는 평가할 때 저장된 텍스트로 `Expression`을 만들되, 컴파일 결과를 캐시해 평가마다 다시 만들지 않는다(2026-09-09).

### 8.6 샘플 코드 위치

| 파일 | 내용 |
| --- | --- |
| `js/evalex-ast-interpreter.js` | 인터프리터 (UMD, 브라우저·Node 공용). `evaluate / validate / compile / prepare / usedVariables / isSupported`(`decimal`, `EvalError` 등 유틸 export는 생략) |
| `js/AstExporter.java` | 서버 측 `ASTNode → Map(JSON)` 변환, 저장 시 변수·함수 화이트리스트 검사 |
| `js/evalex-ast-interpreter.test.js` | 의미 규칙 테스트 (범위, `%` 단위, 교차 컬럼, IF 지연 평가, ROUND, `-2^2`, 문자열 연결, 정규식, 배열·구조체, 상수, 단락 평가, 오류) |
| `js/evalex-ast-interpreter.bench.js` | 성능 측정 (기본 / 변수 사전 정규화 / 클로저 컴파일 / 네이티브 참고치) |

브라우저에서는 `<script src="decimal.min.js">` 뒤에 인터프리터를 로드하면 `window.EvalExAst`로 쓸 수 있다.

### 8.7 성능 측정과 최적화

측정 환경: Node v26 (V8), Apple Silicon, `js/evalex-ast-interpreter.bench.js`, 20만 회 반복, JIT 워밍업 후.

**측정 대상 검증식**

| 식 | 내용 |
| --- | --- |
| R1 | `value >= 0.1 && value <= 3.5` (비교 2회) |
| R2 | R1 `&& value % 0.1 == 0 && value >= COIL_THK` (비교 4회 + `%`) |
| R3 | `IF(GRADE == "A", value <= 2.0, value <= 3.5) && STR_MATCHES(LOT, "^[A-Z0-9]{10,20}$")` |

**결과 (µs/eval, 낮을수록 좋음)**

| 실행 방식 | R1 | R2 | R3 |
| --- | --- | --- | --- |
| 초기 구현: 호출마다 트리 순회 + 변수 정규화 | 2.77 | 5.52 | 2.20 |
| **현재 구현** `evaluate(ast, vars)` — 클로저 컴파일 캐시 내장 | 0.74 | 2.66 | 1.01 |
| 현재 구현 + `prepare(vars)` 재사용 | 0.34 | 2.51 | 0.37 |
| `compile(ast)` 함수 재사용 + `prepare` 재사용 | 0.24 | 2.51 | 0.37 |
| (참고) 네이티브 double, 정밀도 포기 | - | 0.02 | - |

단위 연산 비용: `new Decimal("2.3")` 0.35µs, `Decimal.cmp` 0.10µs, `Decimal.mod` 0.71µs.

**해석**
- 화면 용도로는 충분히 빠르다. 필드 하나 검증에 1µs 안팎이므로 입력 이벤트마다 실행해도 체감 비용이 없고, 1만 행 그리드를 한 번에 검증해도 R2 기준 30ms 수준이다.
- 비용의 주범은 트리 순회가 아니라 **Decimal 연산**이다. R2가 R1보다 3배 이상 느린 이유는 `%`(0.71µs) 한 번이 비교 네 번보다 비싸기 때문이다.
- 두 번째 비용은 **변수 정규화**(문자열 → Decimal 변환, 값당 0.35µs). 반복 평가에서는 `prepare()`로 한 번만 하면 2-3배 빨라진다.

**적용된 최적화 (현재 구현)**
1. AST → 클로저 체인 컴파일, 같은 AST 객체는 WeakMap 캐시. 트리 순회·switch 분기·`params` 배열 생성이 호출마다 반복되지 않는다.
2. 숫자 리터럴 Decimal, 정규식 리터럴 RegExp는 컴파일 시 1회 생성.
3. `&&` `||` 단락 평가와 `IF` 지연 평가로 불필요한 하위 식 평가 생략.
4. 변수 조회는 대문자 키 직접 접근(사전 정규화된 scope).

**추가로 가능한 최적화 (필요해질 때)**
| 방안 | 효과 | 비고 |
| --- | --- | --- |
| 단위 검사 `value % 0.1 == 0`을 사용자 함수 `STEP(value, 0.1)`로 | R2의 0.7µs → 0.1µs 미만. 내부를 `Decimal.decimalPlaces()` 비교로 구현 | 서버 EvalEx(`AbstractFunction`)와 화면 인터프리터 화이트리스트에 같은 함수를 추가. 검증식은 EvalEx 하나로 유지 |
| 그리드 검증 시 `compile()` 1회 + `prepare()` 행당 1회 | 2-3배 | 행 단위로 `prepare`한 scope를 여러 도메인 규칙에 재사용 |
| 상수 접힘(constant folding) | 리터럴끼리의 연산(`0.1 * 10`)을 컴파일 시 계산 | 검증식에는 드물어 효과 제한적 |
| 비교 전용 fast path: 양쪽이 Decimal이고 소수 자리가 작으면 `toNumber()` 비교 | 0.10 → 0.02µs | 정밀도 안전 조건(유효 자릿수 ≤ 15) 검사가 필요. 정합성 리스크 대비 이득이 작아 **보류** |
| Web Worker로 대량 검증 이관 | UI 스레드 차단 방지 | 10만 행 이상 일괄 검증 시 |
| decimal.js → big.js/decimal.js-light | 번들 크기 ↓, 속도 소폭 ↑ | `%`·`pow` 지원 여부 확인 필요. 현재는 불필요 |

**하지 않을 것**: 네이티브 double로 전환. R2 기준 현재 구현 대비 약 130배, 초기 구현 대비 약 280배 빠르지만 `0.1 + 0.2 ≠ 0.3` 문제로 두께·중량 판정이 서버 BigDecimal 결과와 어긋난다. 회의 #144의 "결과값 상호 검증" 원칙에 반한다.

## 출처
- 문서: https://ezylang.github.io/EvalEx/ (references/operators, functions, constants, concepts/datatypes, configuration)
- 소스: `operators/OperatorIfc.java`(우선순위), `parser/Tokenizer.java`(토큰 규칙), `config/ExpressionConfiguration.java`(표준 사전)
