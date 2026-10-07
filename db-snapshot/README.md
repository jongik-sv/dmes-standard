# DB 스냅샷 (표별 CSV)

로컬 Oracle 에 넣을 기준 데이터를 **스키마별·표별 CSV** 로 git 에 올려 둔 폴더다(oracle-1007). 다른 PC·레인 PDB 에 같은 데이터를 넣고, 변경을 diff 로 볼 수 있다. 적재·내보내기·변환은 모두 `scripts/db-snapshot/snapshot.py`(`python3` + `pip install oracledb`)가 한다.

## 구성

```
db-snapshot/<Oracle 스키마>/
  <표이름>.csv     한 줄 = 한 행, 첫 줄은 칸 이름, PK 순
  _dynamic.json    (MCAAPUSER 만) 동적 표 TB_MCA_* 의 칸 종류. import 가 표를 만들 때 쓴다
```

| 스키마 | 내용 |
|---|---|
| `MDMAPUSER` | mdm 39표(약 4만 3천 행) |
| `MCMAPUSER` | mcm 표(`TB_MCM_*`·`TB_SEC_*` 등 54표) |
| `MCM_SOURCE` | 코드 원장 3표(`TB_MCM_CODE_MASTER`·`CATEGORY`·`DETAIL`). `MCMAPUSER` 에도 같은 3표가 들어간다 |
| `MCAAPUSER` | 동적 표 `TB_MCA_*`(적재기가 만든다) |

`MCM_BACKUP` 은 비워 둔다(동기화 관리 화면이 채운다). `flyway_schema_history`·SQLite 시퀀스 흉내 표는 CSV 에 넣지 않는다. 표는 Flyway(또는 `pdb.mjs template-schema`)가 만든 것이어야 하고, 적재기는 **데이터만** 넣는다.

### CSV 형식

UTF-8·LF(`.gitattributes` 로 `eol=lf` 고정), 쉼표 구분·큰따옴표 인용, PK 순, NULL 은 `\N`, BLOB 은 `b64:` 접두 base64 다. 한 파일은 50MB 를 넘기지 않아야 한다.

## 넣기(import)

```bash
python3 scripts/db-snapshot/snapshot.py import --pdb L_ORA_MDM            # 모든 스키마
python3 scripts/db-snapshot/snapshot.py import --pdb L_ORA_MDM MDMAPUSER   # 스키마 하나
python3 scripts/db-snapshot/snapshot.py import --pdb L_ORA_MDM --replace MCMAPUSER   # 적재 전에 그 표의 행을 모두 지우고(초기 행도 CSV 로 덮음)
```

PDB 는 `node scripts/oracle/pdb.mjs` 로 만들고 열어 둔다(`docs/guide/Database/oracle-26ai-test-guide.md` §6.4.2). 처음부터 데이터가 든 PDB 가 필요하면 `pdb.mjs template-data` 로 만든 템플릿에서 복제한다.

적재기가 하는 일:

- 초기 행(마이그레이션이 넣은 것)은 MERGE 로 CSV 값에 맞추고, IDENTITY 칸은 `start with limit value` 로, 시퀀스 `SEQ_MCM_MOM_TC_SEND`·`SEQ_MCM_MOM_TC_ERROR` 는 `MAX+1` 로 다시 맞춘다.
- FK 를 끄고 적재한 뒤 켠다. PK 칸이 비어 있는 행은 건너뛴다.
- 동적 표 `TB_MCA_*` 를 만들고 `MCMAPUSER` 에 DML 권한을 준다.
- epoch(초·밀리초) 시각은 **KST** 로 바꾸고, 빈 문자열은 NULL 로 바꾼다. 업무 일시는 값 그대로 둔다.

## 내보내기(export)

레인 PDB 의 내용을 CSV 로 다시 뽑는다.

```bash
python3 scripts/db-snapshot/snapshot.py export --pdb L_ORA_MDM            # 모든 스키마
python3 scripts/db-snapshot/snapshot.py export --pdb L_ORA_MDM MDMAPUSER
```

내보낸 뒤 `git diff --stat db-snapshot/` 로 바뀐 표를 확인하고 커밋한다. 같은 데이터면 diff 가 비어야 한다(결과가 안정적이다).

## SQLite 에서 변환(convert, 한 번)

SQLite 원본이 있을 때만 쓴다. 로컬 DB 를 Oracle 로 바꾸기 전 데이터를 CSV 로 만든 도구다.

```bash
python3 scripts/db-snapshot/snapshot.py convert --from-db src/backend/data/mdm.db --name mdm
python3 scripts/db-snapshot/snapshot.py convert --from-sql archive/oracle-1007/db-snapshot-sql/mcm --name mcm   # 옛 표별 SQL 스냅샷에서(b8 에서 archive 로 옮김)
```

- 서버가 DB 를 쓰는 중이어도 읽기 전용 사본을 떠서 읽는다. 같은 입력이면 결과 CSV 가 같다.
- `--name mcm` 은 SQLite 가 거친 적 없는 MCM 데이터 보정을 사본에 적용한다: `TB_MCM_SEC_OBJ.FORM_URL`(SEC_MENU 와 연결되는 행을 `PARENT_MENU_ID/OBJECT_ID` 로), 폴더 `mcm·cma·csa·cme` 의 `USE_TP`·`MENU_VIEW_YN`(COALESCE 'Y'). 출처는 `SchemaArtifactsMssql.java` 이다(원본 DB 는 바꾸지 않고 멱등이다).
- 위젯 정의 `TB_MCM_WIDGET_DEF` 6행의 `CONFIG_JSON.sql` 은 Oracle 문법으로 고쳐 CSV 에 직접 넣었다. `convert` 를 다시 돌리면 이 6행이 SQLite 문법으로 되돌아가므로, 돌린 뒤 `git checkout -- db-snapshot/MCMAPUSER/TB_MCM_WIDGET_DEF.csv` 로 복원한다.
- 옛 표별 SQL 스냅샷 폴더 `db-snapshot/mdm`·`db-snapshot/mcm`(`_schema.sql` 이 있다)은 b8 에서 `archive/oracle-1007/db-snapshot-sql/` 로 옮겼다.

### 내 PC 의 .db 를 거르지 않고 옮기기(`--full`)

리포 스냅샷은 공유용이라 위 「데이터를 뺀 표」·admin 행 필터·임베딩 NULL 이 걸려 있다. 내 PC 의 로컬 서버를 Oracle 로 바꿀 때처럼 **내 데이터를 그대로** 옮기려면 `convert --full`(걸러내기 끔)을 쓰고, 리포가 더럽혀지지 않게 `DMES_SNAPSHOT_DIR` 을 리포 밖으로 둔다. 지원 이름: `mcm`·`mdm`·`mls`·`caravan-console`. 절차는 `docs/oracle-1007/local-cutover.md`.

```bash
export DMES_SNAPSHOT_DIR=$HOME/dmes-main-snapshot
python3 scripts/db-snapshot/snapshot.py convert --from-db src/backend/data/mcm.db --name mcm --full
python3 scripts/db-snapshot/snapshot.py import --pdb L_MAIN --replace --keep-e2e
```

### E2E 잔여 행은 적재할 때 거른다

옛 로컬 DB 에는 E2E 시험이 남긴 행(`E2E_USR_*` 등)이 있어 `db-snapshot/MDMAPUSER` 에도 413행(19개 표)이 들어 있다. 리포의 CSV 는 지우지 않고(데이터 삭제는 사용자 승인 사항), `import` 가 MDMAPUSER 에서 **어느 칸이든 값이 대문자 `E2E` 로 시작하는 행**을 빼고 적재한다(ora-mdm 확인: 자식 표의 감사 칸 `C_USR_ID` 등에만 E2E 가 든 행도 E2E 레이아웃의 자식이라 같이 빼야 고아가 안 남는다). 거른 행 수는 표마다 `(E2E 행 N 거름)` 으로, 스키마 끝줄에 합계로 나온다. 그대로 넣으려면 `--keep-e2e`.

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

제외 목록·NULL 처리 칸·사용자 행 필터는 `snapshot.py` 맨 위의 `DATA_EXCLUDE`·`NULLIFY`·`ROW_FILTER` 에 있다.

## 사용자 관련 표는 admin 행만 내보낸다

사용자별 표는 `USER_ID='admin'` 행만 내보낸다(`ROW_FILTER`). 대상은 mcm 의 `TB_MCM_SEC_USER`, `_USER_MAPPING`, `_USER_FAVORITE`, `_USER_FAVORITE_FOLD`, `_USER_START_PGM`, `_USER_WIDGET`, `_USER_WIDGET_TAB`, `_USER_WIDGET_CHAT`, `_USER_WIDGET_MEMO`, `TB_SEC_SCREEN_USAGE_DAY`, `TB_SEC_SCREEN_USAGE_LOG` 이다. 그래서 다른 사용자의 이름·이메일·전화는 스냅샷에 남지 않는다. C_USR_ID·U_USR_ID 같은 작성자 감사 칸과 `OWNER_ID`·`*_OWNER_EMP_NO`(소유자 사번 속성)는 거르지 않는다.

## 적재 뒤 admin 비밀번호

`TB_MCM_SEC_USER_PWD` 가 비어 있다. mcm 서버를 기동하면 `DataInitializer` 의 `CoreRbacSeeder`(`src/backend/mcm/api/.../init/seed/CoreRbacSeeder.java`)가 admin 비밀번호 행을 넣고, 매 부팅 때 `admin123` 으로 강제 재설정한다(2026-06-05 결정, 운영 프로파일 차단은 후속 검토). 적재 뒤 mcm 을 한 번 기동하면 `admin` / `admin123` 으로 로그인된다. 비밀번호 칸 사용은 로컬 개발용이다.

## 임베딩 처리

`TB_MDM_TERM.EMBEDDING`(BLOB, 8,157행 × 4KB ≈ 33MB, 전체의 대부분)과 `EMBEDDING_MODEL` 은 **NULL 로 내보낸다**(`NULLIFY`). 적재 뒤에는 모든 용어가 재계산 대상이다. 서버에는 일괄 재인코딩 배치/API 가 없고(저장 시점에 건별로만 인코딩), `docs/mdm/dict-std/embed_terms.py` 가 일괄 재계산 수단이다. 이 스크립트는 지금 SQLite 파일(`--db`)을 대상으로 하므로 **Oracle 판은 후속**이다(필요하면 조정자에게 요청). 설계는 `docs/mdm/term-embedding.md` 참고.
