# 07. 파일 처리

> **[Status: not yet implemented as of 2026-04-26]** The `FileController` / `FileService` / `ExcelController` classes described below do not yet exist in cactus-core (`com.dongkuk.dmes.cactus.*`). Treat this chapter as a design draft; the actual package layout and signatures will be defined when the file-handling module is built.

> **APS Core Migration 반영(요약)**
> - 패키지: `com.dongkuk.cactus.*` → `com.dongkuk.dmes.cactus.*`, group `com.dongkuk` → `com.dongkuk.dmes`.
> - 본 문서의 `/{service-group}/api/file/...` URL 은 BE 매핑 시점에서 매핑 prefix 가 매핑되는 형태에 따라 달라질 수 있으며, 현행 cactus-core 는 OASIS 매핑(`/oasis`) 외 비-OASIS 엔드포인트는 모듈/배포 환경에 따라 매핑된다. BFF 컨벤션상 UI→BFF 는 `/api/{module}/nooasis/{path}`, BFF→BE 는 `/api/{module}/nooasis/` segment 만 제거된 path 를 그대로 호출한다.
> - `cactus.oasis.service-group` 프로퍼티는 매핑 prefix 가 아니라 BPMN 라우팅/로깅 식별 용도로만 유지된다.

## 1. 개요

파일 처리는 OasisController의 단일 진입점(JSON)을 벗어나는 **특수 케이스**다.
multipart/form-data 또는 바이너리 스트림을 다루므로 별도 컨트롤러를 사용한다.

### 1.1 두 가지 파일 처리 유형

| 유형 | 목적 | 업로드 시 동작 | DB 저장 시점 |
|------|------|---------------|-------------|
| **엑셀** | 대량 데이터 입력 | 파싱 → 그리드 데이터로 변환 → 프론트에 반환 | 사용자가 확인/수정 후 **저장 버튼** 클릭 시 |
| **첨부파일** | 문서/이미지 등 첨부 | **즉시** 파일 저장소 + DB 메타 저장 | 업로드 시 즉시 |

```
엑셀 흐름:
  업로드 → Excel 파싱 → 그리드 표시 → (사용자 확인/수정) → 저장 버튼 → OASIS 서비스 → DB

첨부파일 흐름:
  업로드 → 즉시 파일 저장소 저장 + DB 메타 기록 → 결과 반환
```

엑셀은 **데이터 검증 기회를 주기 위해** 2단계로 분리한다.
MES 현장에서 엑셀 데이터를 검증 없이 DB에 넣으면 생산 데이터 오류로 이어질 수 있다.

---

## 2. Excel 업로드 (파일 → 그리드 변환)

### 2.1 요청

```
POST /{service-group}/api/file/excel/upload
Content-Type: multipart/form-data

Parts:
  - file: Excel 파일 (.xlsx)
  - meta: JSON 문자열 (업로드 메타 정보)
```

**meta 구조**:
```json
{
  "serviceId": "orderMgt",
  "sheetMapping": {
    "Sheet1": "ds_master"
  }
}
```

| 필드 | 설명 |
|------|------|
| serviceId | 이후 저장 시 호출할 OASIS 서비스 ID (프론트에서 참조) |
| sheetMapping | Excel Sheet명 → Grid ID 매핑 |

### 2.2 응답

CactusResponse 표준 형식으로 반환한다.

```json
{
  "meta": {
    "txId": "user01-ORD001-20260402-a3f",
    "success": true,
    "code": "0000",
    "message": "100건 파싱 완료"
  },
  "grids": {
    "ds_master": {
      "rows": [
        { "rowStatus": "C", "orderId": "ORD-001", "qty": 100 },
        { "rowStatus": "C", "orderId": "ORD-002", "qty": 200 }
      ]
    }
  }
}
```

> 이 시점에서 **DB 저장은 발생하지 않는다.**
> 프론트에서 그리드에 로드한 후 사용자가 확인/수정 → 저장 버튼 클릭 시 일반 OASIS 서비스로 DB 저장.

### 2.3 처리 흐름

```
[1단계: 엑셀 업로드 — 파일 → 그리드]

  클라이언트 → POST /{sg}/api/file/excel/upload (multipart)
    │
    ▼
  FileController
    │ ① Excel 파일 파싱 (Apache POI)
    │ ② sheetMapping에 따라 Sheet → GridData 변환
    │ ③ 각 행에 rowStatus = "C" 설정
    │ ④ CactusResponse(grids) 반환
    │
    ▼
  프론트: 그리드에 데이터 로드 → 사용자 확인/수정


[2단계: 저장 — 그리드 → DB (일반 OASIS 서비스)]

  클라이언트 → POST /{sg}/api/{serviceId}/save (CactusRequest)
    │
    ▼
  OasisController → OasisServiceExecutor → OASIS BPMN → DB INSERT
```

---

## 3. Excel 다운로드

### 3.1 요청

```
POST /{service-group}/api/file/excel/download
Content-Type: application/json

{
  "meta": { "userId": "user01", "menuId": "ORD001" },
  "params": { "fromDate": "2026-03-01", "toDate": "2026-03-30" },
  "download": {
    "serviceId": "orderMgt",
    "action": "search",
    "fileName": "주문목록",
    "sheetName": "주문",
    "columns": [
      { "name": "orderId", "label": "주문번호", "width": 120 },
      { "name": "qty", "label": "수량", "width": 80, "format": "#,##0" }
    ]
  }
}
```

| 필드 | 설명 |
|------|------|
| `meta` | CactusRequest 표준 meta (userId, menuId) |
| `params` | OASIS 서비스에 전달할 조회 조건 |
| `download.serviceId` | 데이터 조회용 OASIS 서비스 ID |
| `download.action` | OASIS 서비스 액션 (보통 "search") |
| `download.fileName` | 다운로드 파일명 (.xlsx 자동 추가) |
| `download.sheetName` | Excel Sheet명 |
| `download.columns` | 엑셀 컬럼 정의 (name, label, width, format) |

> `download.columns`의 `label`과 `format`은 **엑셀 전용 속성**이다.
> CactusResponse의 `ColumnMeta`(개인화 전용)와는 별개로, 엑셀 헤더명과 셀 포맷을 지정한다.

### 3.2 응답

```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="주문목록.xlsx"

[바이너리 Excel 데이터]
```

### 3.3 처리 흐름

```
  클라이언트 → POST /{sg}/api/file/excel/download
    │
    ▼
  FileController
    │ ① OasisServiceExecutor로 데이터 조회 (serviceId + action + params)
    │ ② 조회 결과(grids) → Excel 변환 (Apache POI)
    │ ③ download.columns로 헤더명/포맷 설정
    │ ④ 바이너리 스트림 응답
```

---

## 4. 첨부파일 업로드

첨부파일은 엑셀과 달리 **업로드 시 즉시 저장**된다.

### 4.1 요청

```
POST /{service-group}/api/file/attachment/upload
Content-Type: multipart/form-data

Parts:
  - files: 파일 목록 (다중)
  - meta: JSON 문자열
```

**meta 구조**:
```json
{
  "refType": "ORDER",
  "refId": "ORD-001",
  "category": "DOCUMENT"
}
```

| 필드 | 설명 |
|------|------|
| refType | 참조 대상 유형 (ORDER, PRODUCT, DEFECT 등) |
| refId | 참조 대상 ID |
| category | 파일 분류 (DOCUMENT, IMAGE, REPORT 등) |

### 4.2 응답

```json
{
  "meta": {
    "txId": "user01-ORD001-20260402-b7c",
    "success": true,
    "code": "0000",
    "message": "1건 업로드 완료"
  },
  "grids": {
    "ds_files": {
      "rows": [
        {
          "fileId": "FILE-001",
          "fileName": "계약서.pdf",
          "fileSize": 1024000,
          "contentType": "application/pdf",
          "uploadedAt": "2026-03-30T14:30:00"
        }
      ]
    }
  }
}
```

### 4.3 처리 흐름

```
  클라이언트 → POST /{sg}/api/file/attachment/upload (multipart)
    │
    ▼
  FileController
    │ ① 파일 검증 (크기, 타입, 확장자)
    │ ② 파일 저장소에 저장 (UUID 파일명으로 저장)
    │ ③ DB에 파일 메타 기록 (fileId, fileName, refType, refId 등)
    │ ④ CactusResponse(grids: ds_files) 반환
```

> 엑셀과 달리 **1단계에서 즉시 파일 저장소 + DB 저장이 완료**된다.

---

## 5. 첨부파일 다운로드

```
GET /{service-group}/api/file/attachment/download/{fileId}

응답:
Content-Type: application/pdf (파일 타입에 따라)
Content-Disposition: attachment; filename="계약서.pdf"
[바이너리 데이터]
```

---

## 6. 구현 위치

파일 처리는 **업무 모듈에서 컨트롤러를 구현**하되, cactus-core가 공통 유틸리티를 제공한다.

| 제공 레벨 | 클래스 | 설명 |
|-----------|--------|------|
| cactus-core (향후) | `ExcelConverter` | GridData ↔ Excel 변환 유틸 |
| cactus-core (향후) | `FileStorageService` | 파일 저장소 추상화 (로컬/NAS/S3) |
| 업무 모듈 | `FileController` | 파일 업로드/다운로드 컨트롤러 |

### 6.1 cactus-core 제공 범위

```
cactus-core/
├── file/
│   ├── ExcelConverter.java          # GridData ↔ Excel 변환
│   ├── ExcelColumnDef.java          # 엑셀 컬럼 정의 (name, label, width, format)
│   └── FileStorageService.java      # 파일 저장소 인터페이스
```

- `ExcelConverter`: Apache POI 기반, GridData.rows ↔ Excel Sheet 양방향 변환
- `ExcelColumnDef`: 엑셀 다운로드 시 컬럼 정의 (CactusResponse의 ColumnMeta와 별개)
- `FileStorageService`: 인터페이스만 제공, 구현체(로컬/NAS/S3)는 프로젝트에서 정의

### 6.2 업무 모듈 구현 범위

```
업무 모듈/
├── file/
│   ├── FileController.java          # 엔드포인트 (업로드/다운로드)
│   ├── FileMetaEntity.java          # 첨부파일 메타 엔티티 (프로젝트별 테이블)
│   ├── FileMetaRepository.java      # JPA 리포지토리
│   └── LocalFileStorageService.java # FileStorageService 로컬 구현체
```

---

## 7. 보안 고려사항

| 항목 | 설명 |
|------|------|
| 파일 크기 제한 | `spring.servlet.multipart.max-file-size` 설정 |
| 파일 타입 검증 | 확장자 + Content-Type + 매직넘버(파일 헤더 바이트) 3중 확인 |
| 파일명 무작위화 | 저장 시 UUID 기반 파일명 사용 (원본명은 DB에 보관) |
| 경로 순회 방지 | 파일명에서 `..`, `/`, `\` 등 제거 |
| 인증 필수 | JWT 인증 필터를 통과해야 파일 API 접근 가능 |
| 엑셀 행 수 제한 | DoS 방지를 위해 최대 행 수 설정 (예: 10,000행) |
