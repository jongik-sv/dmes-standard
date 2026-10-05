# DB 스냅샷 (mdm · mcm)

로컬 SQLite DB(`src/backend/data/mdm.db` 51MB, `mcm.db` 780KB)는 `.gitignore`(`src/backend/data/`, `*.db`)로 git 에서 빠져 있다. 이 폴더는 그 내용을 **표별 SQL 텍스트**로 올려 두어, 다른 PC·브랜치에서 DB 를 복원하고 변경을 diff 로 볼 수 있게 한 것이다. `.gitignore` 규칙은 그대로다.

## 구성

```
db-snapshot/<db이름>/
  _schema.sql        스키마(표·인덱스·트리거·뷰, sqlite3 .schema)
  <표이름>.sql       표 데이터. 한 줄 = INSERT 한 문, PK(없으면 rowid) 순
  sqlite_sequence.sql  AUTOINCREMENT 시퀀스 값
```

`flyway_schema_history` 도 들어 있어, 복원한 DB 로 앱을 띄워도 마이그레이션이 다시 돌지 않는다.

## 내보내기

```bash
scripts/db-snapshot/export.sh            # mdm mcm 둘 다
scripts/db-snapshot/export.sh mdm        # 하나만
```

어느 폴더에서 실행해도 된다. 서버가 DB 를 쓰는 중이어도 `sqlite3 .backup` 으로 임시 사본을 떠서 그 사본에서 읽고, 끝나면 지운다. 실행할 때마다 `db-snapshot/<db>/` 를 비우고 다시 쓴다. 제외 목록·NULL 처리 칸은 스크립트 맨 위 배열(`DATA_EXCLUDE`, `NULLIFY`)이다.

## 복원

```bash
scripts/db-snapshot/import.sh mdm                      # src/backend/data/mdm.db 로
scripts/db-snapshot/import.sh mcm /경로/mcm.db         # 대상 경로 지정
```

- 대상 파일이 이미 있으면 지우지 않고 `<파일>.bak-<YYYYMMDD-HHMMSS>` 로 옮긴다. 복원이 실패하면 옮긴 파일을 되돌린다.
- `_schema.sql` 을 먼저 넣고, 표 파일을 한 트랜잭션으로 넣는다. 외래 키 순서 문제가 없게 `PRAGMA foreign_keys=OFF` 로 넣는다.
- 복원 전에 서버를 끄고, 복원 뒤에 켠다.

## 데이터를 뺀 표 (스키마만 남김)

| 표 | 이유 |
|---|---|
| mcm `TB_MCM_SEC_USER_PWD` | 비밀번호 해시 |
| mcm `TB_SEC_REVOKED_TOKEN` | 폐기된 JWT 식별자 |
| mcm `TB_MCM_SEC_USER_HIS`, `TB_MCM_SEC_USER_ROLL_HIS` | 사용자·권한 변경 이력 |
| mcm `TB_SEC_KEY_STORE` | JWT 서명 키(`PRIVATE_KEY`·`SECRET` 칸) |
| mcm `TB_SEC_USER` | `USER_PASS`(비밀번호) 칸 |
| mcm `TB_SEC_LOGIN_LOG` | 로그인 기록(IP·UA), 계속 쌓여 diff 가 흔들림 |
| mcm `TB_SEC_AUDIT_LOG` | 감사 로그 |

복원한 DB 에는 이 표들이 비어 있으므로, 비밀번호 계정(`TB_MCM_SEC_USER_PWD`)은 새로 만들어야 로그인된다. `TB_MCM_SEC_USER` 에는 이름·이메일·전화가 들어 있다(비밀 값은 아님).

## 임베딩 처리

`TB_MDM_TERM.EMBEDDING`(BLOB, 8,157행 × 4KB ≈ 33MB, 전체의 대부분)과 `EMBEDDING_MODEL` 은 **NULL 로 내보낸다**. 복원 뒤에는 모든 용어가 재계산 대상이다. 서버에는 일괄 재인코딩 배치/API 가 없고(저장 시점에 건별로만 인코딩), 아래 스크립트가 일괄 재계산 수단이다.

```bash
# 1) KURE-v1 INT8 모델(model.onnx sha256 1808718e…)을 ~/.cache/kure-v1-onnx-int8 에 준비
cd docs/mdm/dict-std
uv venv .venv && uv pip install numpy onnxruntime tokenizers
MODEL_DIR=~/.cache/kure-v1-onnx-int8 .venv/bin/python embed_terms.py --db ../../../src/backend/data/mdm.db
```

`EMBEDDING` 이 NULL 이거나 모델 값이 다른 행만 채운다(8천 건, 맥 CPU 약 8분 30초). 끝난 뒤 mdm 서버를 재기동하면 캐시가 새로 읽힌다. 설계는 `docs/mdm/term-embedding.md` 참고.

## 운영 절차

DB 를 바꾼 뒤(마이그레이션·데이터 적재 등) 공유하려면:

1. `scripts/db-snapshot/export.sh` 실행
2. `git diff --stat db-snapshot/` 로 바뀐 표 확인
3. `git add db-snapshot/` 후 커밋

변경이 없으면 diff 가 비어야 한다(결과가 안정적). 한 파일은 50MB 를 넘기지 않아야 하며, 표가 커지면 제외 목록 추가를 검토한다.
