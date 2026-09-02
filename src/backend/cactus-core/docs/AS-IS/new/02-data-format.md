# 02. 데이터 포맷 명세

> **APS Core Migration 반영**: 패키지 `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`. 데이터 포맷 자체는 변동 없음.

## 1. 프로토콜 규칙

| 항목 | 규칙 |
|------|------|
| Content-Type | `application/json; charset=UTF-8` |
| 인코딩 | UTF-8 |
| 날짜 포맷 | ISO 8601 (`2026-03-30T14:30:00`) |
| NULL 처리 | 응답: null 필드 생략 (`@JsonInclude(NON_NULL)`), 요청: 필드 누락 = null |
| 네이밍 | camelCase |
| 그리드 키 | `ds_` 접두어 (예: `ds_master`, `ds_detail`) |

## 2. CactusRequest (요청)

### 2.1 구조

```json
{
  "meta": {
    "txId": "550e8400-e29b-41d4-a716-446655440000",
    "action": "search",
    "userId": "admin",
    "plantCode": "P01",
    "locale": "ko",
    "timestamp": "2026-03-30T14:30:00"
  },
  "params": {
    "fromDate": "2026-03-01",
    "toDate": "2026-03-30",
    "status": "ACTIVE"
  },
  "grids": {
    "ds_master": {
      "columnMeta": [
        { "id": "orderId", "type": "string" },
        { "id": "qty", "type": "number" }
      ],
      "rows": [
        { "rowStatus": "C", "orderId": "ORD-001", "qty": 100 },
        { "rowStatus": "U", "orderId": "ORD-002", "qty": 200 }
      ]
    }
  }
}
```

### 2.2 필드 명세

**meta (RequestMeta)**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| txId | String | N | 트랜잭션 ID (없으면 서버에서 자동 생성) |
| action | String | Y | 액션 타입: search, save, delete, detail, 커스텀 |
| userId | String | N | 요청 사용자 ID (JWT에서 추출 가능) |
| plantCode | String | N | 공장 코드 |
| locale | String | N | 언어 코드 (기본: ko) |
| timestamp | String | N | 요청 시각 |

**params (Map&lt;String, Object&gt;)**

단순 키-값 파라미터. 조회 조건, 단건 상세 요청 등에 사용.

**grids (Map&lt;String, GridData&gt;)**

그리드 데이터. 저장/삭제 등 다건 처리 시 사용.

**GridData**

| 필드 | 타입 | 설명 |
|------|------|------|
| columnMeta | List&lt;ColumnMeta&gt; | 컬럼 메타 정보 (선택) |
| rows | List&lt;Map&lt;String, Object&gt;&gt; | 행 데이터 목록 |

**rowStatus (행 상태)**

| 값 | 의미 | 설명 |
|----|------|------|
| C | Create | 신규 행 |
| U | Update | 수정된 행 |
| D | Delete | 삭제 대상 행 |
| R | Read | 변경 없는 행 (전송 시 생략 가능) |

## 3. CactusResponse (응답)

### 3.1 구조

```json
{
  "meta": {
    "txId": "550e8400-e29b-41d4-a716-446655440000",
    "resultCode": "SUCCESS",
    "message": "조회 완료",
    "totalCount": 150,
    "timestamp": "2026-03-30T14:30:01"
  },
  "grids": {
    "ds_master": {
      "columnMeta": [
        { "id": "orderId", "type": "string", "label": "주문번호", "width": 120 },
        { "id": "qty", "type": "number", "label": "수량", "width": 80 }
      ],
      "rows": [
        { "orderId": "ORD-001", "qty": 100, "status": "ACTIVE" }
      ],
      "pagination": {
        "page": 1,
        "size": 20,
        "totalCount": 150,
        "totalPages": 8
      }
    }
  },
  "errors": []
}
```

### 3.2 필드 명세

**meta (ResponseMeta)**

| 필드 | 타입 | 설명 |
|------|------|------|
| txId | String | 트랜잭션 ID |
| resultCode | String | SUCCESS / FAIL / ERROR |
| message | String | 결과 메시지 |
| totalCount | Integer | 전체 건수 (조회 시) |
| timestamp | String | 응답 시각 |

**grids (Map&lt;String, GridResult&gt;)**

| 필드 | 타입 | 설명 |
|------|------|------|
| columnMeta | List&lt;ColumnMeta&gt; | 컬럼 메타 정보 |
| rows | List&lt;Map&lt;String, Object&gt;&gt; | 결과 행 |
| pagination | Object | 페이징 정보 (선택) |

**ColumnMeta** (그리드 개인화 전용)

> 데이터 타입, 편집 가능 여부, 포맷, 선택 목록 등은 프론트엔드 화면 정의(정적 설정)에서 관리한다.

| 필드 | 타입 | 설명 |
|------|------|------|
| name | String | 필드명 (rows의 key와 일치) |
| width | Integer | 컬럼 너비 (px) |
| hidden | Boolean | 숨김 여부 |
| align | String | 정렬 (left, center, right) |
| order | Integer | 컬럼 표시 순서 (0-based) |

**errors (List&lt;ErrorDetail&gt;)**

| 필드 | 타입 | 설명 |
|------|------|------|
| field | String | 에러 발생 필드 |
| code | String | 에러 코드 |
| message | String | 에러 메시지 |

### 3.3 Builder 사용법

```java
CactusResponse.builder()
    .txId(request.getMeta().getTxId())
    .success("조회 완료")
    .grid("ds_master", gridResult)
    .build();
```

## 4. 액션별 요청/응답 포맷

### 4.1 search (목록 조회)

```
요청: meta.action="search" + params (조회조건)
응답: grids.ds_master.rows (결과목록) + pagination
```

### 4.2 detail (단건 조회)

```
요청: meta.action="detail" + params (PK)
응답: grids.ds_master.rows (1건)
```

### 4.3 save (저장)

```
요청: meta.action="save" + grids.ds_master.rows (rowStatus: C/U/D)
응답: meta.resultCode="SUCCESS" + meta.message
```

서버는 rowStatus별로 분류하여 INSERT/UPDATE/DELETE를 수행한다.

### 4.4 delete (삭제)

```
요청: meta.action="delete" + grids.ds_master.rows (삭제 대상)
응답: meta.resultCode="SUCCESS" + meta.message
```

### 4.5 custom (커스텀 액션)

업무 특화 액션. action에 자유 문자열 사용.

```
요청: meta.action="approve" + params/grids
응답: 업무에 따라 자유 구성
```

## 5. HTTP 상태 코드 매핑

| HTTP | resultCode | 용도 |
|------|-----------|------|
| 200 | SUCCESS | 정상 처리 |
| 200 | FAIL | 비즈니스 실패 (validation 등) |
| 400 | ERROR | 잘못된 요청 |
| 401 | ERROR | 인증 실패 |
| 403 | ERROR | 권한 없음 |
| 500 | ERROR | 서버 내부 오류 |

> **설계 결정**: 비즈니스 실패(FAIL)는 HTTP 200으로 응답한다.
> 프론트엔드에서 HTTP 상태와 무관하게 `resultCode`로 분기하는 것이 OASIS 관례.

## 6. AS-IS / TO-BE 비교

### 조회 (Search)

**AS-IS (Nexacro XML)**
```xml
<Parameters>
  <Parameter id="fromDate">2026-03-01</Parameter>
  <Parameter id="toDate">2026-03-30</Parameter>
</Parameters>
```

**TO-BE (Cactus JSON)**
```json
{
  "meta": { "action": "search" },
  "params": { "fromDate": "2026-03-01", "toDate": "2026-03-30" }
}
```

### 저장 (Save)

**AS-IS**: 각 Dataset을 XML로 직렬화, rowType 속성으로 CUD 구분

**TO-BE**: `grids` 맵에 GridData를 담고, 각 행의 `rowStatus` 필드로 CUD 구분

### 핵심 차이

| 항목 | AS-IS | TO-BE |
|------|-------|-------|
| 포맷 | XML | JSON |
| 프레임워크 | Nexacro | React |
| 데이터셋 | Dataset (XML) | GridData (JSON Map) |
| 행 상태 | rowType 속성 | rowStatus 필드 (C/U/D/R) |
| 파라미터 | Parameters XML | params JSON Object |
| 컬럼 메타 | ColumnInfo XML | ColumnMeta JSON |
