# 표준용어·용어집 병합과 KURE 임베딩 (2026-10-02)

`~/Downloads/표준용어.xls`(GlueMaster export, 7,080행)와 `~/Downloads/NAVERWORKS/용어집.xlsx`(570행)를 로컬 `src/backend/data/mdm.db` 의 용어 사전(`TB_MDM_TERM`)에 합치고, 전체 용어를 KURE-v1 INT8 로 임베딩한 기록이다. 결정은 [decisions.md](../decisions.md) D-137 이다.

| 파일 | 내용 |
|---|---|
| `apply_dict_std.py` | 두 엑셀 → mdm.db 병합. 적재 전 백업, 엑셀 칸 값 대조(누락이면 롤백), 다시 돌려도 결과가 같다 |
| `embed_terms.py` | `EMBEDDING`·`EMBEDDING_MODEL` 채우기(맥 CPU, 8천 건 약 8분 30초). 모델이 다르거나 비어 있는 행만 한다 |
| `changes.json` | 요약, 칸별 반영 집계, 고친 기존 용어의 옛 값·새 값, 약어 충돌 판정 목록 |
| `last-run.txt` | 마지막 실행 결과 |

실행: `uv venv .venv && uv pip install pandas openpyxl lxml numpy onnxruntime tokenizers` 뒤
`.venv/bin/python apply_dict_std.py --std 표준용어.xls --glossary 용어집.xlsx` → `MODEL_DIR=~/.cache/kure-v1-onnx-int8 .venv/bin/python embed_terms.py`.

## 결과

| 항목 | 값 |
|---|---|
| 용어 | 1,485 → 8,152 (새 용어 6,667: 용어집 508·표준용어 6,159, 기존 용어 고침 805) |
| 기존 용어 | 지우지 않았다. 컬럼 TERM_IDS 끊긴 참조 0, (표기, 뜻 번호) 중복 0 |
| 약어 충돌 | 378건. 컬럼 물리명 근거로 기존 유지 369·표준용어로 교체 9(계획 PLAN→PLN, 길이 LEN→LTH, 비중 SPEC_GRAV→GRA, 온도 TEMP→TEM, 품질 QLTY→QLT, 지시 ORD→INST, 출하 SHIP→SHPG, 폭 WID→WTH, 표면 SURF→SUR) |
| 엑셀 칸 대조 | 비어 있지 않은 칸 값 누락 0, 붙지 않은 행 0 |
| 같은 이름 다른 뜻 | 용어집과 이름이 같은 기존 용어 44건을 정의로 직접 판정. 보급·분기·분류·클래스·확정·액티비티·차원·PI·조건·예약 10건은 기존 정의를 두고 새 뜻으로 넣었다 |
| 임베딩 | 8,152건 전부, `KURE-v1/int8-1808718e/cls-l2/in1`, 노름 1 |

## 칸 매핑

| 원천 칸 | 넣은 곳 | 전용 칼럼에 들어가지 않은 행(근거 줄에만 있음) |
|---|---|---|
| 표준용어 `표준용어` | TERM_NAME | 띄어쓰기·대소문자만 다른 표기로 기존 용어에 합친 12(Wirerope→WireRope, 표준 용액→표준용액 등) |
| `영문 Full Name` | ENG_NAME(비어 있을 때만) | 자리표시 'Required' 1,426, 기존 영문명을 유지한 435 |
| `항목 ID` | ENG_ABBR(비어 있을 때만) | 약어 충돌에서 기존 약어를 유지한 370 |
| `약어명` | ALIASES(표기·항목 ID 와 다를 때) | 기존 약어와 다른 약어명 5(권취기 CM, 비커스경도 VH, 운전 DRV, 위탁가공 CP, 텅스텐 W) |
| `시스템` | SYSTEMS | 0 |
| `체인한글명` | CONTEXT(새 용어만) | 기존·용어집 용어에 합친 880 |
| `no.`·`용어구분`·`부문`·`등록일` | STD_BASIS 근거 줄 | 전부. 용어 테이블에 맞는 칼럼이 없다 |
| 용어집 `용어(변경후)`·`정의`·`모듈` | TERM_NAME·DEFINITION·CONTEXT | 0 |
| `영문` | ENG_NAME(덮어씀) | 같은 뜻으로 묶인 행의 다른 영문 5(분기 Quarter, 출하 Goods Issue 등) |
| `영문약어` | ENG_ABBR(비어 있을 때만) | 1(입고 GR, 기존 WHS 유지) |
| `용어(변경전)` | SYNONYMS | '신규'·자기 자신 |
| `프로그램` | SYSTEMS(APS·MES·ERP) | 공통용어·시스템 26 |

모든 원천 행은 `STD_BASIS`(용어관리 화면 상세의 표준 근거 칸)에 `표준용어.xls no.325: 시스템=…, …` 또는 `용어집.xlsx 309행: …` 꼴로 모든 칸이 남는다.

## 알아 둘 점

- 표준용어에서 들어온 용어는 정의가 ''다. 화면에서 고쳐 저장하려면 정의를 채워야 한다(TermMngService 가 빈 정의를 거부한다).
- 임베딩 입력은 [term-embedding.md](../term-embedding.md) §2(D-025) 형식이다. 정의·영문명이 비면 그 부분을 뺀다. 서버 `TermMngService.buildEncodingInput` 이 빈 칸도 이어 붙이던(`표기:  ()`) 것을 같은 날 문서대로 고쳤고(`TermEncodingInputTest`), 처음 서버 형식으로 만든 벡터 중 입력이 바뀌는 행은 다시 인코딩했다.
- 대소문자만 다른 표기(Mo 몰리브덴 ↔ MO 제조오더, Cd ↔ CD)는 영문명이 비슷할 때만 합친다. 첫 적재에서 이 규칙과 같은 이름 다른 뜻 판정이 없어 잘못 합쳐진 것을 용어 테이블 복원 후 다시 적재했다(벡터는 입력이 같은 8,135건 재사용).
- 같은 약어의 영문 철자만 다른 행(AGC: AutoGuageController·AutomaticGaugeController)은 유사도 0.85 미만이라 다른 뜻으로 들어갔다.
- 컬럼이 참조하지 않고 엑셀에도 없는 기존 용어 28개는 남겨 두었다. 지울지는 사용자가 정한다.
