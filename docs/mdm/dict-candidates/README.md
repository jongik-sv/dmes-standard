# MDM 용어·도메인·컬럼 후보 (2026-10-01)

`dbschema/docs/tables/` 의 테이블·뷰 정의 1,263개(컬럼 46,470행)만을 근거로 뽑은 MDM 사전 **후보**다. 사람이 검토하기 전에는 확정본이 아니다.

## 파일

| 파일 | 내용 |
|---|---|
| `ISSUES.md` | 중복·충돌·불일치 문제 보고서. high TOP 30, 분야별 정리, 약어 표준표, 공통 컬럼 표준안, 사람이 결정할 항목, 재검증 결과 |
| `candidates.sqlite` | `mdm-dict-v2` 와 같은 DDL(MD_TERM·MD_DOMAIN·MD_UNIT·MD_COLUMN·MD_COLUMN_SYSTEM 등)에 적재한 후보. CHECK·UNIQUE 위반 0건. 근거는 X_ 테이블에 둔다 |
| `mdm_candidates.xlsx` | 검토용 엑셀. 용어·도메인·단위·컬럼·시스템별필드·보류컬럼·토큰맵·문제요약·문제목록·검토결과 시트 |
| `work/` | 중간 산출물과 스크립트(재실행용) |

### candidates.sqlite 의 보조 테이블

| 테이블 | 내용 |
|---|---|
| `X_TERM_SRC` | 용어별 원 토큰·신뢰도·근거·비고 |
| `X_TOKEN_MAP` | 레거시 토큰 → 용어(term/alias/variant/compound/noise) |
| `X_COLUMN_SRC` | 표준 컬럼별 레거시 컬럼명·코멘트·타입·의미 갈림 |
| `X_COLUMN_PENDING` | 미등록 용어 때문에 보류된 레거시 컬럼 494개 |
| `X_DOMAIN_SRC` | 도메인 신뢰도·비고 |
| `X_ISSUE` | 자동 탐지 문제 6,268건(분류·심각도·상세) |

## 규모

용어 1,452 · 도메인 119 · 단위 31 · 표준 컬럼 7,674 · 시스템별 필드 10,961(MES 9,533, APS 1,428) · 보류 컬럼 494.

같은 채점 기준으로 재검증한 결과, 표본 450행의 major 비율은 수정 전 19.1% 에서 수정 후 4.7% 로 내려갔다. 새 무작위 450행에서는 major 3.3%, minor 19.1% 였다.

## 만든 방법

1. 테이블 문서를 SQLite(`work/base.sqlite`)로 정리하고 컬럼명 토큰 2,297개를 정규화했다.
2. 용어 추출(sonnet 33) → 통합(표기 충돌·동의어·합성어·변형, opus 6·sonnet 3) → 별칭 감사(opus 6) → 보정(opus 5).
3. 컬럼 추출(sonnet 39, 보정 후 재추출 25) → 도메인 설계(opus 9 + 통합 1) → 의미 기준 도메인 재배정(sonnet 28 + 보충 opus 1).
4. 자동 탐지 스크립트와 검토자 13명(opus 10·sonnet 3)으로 문제를 판정하고, 수정 후 sonnet 9 로 재검증했다.

재생성 순서(`work/` 에서): `prep_terms.py` → `merge_terms.py` → `build_term_map.py` → `prep_col_terms.py` → `issues_base.py` → `build_final.py` → `export_xlsx.py`(openpyxl 필요).

## 범위 밖

- CODE 도메인의 코드 참조(`maru_code_id`·`cate_id`)는 비어 있다. 코드 마스터(`VI_M00_CODE_ACCESS`)로 채우는 일은 후속 작업이다.
- 유사어 임베딩(KURE-v1)은 쓰지 않았다. 동의어는 LLM 이 목록을 읽어 찾았다.
- ERP 필드 매핑은 없다.
