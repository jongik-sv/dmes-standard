# 용어 임베딩 방식 (2차 유사어 추천)

> 작성: 2026-09-24 (mdm/TSK-02-02 평가 엔진 설계 + 임베딩 방식 조사)
> TRD 가정 T6 확정(D-024·D-025). 출처 TSK-02-02 design §6.11~§6.13([tasks/TSK-02-02/design.md](tasks/TSK-02-02/design.md)).
> 원천 설계(`/Users/jji/project/mdm/docs/design/basic/`)의 행 번호를 `02:533` 처럼 인용한다. `02` 는 `02-term-domain-column.md` 다.

## 1. 결정 요약

용어 벡터는 원장 `TB_MDM_TERM` 의 칼럼 `EMBEDDING`(SQLite `BLOB`)에 L2 정규화한 float32 little-endian 1024개(4,096바이트)로 두고, 비교는 서버 메모리에서 전수 내적으로 한다(선택안 ①). 원천 02:533 이 정한 "`TB_MDM_TERM.embedding` 칼럼 하나"를 그대로 따르고, DB 벡터 기능에 기대지 않아 운영 DB(Oracle 또는 PostgreSQL, 방언은 아직 더하지 않음)가 어느 쪽이어도 같은 코드 경로를 쓴다. 모델은 KURE-v1 INT8 이고 풀링은 **CLS + L2** 다(INT8 변환본 README 가 적은 masked mean 이 아니다). 벡터를 만든 모델을 적는 `EMBEDDING_MODEL` 값은 `KURE-v1/int8-{model.onnx sha256 앞 8자}/cls-l2/in{입력 형식 버전}` 이고, PoC 파일 기준으로 `KURE-v1/int8-1808718e/cls-l2/in1` 이다. 1만 건 기준 질의 p95 가 22 ms 로 500 ms 기준을 크게 밑돌아 ANN 인덱스나 DB 네이티브 벡터는 필요하지 않다. 현재 모델 벡터가 100,000 건에 이르거나 운영 추천 응답 p95 가 250 ms 에 이르면 방식을 다시 검토한다.

## 2. 모델·런타임·입력 형식

| 항목 | 값 | 근거 |
|---|---|---|
| 모델 | KURE-v1 (`nlpai-lab/KURE-v1` rev `8b418a58414668e75532ed045c22d9ca018ae2b2`, MIT). XLM-RoBERTa 24층, hidden 1024 | 02:537, HF 모델 파일 |
| 정밀도 | INT8 동적 양자화(`quantize_dynamic` QInt8, opset 17) | 02:536 |
| PoC 가 쓴 파일 | `thkmon/KURE-v1-onnx-int8` rev `118dcc12c125320225de077e57a9f367ce8f6407`, `model.onnx` 568,451,402 bytes, sha256 `1808718e3d54308c8d7bf67fbad5632e08e44b029653e3e31cdd7ed0180d171b` | 다운로드 후 `shasum` 으로 확인. 운영 파일의 출처는 design D3 에서 결정한다 |
| 그래프 입출력 | 입력 `input_ids`, `attention_mask`(int64 `[batch, seq]`), `token_type_ids` 없음. 출력 `last_hidden_state`(float `[batch, seq, 1024]`) 하나 | ORT 세션 메타(`raw-01-info-tokens.txt`) |
| 토크나이저 | 같은 repo 의 `tokenizer.json`(sha256 `fb3c3b93c46fd5a8634e262e1b7de7da11a18b527aa2282b312952b692781dfd`, Unigram, `<s> … </s>`), DJL `ai.djl.huggingface:tokenizers:0.38.0`, 특수 토큰 추가, 최대 512 토큰. 용어 입력은 최대 100 토큰이라 길이 제한의 영향이 없다 | 파일 직접 확인, `raw-01-info-tokens.txt` |
| 풀링 | **CLS**(0번 토큰 `<s>`) + **L2 정규화**. 원본 모델의 `1_Pooling/config.json` 이 `pooling_mode_cls_token: true`(mean·max 는 false)이고, `modules.json` 이 Transformer → Pooling → Normalize 다. INT8 변환본 README 는 "masked mean pool + L2" 로 적었지만 원본 설정과 다르므로 따르지 않는다 | 원본 모델 파일, 02:536 |
| 접두어 | 없다. `config_sentence_transformers.json` 의 `prompts` 가 `{}` 이고 `similarity_fn_name` 은 `cosine` 이다 | 원본 모델 파일 |
| 입력 형식 | `"{표기}: {정의} ({영문명})"`. 표기·정의·영문명은 `strip()` 한다. 정의가 비면 `": {정의}"` 를 빼고, 영문명이 비면 `" ({영문명})"` 를 뺀다. 의미 번호·맥락·약어는 넣지 않는다 | 02:530·817 "표기 + 정의 + 영문명", PoC `TermCorpus.encodeInput` |
| 질의 입력 | 추천 API 는 화면이 가진 것만 같은 형식으로 만든다. 표기만 있으면 표기만 쓰고(질의 p95 22 ms), 인라인 등록 팝업처럼 정의·영문명이 있으면 전체 형식을 쓴다(질의 p95 76 ms) | §3 측정 |
| 런타임 | ONNX Runtime Java `com.microsoft.onnxruntime:onnxruntime:1.30.0`(CPU), `intraOpNumThreads=4`(설정값, 기본 4), `interOpNumThreads=1`, `SEQUENTIAL`, `ALL_OPT`. 세션 하나를 공유하고 인코딩 호출은 직렬화(세마포어 1)한다. 동시에 실행하면 intra 스레드가 겹쳐 느려진다(intra 10 측정) | §3 측정 |
| 일괄 인코딩 | 배치 1. CPU 에서는 배치를 키워도 빨라지지 않으므로 길이순 정렬도 필요 없다 | §3 측정 |
| 두는 곳 | mdm 서버 모듈(`src/backend/mdm/lib`)의 의존으로 둔다. 엔진 jar(`maru-mdm-engine`)에는 절대 넣지 않는다(TRD §10). 모델 파일은 서버 파일 경로 설정(예: `mdm.embedding.model-dir`)으로 주고 WAR·저장소에 넣지 않는다. DJL 은 jar 안의 네이티브를 `~/.djl.ai`(또는 `DJL_CACHE_DIR`)에 풀어 쓰므로 그 폴더에 쓰기 권한이 필요하다 | TRD §10 |
| 메모리 | 모델 적재 후 프로세스 RSS 약 1.3 GB(대부분 JVM 힙 밖 네이티브), 1만 벡터 캐시 약 40 MB 힙. WildFly 기동 옵션과 서버 메모리 산정에 넣는다 | §3 측정 |
| `EMBEDDING_MODEL` 값(design D4) | `KURE-v1/int8-{model.onnx sha256 앞 8자}/cls-l2/in{입력 형식 버전}`. PoC 파일이면 `KURE-v1/int8-1808718e/cls-l2/in1` 이다. 모델 파일·양자화·풀링·입력 형식 중 하나라도 바뀌면 값이 바뀌어 재인코딩 대상이 된다 | 02:540, TSK-04-02 수용 기준 |

## 3. 측정 요약

PoC 는 [`poc/mdm-embedding-bench`](../../poc/mdm-embedding-bench/) 에 있다. `src/backend` composite build 와 `testAll` 에 들어가지 않는 독립 Gradle 프로젝트이고, 모델 파일은 커밋하지 않는다. 합성 용어 1만 건(토큰 수 전체 입력 p50 55·p95 83·max 100, 표기만 p50 9·p95 11·max 16)으로 측정했다. 측정 요약 원문은 [`poc/mdm-embedding-bench/results/README.md`](../../poc/mdm-embedding-bench/results/README.md) 다.

| 항목 | 결과(Apple M5 10코어, intra 4) | 500 ms 기준 대비 |
|---|---|---|
| 모델 콜드 로드 | 0.8-4.8 s, 첫 추론 20-27 ms | 기동할 때 1회(지연 적재) |
| 단건 인코딩(저장 경로, 전체 입력) | p50 29.1 · p95 42.1 ms | 등록·수정 1건에서 체감되지 않는다 |
| 질의 1건 = 표기 인코딩 + 1만×1024 전수 코사인 top-5 | **p50 20.0 · p95 22.2 ms** | 약 22배 여유 |
| 질의 1건 = 전체 입력 인코딩 + 전수 비교 | p50 54.6 · p95 76.2 ms | 약 6배 여유 |
| 1만 건 일괄 인코딩(최초 구축·재인코딩) | 336.2 s(5.6 분), 29.7 건/s(배치 1, 단독 실행) | 배치 작업 |
| 전수 비교만(단일 스레드, 인코딩 제외, p95) | 1만 4.9 · 5만 24.9 · 10만 50.9 · 25만 124.4 · 100만 661.0 ms. 행당 약 0.5 µs 로 선형이다 | 100만 건에서 기준을 넘는다 |
| SQLite `BLOB` 1만 행 전체 읽기 + float32 LE 디코드 | 23.1 ms(적재 91.7 ms, 비트 단위 왕복 일치, 파일 44 MB) | 캐시 적재 |
| RSS | 로드 후 약 1.3 GB, 일괄 인코딩 중 최대 1.4-2.0 GB | 메모리 산정 |
| 풀링 정성 확인(유사어 15쌍, 질의 표기만) | CLS top-5 12/15, masked mean 11/15 | 합성 코퍼스라 품질 근거로 쓰지 않는다 |

개발 PC 수치다. 운영 서버 CPU 가 2-3배 느려도 1만 건 질의는 100 ms 안에 든다. 1만 건 일괄의 첫 측정(486.9 s)은 다른 작업과 겹쳐 느렸으므로, 단독으로 다시 잰 값을 인용한다.

원시 출력 파일(`poc/mdm-embedding-bench/results/`):

| 파일 | 내용 |
|---|---|
| [`raw-01-info-tokens.txt`](../../poc/mdm-embedding-bench/results/raw-01-info-tokens.txt) | 그래프 입출력, 토큰 수 |
| [`raw-02-single.txt`](../../poc/mdm-embedding-bench/results/raw-02-single.txt) | 콜드 로드, 단건 인코딩 |
| [`raw-03-batch-1000.txt`](../../poc/mdm-embedding-bench/results/raw-03-batch-1000.txt) | 배치 크기·스레드 수 비교 |
| [`raw-04-batch-10k.txt`](../../poc/mdm-embedding-bench/results/raw-04-batch-10k.txt) | 1만 건 일괄(다른 작업과 겹친 첫 측정) |
| [`raw-09-batch-10k-rerun.txt`](../../poc/mdm-embedding-bench/results/raw-09-batch-10k-rerun.txt) | 1만 건 일괄 단독 재측정(인용 값) |
| [`raw-05-scan.txt`](../../poc/mdm-embedding-bench/results/raw-05-scan.txt) | 규모별 전수 비교 |
| [`raw-06-query.txt`](../../poc/mdm-embedding-bench/results/raw-06-query.txt) | 질의 1건 |
| [`raw-07-sqlite.txt`](../../poc/mdm-embedding-bench/results/raw-07-sqlite.txt) | SQLite BLOB 왕복 |
| [`raw-08-pooling.txt`](../../poc/mdm-embedding-bench/results/raw-08-pooling.txt) | 풀링 정성 확인 |

## 4. 저장 방식 비교

원천은 PostgreSQL pgvector 를 전제로 `TB_MDM_TERM.embedding` 칼럼 하나를 두었다(02:533). 이 저장소의 로컬·테스트 DB 는 SQLite 이고 운영 DB 는 Oracle 또는 PostgreSQL 로 좁혀졌으나(2026-10-03) 방언은 아직 더하지 않았다(NFR-6, [ADR-0004](adr/0004-drop-mssql-production-assumption.md)). 측정 결과 속도는 어느 안이든 충분하므로, 선택은 방언 이식성과 원천 DDL 불변으로 갈랐다.

| 후보 | 방언 | 속도(1만 건) | 판단 |
|---|---|---|---|
| ① `TB_MDM_TERM` 칼럼 `EMBEDDING`(BLOB, float32 LE) + 서버 메모리 전수 비교 | 이진 칼럼만 있으면 어느 DB 든 같은 방식 | 질의 p95 22 ms | **선택**. 원천 02:533 "칼럼 하나"와 원천 DDL 불변에 맞고, 방언과 무관한 코드 경로다 |
| ② 별도 테이블(`TB_MDM_TERM_EMB` 등) + 메모리 비교 | 같음 | 같음 | 감사 칼럼·그리드 조회 부담을 떼어 내는 장점이 있으나 원천 DDL 을 바꾼다. ①에 엔티티 미매핑 규칙(§6 규칙 1)을 두면 같은 이점을 얻는다 |
| ③ 파일 인덱스(HNSW 등 ANN) | DB 밖 | 필요 없음 | 원장과 동기화·백업하는 경로가 하나 더 생기고 라이브러리 의존이 늘어난다. 전수 비교가 10만 건에서도 51 ms 라 이득이 없다 |
| ④ DB 네이티브 벡터 타입·거리 함수 | 특정 DBMS·버전 전용, SQLite 대응 없음 | 재지 않음 | 운영 DB 가 Oracle 또는 PostgreSQL 로 현장마다 갈리고, 방언이 갈라져 NFR-6 에 어긋난다 |
| ⑤ sqlite-vec | SQLite 로컬 전용 확장 | 재지 않음 | 확장을 적재해야 하고 다른 DB 대응이 없다. NFR-6 에 어긋난다 |

## 5. 선택안 DDL

TSK-02-03 ERD 와 TSK-04-01 Flyway 가 이 DDL 을 옮긴다. 운영 방언을 더할 때 그 DB 의 이진 타입(4,096바이트)으로 같은 두 칼럼을 둔다. 칼럼 이름은 원천 그대로 대문자로 쓴다(D-012).

```sql
-- SQLite (TB_MDM_TERM 의 다른 칼럼은 02 원문대로)
EMBEDDING        BLOB,             -- float32 LE × 1024 = 4096 bytes, L2 정규화. 인코딩 전 NULL
EMBEDDING_MODEL  VARCHAR(100),     -- 예 'KURE-v1/int8-1808718e/cls-l2/in1'. EMBEDDING 이 NULL 이면 NULL
```

- 인덱스·CHECK·DB 벡터 함수는 두지 않는다. 길이 검사(4,096바이트)는 애플리케이션이 쓸 때 한다.
- 값 형식은 L2 정규화한 float32 little-endian 1024개로 고정한다. 그래서 코사인 유사도는 내적과 같다. 이 형식이 바뀌면 `EMBEDDING_MODEL` 값도 바뀌어야 한다.
- SQLite 왕복은 PoC 에서 비트 단위로 일치함을 확인했다(naming-dialect-rules §3 #23).

## 6. 동작 규칙

TSK-04-02 가 구현한다.

1. **엔티티 미매핑**: JPA 엔티티(`TB_MDM_TERM`)는 `EMBEDDING`·`EMBEDDING_MODEL` 을 매핑하지 않는다. 그래야 그리드·상세 조회가 4 KB 를 끌어오지 않고, 용어 저장이 벡터를 덮지 않는다. 읽기와 쓰기는 전용 리포지토리의 네이티브 SQL 로 한다.
2. **등록·수정**: 표기·정의·영문명 중 하나라도 바뀌면 같은 트랜잭션에서 인코딩해 `UPDATE … SET EMBEDDING = ?, EMBEDDING_MODEL = ?, U_USR_ID…, U_AT…` 를 실행한다. 네이티브 쓰기이므로 감사 칼럼을 SQL 에 명시한다(naming-dialect-rules §2). 모델이 없거나 인코딩이 실패하면 용어 저장은 성공시키고 두 칼럼을 NULL 로 둔다. 다음 재인코딩 배치가 채운다.
3. **캐시**: 서버 메모리에 `term_id → float[1024]` 를 둔다(현재 `EMBEDDING_MODEL` 값인 행만). 추천을 부를 때마다 **모델 조건 없이** `SELECT COUNT(*), MAX(U_AT) FROM TB_MDM_TERM` 으로 바뀜을 본다. 행 수가 줄었으면(삭제) 전체를 다시 읽는다(1만 행 23 ms). 그 밖에 바뀌었으면 **모델 조건 없이** `U_AT >= 마지막 적재 시각` 인 행을 읽어, `EMBEDDING_MODEL` 이 현재 값인 행은 넣거나 바꾸고, 아닌 행(NULL 포함, 즉 인코딩 실패나 재인코딩 대기)은 캐시에서 뺀다. 이 방식은 서버 인스턴스가 여럿이어도 맞다. 경계 시각은 `>=` 로 겹쳐 읽어 같은 초 안의 쓰기를 놓치지 않는다.
4. **추천**: 질의 입력을 인코딩하고, 캐시 전체와 내적한 뒤, 자기 자신을 뺀 top-N(기본 5)을 돌려준다. 1차 문자열 추천과 합쳐 보이는 것은 화면 몫이다.
5. **재인코딩 배치**(최초 구축·모델 교체): `WHERE EMBEDDING_MODEL IS NULL OR EMBEDDING_MODEL <> :current` 인 행을 배치 1·직렬로 인코딩한다(1만 건 약 6분). 진행 중에는 새 값 행끼리만 비교한다(02:540).
6. **재검토 임계**: **현재 모델 벡터 100,000 건**(전수 비교 p95 51 ms, 캐시 390 MB) 또는 운영 추천 응답 **p95 250 ms**(500 ms 의 절반) 중 먼저 오는 쪽에서 방식을 다시 검토한다. 그때는 병렬 스캔을 먼저 보고, 다음으로 ANN(③)을 본다. 원천 전망은 "많아야 수만 건"(02:533)이다.

모델 파일이 없으면 2차 추천을 끄고 1차 문자열 추천만 한다(TRD §10).

## 7. 인계

| 받는 Task | 인계 |
|---|---|
| TSK-02-03 DB 설계 | ERD 의 `TB_MDM_TERM` 에 `EMBEDDING`·`EMBEDDING_MODEL` 칼럼(§5 DDL) |
| TSK-04-01 02 계약 | Flyway 칼럼(SQLite `BLOB`), JDBC 왕복 실측과 naming-dialect-rules §3 #23 상태 갱신, 엔티티 미매핑 |
| TSK-04-02 용어 관리 | ORT 1.30.0·DJL tokenizers 0.38.0 을 `mdm/lib` 에 둔다. 모델 경로 설정, §6 동작 규칙 1~6(캐시·재인코딩 배치·임계 감시), design D3 결과에 따른 모델 파일(원본 FP32 직접 변환이면 변환 스크립트와 sha256 기록), 메모리 산정(RSS 약 1.3 GB). §3 수치는 개발 PC(macOS·Apple M5)에서 잰 값이므로 운영 WildFly 서버의 OS·CPU 에서 단건 인코딩·질의 p95 를 다시 잰다. DJL tokenizers 0.38.0 jar 에 든 네이티브는 osx-aarch64·linux-x86_64·linux-aarch64 뿐이고 Windows 는 없다(`unzip -l` 확인) — 운영 서버가 Windows 면 토크나이저 네이티브 확보 방법을 먼저 정한다 |
