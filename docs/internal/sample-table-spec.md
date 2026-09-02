# SAMPLE_ITEM — 테이블 명세 (예시)

> 템플릿용 예시다. 실제 명세는 모듈별 테이블 목록 스프레드시트와 정합을 맞춰 작성한다.

| 항목 | 값 |
|---|---|
| 테이블 ID | SAMPLE_ITEM |
| 논리명 | 샘플 품목 |
| 소유 모듈 | MCM (기준정보) |
| 정본 여부 | 수신 (레거시 시스템이 정본) |

## 컬럼

| 컬럼 | 논리명 | 타입 | NULL | 키 | 비고 |
|---|---|---|---|---|---|
| ITEM_CD | 품목코드 | VARCHAR(20) | N | PK | 레거시 코드 그대로 사용 |
| ITEM_NM | 품목명 | NVARCHAR(100) | N | | |
| ITEM_TYPE | 품목유형 | VARCHAR(10) | N | | MAKE / BUY |
| UOM | 단위 | VARCHAR(10) | N | | 기준단위만 저장 |
| USE_YN | 사용여부 | CHAR(1) | N | | 기본값 'Y' |

## 제약

- `CHECK (ITEM_TYPE IN ('MAKE','BUY'))`
- `CHECK (USE_YN IN ('Y','N'))`

## 인덱스

| 인덱스 | 컬럼 | 용도 |
|---|---|---|
| IX_SAMPLE_ITEM_01 | ITEM_NM | 품목명 부분 검색 |
