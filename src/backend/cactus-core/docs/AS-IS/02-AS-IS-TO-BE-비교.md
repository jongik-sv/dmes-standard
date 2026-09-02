# AS-IS → TO-BE 데이터 포맷 비교

> 옛 CACTUS (Nexacro XML/SSV) → OASIS (React JSON) 전환
> 시나리오: 생산실적 화면에서 조회 후 마스터/디테일 그리드를 수정하여 저장
>
> **마이그레이션 완료 (2026-04-26)**: TO-BE(JSON) 포맷이 cactus-core 의 표준 `CactusRequest` / `CactusResponse` 로 정착했다. AS-IS 비교는 의사결정 맥락 보존 목적이며, 본 문서의 신규 작성은 종료된다.
> - URL 컨벤션: OASIS 매핑은 `/oasis/{serviceId}/{action}` 으로 단일화. UI→BFF 는 `/api/{module}/oasis/{serviceId}/{action}`, BFF→BE 는 그대로 전달. 본 문서의 `POST /api/prod/SVC_PROD_RESULT/{action}` 표기는 시나리오 설명을 위한 옛 표기이며, 현행은 `/oasis/SVC_PROD_RESULT/{action}` 이다.
> - 데이터 포맷 명세 최신본은 [`01-데이터포맷-명세.md`](./01-데이터포맷-명세.md) / [`new/02-data-format.md`](./new/02-data-format.md) 참조.

---

## 1. 조회 (Search)

### AS-IS Request (CACTUS / Nexacro XML)

```
POST /nxuiService/prod/SVC_PROD_RESULT/search
Content-Type: text/xml

<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.nexacroplatform.com/platform/dataset">
  <Parameters>
    <Parameter id="plantCd" type="string">P01</Parameter>
    <Parameter id="fromDate" type="string">20260301</Parameter>
    <Parameter id="toDate" type="string">20260320</Parameter>
    <Parameter id="prodType" type="string">A</Parameter>
  </Parameters>
  <Dataset id="ds_cond">
    <ColumnInfo>
      <Column id="plantCd" type="string" size="10"/>
      <Column id="fromDate" type="string" size="8"/>
      <Column id="toDate" type="string" size="8"/>
      <Column id="prodType" type="string" size="2"/>
    </ColumnInfo>
    <Rows>
      <Row>
        <Col id="plantCd">P01</Col>
        <Col id="fromDate">20260301</Col>
        <Col id="toDate">20260320</Col>
        <Col id="prodType">A</Col>
      </Row>
    </Rows>
  </Dataset>
</Root>
```

### AS-IS Response (CACTUS / Nexacro XML)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.nexacroplatform.com/platform/dataset">
  <Parameters>
    <Parameter id="ErrorCode" type="int">0</Parameter>
    <Parameter id="ErrorMsg" type="string">{"ds_master": "3", "ds_detail": "5"}</Parameter>
  </Parameters>
  <Dataset id="ds_master">
    <ColumnInfo>
      <Column id="orderId" type="string" size="20"/>
      <Column id="itemCd" type="string" size="20"/>
      <Column id="itemNm" type="string" size="100"/>
      <Column id="qty" type="bigdecimal" size="15"/>
      <Column id="prodDate" type="string" size="8"/>
      <Column id="status" type="string" size="2"/>
    </ColumnInfo>
    <Rows>
      <Row>
        <Col id="orderId">ORD-001</Col>
        <Col id="itemCd">ITEM-001</Col>
        <Col id="itemNm">철강코일 A타입</Col>
        <Col id="qty">100</Col>
        <Col id="prodDate">20260315</Col>
        <Col id="status">10</Col>
      </Row>
      <Row>
        <Col id="orderId">ORD-002</Col>
        <Col id="itemCd">ITEM-002</Col>
        <Col id="itemNm">철강코일 B타입</Col>
        <Col id="qty">200</Col>
        <Col id="prodDate">20260316</Col>
        <Col id="status">20</Col>
      </Row>
      <Row>
        <Col id="orderId">ORD-003</Col>
        <Col id="itemCd">ITEM-003</Col>
        <Col id="itemNm">철강코일 C타입</Col>
        <Col id="qty">150</Col>
        <Col id="prodDate">20260317</Col>
        <Col id="status">10</Col>
      </Row>
    </Rows>
  </Dataset>
  <Dataset id="ds_detail">
    <ColumnInfo>
      <Column id="orderId" type="string" size="20"/>
      <Column id="detailId" type="string" size="20"/>
      <Column id="seq" type="int" size="5"/>
      <Column id="procCd" type="string" size="10"/>
      <Column id="procNm" type="string" size="100"/>
      <Column id="resultQty" type="bigdecimal" size="15"/>
      <Column id="defectQty" type="bigdecimal" size="15"/>
    </ColumnInfo>
    <Rows>
      <Row>
        <Col id="orderId">ORD-001</Col>
        <Col id="detailId">DET-001</Col>
        <Col id="seq">1</Col>
        <Col id="procCd">PROC-01</Col>
        <Col id="procNm">압연</Col>
        <Col id="resultQty">100</Col>
        <Col id="defectQty">2</Col>
      </Row>
      <!-- ... 이하 생략 -->
    </Rows>
  </Dataset>
</Root>
```

### TO-BE Request (OASIS / JSON)

```http
POST /api/prod/SVC_PROD_RESULT/search
Content-Type: application/json

{
  "meta": {
    "userId": "user01",
    "menuId": "PROD001"
  },
  "params": {
    "plantCd": "P01",
    "fromDate": "2026-03-01",
    "toDate": "2026-03-20",
    "prodType": "A"
  }
}
```

### TO-BE Response (OASIS / JSON)

```json
{
  "meta": {
    "txId": "user01-PROD001-20260320100000-x1a",
    "success": true,
    "code": "0000",
    "message": ""
  },
  "data": {
    "totalCount": 3
  },
  "grids": {
    "master": {
      "rows": [
        { "orderId": "ORD-001", "itemCd": "ITEM-001", "itemNm": "철강코일 A타입", "qty": 100, "prodDate": "2026-03-15", "status": "10" },
        { "orderId": "ORD-002", "itemCd": "ITEM-002", "itemNm": "철강코일 B타입", "qty": 200, "prodDate": "2026-03-16", "status": "20" },
        { "orderId": "ORD-003", "itemCd": "ITEM-003", "itemNm": "철강코일 C타입", "qty": 150, "prodDate": "2026-03-17", "status": "10" }
      ]
    },
    "detail": {
      "rows": [
        { "orderId": "ORD-001", "detailId": "DET-001", "seq": 1, "procCd": "PROC-01", "procNm": "압연", "resultQty": 100, "defectQty": 2 },
        { "orderId": "ORD-001", "detailId": "DET-002", "seq": 2, "procCd": "PROC-02", "procNm": "도금", "resultQty": 98,  "defectQty": 1 },
        { "orderId": "ORD-001", "detailId": "DET-003", "seq": 3, "procCd": "PROC-03", "procNm": "절단", "resultQty": 97,  "defectQty": 0 }
      ]
    }
  }
}
```

---

## 2. 저장 (Save)

### AS-IS Request (CACTUS / Nexacro XML)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.nexacroplatform.com/platform/dataset">
  <Parameters>
    <Parameter id="plantCd" type="string">P01</Parameter>
  </Parameters>
  <Dataset id="ds_master">
    <ColumnInfo>
      <Column id="orderId" type="string" size="20"/>
      <Column id="itemCd" type="string" size="20"/>
      <Column id="itemNm" type="string" size="100"/>
      <Column id="qty" type="bigdecimal" size="15"/>
      <Column id="prodDate" type="string" size="8"/>
      <Column id="status" type="string" size="2"/>
    </ColumnInfo>
    <Rows>
      <Row type="insert">
        <Col id="orderId"/>
        <Col id="itemCd">ITEM-004</Col>
        <Col id="itemNm">철강코일 D타입</Col>
        <Col id="qty">300</Col>
        <Col id="prodDate">20260320</Col>
        <Col id="status">10</Col>
      </Row>
      <Row type="update">
        <Col id="orderId">ORD-001</Col>
        <Col id="itemCd">ITEM-001</Col>
        <Col id="itemNm">철강코일 A타입</Col>
        <Col id="qty">120</Col>
        <Col id="prodDate">20260315</Col>
        <Col id="status">20</Col>
      </Row>
    </Rows>
  </Dataset>
  <Dataset id="ds_detail">
    <ColumnInfo>
      <Column id="orderId" type="string" size="20"/>
      <Column id="detailId" type="string" size="20"/>
      <Column id="seq" type="int" size="5"/>
      <Column id="procCd" type="string" size="10"/>
      <Column id="procNm" type="string" size="100"/>
      <Column id="resultQty" type="bigdecimal" size="15"/>
      <Column id="defectQty" type="bigdecimal" size="15"/>
    </ColumnInfo>
    <Rows>
      <Row type="update">
        <Col id="orderId">ORD-001</Col>
        <Col id="detailId">DET-001</Col>
        <Col id="seq">1</Col>
        <Col id="procCd">PROC-01</Col>
        <Col id="procNm">압연</Col>
        <Col id="resultQty">120</Col>
        <Col id="defectQty">3</Col>
      </Row>
      <Row type="delete">
        <Col id="orderId">ORD-001</Col>
        <Col id="detailId">DET-003</Col>
        <Col id="seq">3</Col>
        <Col id="procCd">PROC-03</Col>
        <Col id="procNm">절단</Col>
        <Col id="resultQty">97</Col>
        <Col id="defectQty">0</Col>
      </Row>
    </Rows>
  </Dataset>
</Root>
```

### AS-IS Response (CACTUS / Nexacro XML)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.nexacroplatform.com/platform/dataset">
  <Parameters>
    <Parameter id="ErrorCode" type="int">0</Parameter>
    <Parameter id="ErrorMsg" type="string">정상 처리되었습니다.</Parameter>
  </Parameters>
</Root>
```

### AS-IS Error Response (CACTUS / Nexacro XML)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://www.nexacroplatform.com/platform/dataset">
  <Parameters>
    <Parameter id="ErrorCode" type="int">-9</Parameter>
    <Parameter id="ErrorMsg" type="string">품목코드가 존재하지 않습니다.</Parameter>
  </Parameters>
</Root>
```

### TO-BE Request (OASIS / JSON)

```http
POST /api/prod/SVC_PROD_RESULT/save
Content-Type: application/json

{
  "meta": {
    "userId": "user01",
    "menuId": "PROD001"
  },
  "params": {
    "plantCd": "P01"
  },
  "grids": {
    "master": {
      "rows": [
        {
          "rowKey": "tmp-a1b2",
          "rowStatus": "C",
          "orderId": "",
          "itemCd": "ITEM-004",
          "itemNm": "철강코일 D타입",
          "qty": 300,
          "prodDate": "2026-03-20",
          "status": "10"
        },
        {
          "rowKey": "tmp-c3d4",
          "rowStatus": "U",
          "orderId": "ORD-001",
          "itemCd": "ITEM-001",
          "itemNm": "철강코일 A타입",
          "qty": 120,
          "prodDate": "2026-03-15",
          "status": "20"
        }
      ]
    },
    "detail": {
      "rows": [
        {
          "rowKey": "tmp-d1e2",
          "rowStatus": "U",
          "orderId": "ORD-001",
          "detailId": "DET-001",
          "seq": 1,
          "procCd": "PROC-01",
          "procNm": "압연",
          "resultQty": 120,
          "defectQty": 3
        },
        {
          "rowKey": "tmp-f3g4",
          "rowStatus": "D",
          "orderId": "ORD-001",
          "detailId": "DET-003",
          "seq": 3,
          "procCd": "PROC-03",
          "procNm": "절단",
          "resultQty": 97,
          "defectQty": 0
        }
      ]
    }
  }
}
```

### TO-BE Success Response (OASIS / JSON)

```json
{
  "meta": {
    "txId": "user01-PROD001-20260320103000-y2b",
    "success": true,
    "code": "0000",
    "message": "정상 처리되었습니다."
  },
  "data": {
    "savedCount": 4
  }
}
```

### TO-BE Error Response (OASIS / JSON)

```json
{
  "meta": {
    "txId": "user01-PROD001-20260320103000-y2b",
    "success": false,
    "code": "E001",
    "message": "저장 중 오류가 발생했습니다."
  },
  "errors": [
    {
      "grid": "master",
      "rowKey": "tmp-a1b2",
      "rowIndex": 0,
      "field": "itemCd",
      "code": "E001",
      "message": "존재하지 않는 품목코드입니다."
    },
    {
      "grid": "detail",
      "rowKey": "tmp-d1e2",
      "rowIndex": 0,
      "field": "resultQty",
      "code": "E002",
      "message": "실적수량은 주문수량(100)을 초과할 수 없습니다."
    }
  ]
}
```

---

## 3. AS-IS vs TO-BE 비교 요약

| 항목 | AS-IS (CACTUS/Nexacro) | TO-BE (OASIS/React) |
|------|------------------------|---------------------|
| **프로토콜** | Nexacro XML / SSV | JSON (REST API) |
| **Content-Type** | text/xml | application/json |
| **파라미터** | `<Parameters>` + `ds_cond` DataSet | `params` 객체 (flat key-value) |
| **그리드 데이터** | `<Dataset id="ds_xxx">` | `grids.xxx.rows[]` |
| **컬럼 정의** | 클라이언트(Nexacro XML)에서 정의 | 프론트에서 정의 (서버 optional) |
| **행 상태** | `Row type="insert/update/delete"` → `!nativeeditor_status` | `rowStatus: "C"/"U"/"D"` |
| **결과 코드** | `ErrorCode: 0/-9` | `meta.success: true/false` + `meta.code` |
| **결과 메시지** | `ErrorMsg` (단일 문자열) | `meta.message` + `errors[]` (행/필드 단위) |
| **에러 상세** | 미지원 (메시지 1개만) | `errors[]`로 그리드/행/필드 단위 에러 다수 반환 |
| **날짜 형식** | `"20260315"` (yyyyMMdd) | `"2026-03-15"` (ISO 8601) |
| **데이터 타입** | XML Column type 속성 | JSON 네이티브 (string/number/boolean/null) |
| **트랜잭션 추적** | 없음 | `meta.txId` (Response only, 백엔드에서 `{userId}-{menuId}-{yyyyMMddHHmmss}-{random3}` 형식으로 생성) |
