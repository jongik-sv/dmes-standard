# SQL 쿼리 분석 결과 스키마 (v1)

query-cache L2에 저장되는 분석 결과의 JSON 스키마 정의.
Phase 3 SQL 분석과 호환되며, 사전 분석 시 이 스키마를 준수해야 한다.

## JSON 스키마

```json
{
  "queryId": "string (필수) - 쿼리 ID (예: M472020010.selectCoilInfo)",
  "analysisModel": "string (필수) - 분석에 사용된 AI 모델 (haiku | sonnet)",
  "queryType": "string (필수) - SELECT | INSERT | UPDATE | DELETE | MERGE | PROCEDURE",
  "description": "string (필수) - 쿼리의 비즈니스 목적 한글 설명",
  "tables": [
    {
      "tableName": "string (필수) - 테이블/뷰 이름 (스키마 접두사 포함 가능, 예: TB_M47_COIL_MASTER)",
      "alias": "string - SQL에서 사용된 별칭 (예: A, CM)",
      "role": "string (필수) - 메인 테이블 | 참조 테이블 | 조인 테이블 | 서브쿼리 테이블",
      "accessPattern": "string - FULL SCAN | INDEX SCAN | PK LOOKUP | 조건부 조회 등"
    }
  ],
  "columns": [
    {
      "name": "string (필수) - 컬럼명 또는 AS 별칭 (예: COIL_NO, TOTAL_WGT)",
      "tableName": "string - 소속 테이블명",
      "tableAlias": "string - SQL에서 사용된 테이블 별칭",
      "dataType": "string - DB 메타데이터 기반 데이터 타입 (메타데이터 없으면 추정) (VARCHAR2, NUMBER, DATE 등)",
      "isPrimaryKey": "boolean - PK 여부 (DB 메타데이터 기반, 없으면 추정)",
      "isForeignKey": "boolean - FK 여부 (확인 가능한 경우)",
      "expression": "string - DECODE/서브쿼리/연산식 등 표현식 컬럼의 원본 표현식. 단순 컬럼이면 null"
    }
  ],
  "# columns 추출 규칙 (에이전트 필수 준수)": {
    "SELECT * 또는 alias.*": "→ fetch-queries/fetch-batch 출력의 tableColumns 필드에서 해당 테이블의 컬럼 목록 사용 (audit 컬럼 이미 제외됨); tableColumns에 없으면 빈 배열 []",
    "명시적 컬럼 목록이 있는 SELECT": "→ 전체 추출 (개수 제한 없음)",
    "INSERT 컬럼목록": "→ 삽입 대상 컬럼 전체 추출 (개수 제한 없음)",
    "UPDATE SET 컬럼": "→ 수정 대상 컬럼 전체 추출 (개수 제한 없음)",
    "audit 컬럼 제외 대상": "CREATED_OBJECT_TYPE, CREATED_OBJECT_ID, CREATED_PROGRAM_ID, CREATION_TIMESTAMP, LAST_UPDATED_OBJECT_TYPE, LAST_UPDATED_OBJECT_ID, LAST_UPDATE_PROGRAM_ID, LAST_UPDATE_TIMESTAMP, DATA_END_STATUS, DATA_END_OBJECT_TYPE, DATA_END_OBJECT_ID, DATA_END_PROGRAM_ID, DATA_END_TIMESTAMP, ARCHIVE_COMPLETED_FLAG, ARCHIVED_EMPLOYEE_NUM, ARCHIVED_TIMESTAMP, ARCHIVE_PROGRAM_ID"
  },
  "joins": [
    {
      "type": "string (필수) - INNER | LEFT | RIGHT | FULL | CROSS",
      "leftTable": "string (필수) - 왼쪽 테이블 (별칭 또는 이름)",
      "rightTable": "string (필수) - 오른쪽 테이블 (별칭 또는 이름)",
      "condition": "string (필수) - 조인 조건 (예: A.COIL_NO = B.COIL_NO)"
    }
  ],
  "parameters": [
    {
      "name": "string (필수) - 바인드 변수명 (: 접두사 제외, 예: coilNo)",
      "type": "string - 추정 타입 (STRING, NUMBER, DATE)",
      "required": "boolean - 필수 여부 (동적 SQL 아닌 경우 true)",
      "description": "string - 파라미터 용도 설명"
    }
  ],
  "businessPurpose": "string (필수) - 비즈니스 관점에서의 쿼리 목적 (한글, 1~3문장)",
  "queryLogic": "string (필수) - 쿼리 로직 요약 (주요 조건, 정렬, 집계 등)",
  "performanceInfo": {
    "queryComplexity": "string (필수) - Simple | Medium | Complex"
  }
}
```

## 복잡도 기준

| 등급 | 기준 |
|------|------|
| Simple | 단일 테이블, 조인 없음, 서브쿼리 없음 |
| Medium | 2~3개 테이블 조인, 단순 서브쿼리, GROUP BY |
| Complex | 4개 이상 테이블, 다중 서브쿼리, UNION, 분석함수, 힌트 사용 |

## 예시 1: 단순 SELECT

```json
{
  "queryId": "M472020010.selectCoilList",
  "analysisModel": "haiku",
  "queryType": "SELECT",
  "description": "코일 목록 조회",
  "tables": [
    {
      "tableName": "TB_M47_COIL_MASTER",
      "alias": "A",
      "role": "메인 테이블",
      "accessPattern": "조건부 조회"
    }
  ],
  "columns": [
    {"name": "COIL_NO", "tableName": "TB_M47_COIL_MASTER", "tableAlias": "A", "dataType": "VARCHAR2", "isPrimaryKey": true, "isForeignKey": false, "expression": null},
    {"name": "COIL_WGT", "tableName": "TB_M47_COIL_MASTER", "tableAlias": "A", "dataType": "NUMBER", "isPrimaryKey": false, "isForeignKey": false, "expression": null},
    {"name": "COIL_STS_CD", "tableName": "TB_M47_COIL_MASTER", "tableAlias": "A", "dataType": "VARCHAR2", "isPrimaryKey": false, "isForeignKey": false, "expression": null}
  ],
  "joins": [],
  "parameters": [
    {"name": "prdtDt", "type": "DATE", "required": true, "description": "생산일자"},
    {"name": "coilStsCd", "type": "STRING", "required": false, "description": "코일 상태 코드"}
  ],
  "businessPurpose": "특정 생산일자의 코일 목록을 상태 코드 필터와 함께 조회한다.",
  "queryLogic": "TB_M47_COIL_MASTER에서 생산일자 조건으로 조회. 코일 상태 코드는 선택적 필터. 코일번호순 정렬.",
  "performanceInfo": {
    "queryComplexity": "Simple"
  }
}
```

## 예시 2: 복잡한 다중 JOIN

```json
{
  "queryId": "M472020010.selectCoilDetailWithOrder",
  "analysisModel": "sonnet",
  "queryType": "SELECT",
  "description": "주문 정보 포함 코일 상세 조회",
  "tables": [
    {"tableName": "TB_M47_COIL_MASTER", "alias": "CM", "role": "메인 테이블", "accessPattern": "PK LOOKUP"},
    {"tableName": "TB_M47_ORDER_MASTER", "alias": "OM", "role": "조인 테이블", "accessPattern": "INDEX SCAN"},
    {"tableName": "TB_M47_PROCESS_RESULT", "alias": "PR", "role": "조인 테이블", "accessPattern": "INDEX SCAN"},
    {"tableName": "VI_M00_CODE_ACCESS", "alias": "CD", "role": "참조 테이블", "accessPattern": "PK LOOKUP"}
  ],
  "columns": [
    {"name": "COIL_NO", "tableName": "TB_M47_COIL_MASTER", "tableAlias": "CM", "dataType": "VARCHAR2", "isPrimaryKey": true, "isForeignKey": false, "expression": null},
    {"name": "ORD_NO", "tableName": "TB_M47_ORDER_MASTER", "tableAlias": "OM", "dataType": "VARCHAR2", "isPrimaryKey": true, "isForeignKey": false, "expression": null},
    {"name": "PROC_CD_NM", "tableName": "VI_M00_CODE_ACCESS", "tableAlias": "CD", "dataType": "VARCHAR2", "isPrimaryKey": false, "isForeignKey": false, "expression": null},
    {"name": "TOTAL_WGT", "tableName": null, "tableAlias": null, "dataType": "NUMBER", "isPrimaryKey": false, "isForeignKey": false, "expression": "SUM(PR.RESULT_WGT)"}
  ],
  "joins": [
    {"type": "INNER", "leftTable": "CM", "rightTable": "OM", "condition": "CM.ORD_NO = OM.ORD_NO"},
    {"type": "LEFT", "leftTable": "CM", "rightTable": "PR", "condition": "CM.COIL_NO = PR.COIL_NO"},
    {"type": "LEFT", "leftTable": "PR", "rightTable": "CD", "condition": "PR.PROC_CD = CD.CODE AND CD.CODE_GRP = 'M47_PROC_CD'"}
  ],
  "parameters": [
    {"name": "coilNo", "type": "STRING", "required": true, "description": "코일번호"},
    {"name": "plantCd", "type": "STRING", "required": true, "description": "공장코드"}
  ],
  "businessPurpose": "특정 코일의 주문 정보와 공정 실적을 공정코드 명칭과 함께 상세 조회한다. 실적 중량은 합계로 집계된다.",
  "queryLogic": "코일마스터를 기준으로 주문마스터(INNER JOIN), 공정실적(LEFT JOIN), 코드테이블(LEFT JOIN)을 조인. 코일번호와 공장코드로 필터. 공정실적 중량을 SUM 집계. GROUP BY 코일번호, 주문번호, 공정코드명.",
  "performanceInfo": {
    "queryComplexity": "Complex"
  }
}
```

## 필드별 값 가이드

### tables.role
- **메인 테이블**: FROM 절의 첫 번째 테이블, 또는 DML 대상 테이블
- **조인 테이블**: JOIN으로 연결된 테이블 (비즈니스 데이터 보강)
- **참조 테이블**: 코드명 변환, 마스터 참조용 테이블 (VI_M00_*, TB_M00_*)
- **서브쿼리 테이블**: 서브쿼리 내에서만 사용되는 테이블

### tables.accessPattern
- **PK LOOKUP**: 기본키로 단건 조회
- **INDEX SCAN**: 인덱스 컬럼 조건 조회
- **FULL SCAN**: 전체 스캔 (조건 없음 또는 인덱스 미사용 추정)
- **조건부 조회**: 동적 조건에 따라 접근 패턴 변동

### parameters.type
- **STRING**: 문자열 (VARCHAR2)
- **NUMBER**: 숫자
- **DATE**: 날짜 (TO_DATE 함수와 함께 사용되는 경우)
- **LIST**: IN 절에 사용되는 목록

### queryType
- **SELECT**: 조회
- **INSERT**: 입력
- **UPDATE**: 수정
- **DELETE**: 삭제
- **MERGE**: MERGE INTO (upsert)
- **PROCEDURE**: 프로시저 호출 (`CALL` 또는 `{call ...}`)

## 버전 관리

- 현재 스키마 버전: **v1**
- `--invalidate-below 2` 옵션으로 v1 분석 결과를 무효화하고 v2로 재분석 가능
- 스키마 변경 시 버전을 올리고 이전 분석 결과는 자동 재분석 대상이 됨
