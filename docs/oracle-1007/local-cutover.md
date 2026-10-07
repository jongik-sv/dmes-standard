# 메인 로컬 서버 Oracle 전환 런북 (mls 8092 · mdm 8096 · mcm 8100)

대상: 메인 저장소(`/Users/jji/project/dmes-standard`)의 로컬 서버 3개를 SQLite 에서 Oracle 26ai Free 로 바꾸는 절차다. 전환은 머지 ③c·②·④(mdm·mls 의 Oracle V1 이 dev 에 들어온 뒤) 다음에 조정자가 한다. 모듈별 상태와 mcm 리허설 결과는 §7 에 있다. `src/backend/data/*.db` 파일은 지우지 않는다.

## 1. 쓸 PDB: 전용 `L_MAIN` (권장)

| 선택 | 장점 | 단점 |
|---|---|---|
| **`L_MAIN`(권장)**: `TPL_SCHEMA` 에서 복제한 전용 PDB | 운영 이름 사용자 13명과 V1 이력(`flyway_schema_history`)이 템플릿에서 이미 맞춰져 있다. 잘못되면 `drop` → 다시 `clone` 으로 롤백된다. 도구(`pdb.mjs`)가 `L_` 접두만 만들고 지우므로 안전장치가 그대로 적용된다 | 열린 PDB 슬롯 1개를 상주로 쓴다 |
| `FREEPDB1` | 슬롯을 더 쓰지 않는다 | 이미 조정자 데이터 사용자(MDM·MCM·MLS·MPN·MPP·MQC·CARAVAN_CONSOLE·dmes_user)가 있고, 도구가 FREEPDB1 은 만들지도 지우지도 않아 사용자·V1 적용을 손으로 해야 한다. 롤백이 어렵다 |

**권장 이유**: 롤백이 쉽고(PDB 통째 재생성), 사용자 이름이 운영과 같은 13명이라 FREEPDB1 의 옛 사용자와 섞이지 않는다. 열린 PDB 상한은 3개이므로(`DMES_ORA_MAX_OPEN`, 올리지 않는다) `FREEPDB1`·`L_MAIN` 이 상주하면 레인·시험이 쓸 수 있는 슬롯이 1개로 줄어든다. 그래서 **전환과 함께 `FREEPDB1` 을 닫는 것**(`pdb.mjs close FREEPDB1`, 쓰는 사람이 없는지 확인)을 권한다. 조정자가 FREEPDB1 을 계속 열어 두어야 하면 레인 작업이 슬롯을 기다리게 된다. 이 결정은 조정자가 한다.

스키마 사용자는 `TPL_SCHEMA` 에 이미 있다: MCMAPUSER·MCAAPUSER·MCM_SOURCE·MCM_BACKUP·CARAVANUSER·EAIUSER·IFUSER·MDMAPUSER·MLSAPUSER·MPPAPUSER·MQCAPUSER·MPNAPUSER·APSAPUSER, 비밀번호 `dmes_password_123`(`docs/oracle-1007/schema-owners.md`).

## 2. 사전 준비

1. dev 에 전환 대상 모듈의 Oracle V1 이 모두 들어왔는지 확인한다(`git ls-files 'src/backend/**/db/migration/**/oracle/**'`; mdm 은 `db/migration/mdm/oracle/V1__baseline.sql`, mls 는 `…/mls/oracle/…`).
2. 메인 서버 3개가 내려가 있는지 확인한다(8092·8096·8100 에 listen 이 없어야 한다: `lsof -nP -iTCP:8092 -iTCP:8096 -iTCP:8100 -sTCP:LISTEN`).
3. **`.db` 백업(삭제 아님)**: `mkdir -p ~/dmes-db-backup-$(date +%Y%m%d) && cp -p src/backend/data/*.db ~/dmes-db-backup-$(date +%Y%m%d)/`. 롤백 때 다시 변환하는 원본이다.
4. Podman VM 상태: `podman machine ssh -- 'free -m; cat /proc/loadavg'` — available 150MB 이상, load 10 미만. 다른 레인이 Oracle 을 쓰는 중이면 PC 잠금이 기다리게 해 준다.
5. `python3` 와 `pip install oracledb`(적재기·대조 스크립트용), JDK 21(`JAVA_HOME`; `be-run.sh` 는 `JAVA_HOME` 이 없으면 PATH 의 `java` 를 쓴다).

## 3. PDB 만들기

`TPL_SCHEMA` 는 dev 의 모든 모듈 Oracle V 파일을 스키마 주인으로 적용한 데이터 없는 템플릿이다. 모듈 V1 이 새로 머지됐으면 먼저 다시 만든다(PC 잠금 아래 한 번에 하나).

```bash
cd /Users/jji/project/dmes-standard
node scripts/oracle/pdb.mjs template-schema TPL_SCHEMA --rebuild    # 전 모듈 V 파일 적용, 봉인
node scripts/oracle/pdb.mjs clone TPL_SCHEMA L_MAIN                  # 전용 PDB(복제·열기, 몇 초)
```

Flyway 적용 순서: 도구는 스키마마다 V 번호 순으로 그 스키마 주인으로 접속해 적용하고 이력 행을 넣는다(스키마 사이에는 순서 의존이 없다). 앱도 로컬 프로파일에서 기동 때 스키마별 Flyway(mcm: `McmSchemaMigrator`)를 돌리지만 이미 이력이 맞으므로 아무것도 적용하지 않고 체크섬만 확인한다. 이후 V2 이상은 앱이 기동 때 적용한다(운영 WildFly 는 Flyway 를 끄고 DBA 가 적용).

## 4. 데이터 옮기기 (SQLite → Oracle)

내 데이터를 **거르지 않고** 옮기려면 `convert --full` 과 `import --keep-e2e` 를 쓴다. 변환 결과는 리포 밖에 둔다(`DMES_SNAPSHOT_DIR`, 리포의 `db-snapshot/` 을 건드리지 않는다). `--full` 이 없으면 비밀번호 해시·로그인 기록·admin 이외 사용자 행 등이 빠지고(공유용), `--keep-e2e` 가 없으면 MDMAPUSER 의 E2E 잔여 행(대문자 `E2E` 로 시작하는 값이 든 행)을 거르고 적재한다.

```bash
export DMES_SNAPSHOT_DIR=$HOME/dmes-main-snapshot
rm -rf "$DMES_SNAPSHOT_DIR"
D=src/backend/data
python3 scripts/db-snapshot/snapshot.py convert --from-db $D/mcm.db            --name mcm             --full
python3 scripts/db-snapshot/snapshot.py convert --from-db $D/mdm.db            --name mdm             --full
python3 scripts/db-snapshot/snapshot.py convert --from-db $D/mls.db            --name mls             --full
python3 scripts/db-snapshot/snapshot.py convert --from-db $D/caravan-console.db --name caravan-console --full
python3 scripts/db-snapshot/snapshot.py import --pdb L_MAIN --replace --keep-e2e      # 모든 스키마
```

- 서버가 DB 를 쓰는 중이어도 변환은 읽기 전용 사본을 떠서 읽는다. 이 절차에서는 서버를 내려 둔다.
- `mpn.db`·`mpp.db`·`mqc.db`·`caravan-if.db` 는 샘플 표뿐이고 행이 0 이라 옮기지 않는다.
- `TB_MDM_TERM.EMBEDDING`(BLOB)은 `--full` 에서 그대로 옮긴다. mdm.db(약 51MB)의 CSV 는 약 56MB 이고 변환은 1초 안팎이다. 적재 시간은 mdm V1 이 dev 에 들어온 뒤 재서 §7 에 적는다.
- 변환이 mcm 에 적용하는 보정(`TB_MCM_SEC_OBJ.FORM_URL`, 폴더 `USE_TP`·`MENU_VIEW_YN`)은 SQLite 를 거친 데이터에만 필요한 것이라 `--full` 에서도 적용된다.
- 로컬 DB 에 E2E 시험이 남긴 행이 있다(`E2E_USR_*` 등, MDMAPUSER 413행). 사용자 데이터는 그대로 옮기는 방침이라 위 절차는 `--keep-e2e` 로 남긴다. 거르려면 `--keep-e2e` 를 뺀다.

### 행 수 대조

```bash
python3 scripts/db-snapshot/compare_counts.py --from-db $D/mcm.db --name mcm --pdb L_MAIN
python3 scripts/db-snapshot/compare_counts.py --from-db $D/mdm.db --name mdm --pdb L_MAIN
python3 scripts/db-snapshot/compare_counts.py --from-db $D/mls.db --name mls --pdb L_MAIN
python3 scripts/db-snapshot/compare_counts.py --from-db $D/caravan-console.db --name caravan-console --pdb L_MAIN
```

`--full` 로 옮겼다면 불일치 0 이어야 한다(SQLite 에만 있는 보조 표 `flyway_schema_history`·`HTE_*`·`SEQ_*` 는 대조하지 않는다. 시퀀스 `SEQ_MCM_MOM_TC_SEND`·`SEQ_MCM_MOM_TC_ERROR` 는 적재기가 MAX+1 로 맞춘다). 불일치가 나오면 서버를 올리지 않고 §6 롤백으로 간다.

## 5. 기동

`be-run.sh` 의 `--pdb=<PDB>`(또는 env `BE_ORA_PDB`)가 `DMES_ORA_PDB`·`DMES_ORA_URL` 을 앱에 넘긴다. 앱은 PDB 가 없으면 기동이 바로 실패한다(mcm 기본값 `L_ORA_MCM_APP`).

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
./be-run.sh --mcm --mdm --mls --pdb=L_MAIN          # 백엔드 3개 (포트 8100·8096·8092)
# 프런트까지: .run.env 의 BE_RUN_ARGS 에 "--mcm --mdm --mls --pdb=L_MAIN" 을 적고 ./local-run.sh (.run.env 는 개인 설정, git 에 없다)
```

기동 로그에서 `Oracle PDB 접속값 전달: jdbc:oracle:thin:@//localhost:1521/L_MAIN` 과 Flyway 「적용할 마이그레이션 없음」(스키마별)을 확인한다. mcm 은 매 기동에 `admin` 비밀번호를 `admin123` 으로 재설정한다(`CoreRbacSeeder`). 시각은 모두 KST 이고 `be-run.sh` 가 `-Duser.timezone=Asia/Seoul` 을 준다.

## 6. 롤백(데이터 재적재)

코드에 SQLite 로 되돌리는 경로가 없으므로 「이전 커밋 체크아웃」이 아니라 **PDB 를 지우고 다시 만들어 `.db` 에서 다시 적재**한다. 원본 `.db` 는 그대로이고 §2 에서 백업해 두었다.

```bash
# 서버를 내린 뒤
node scripts/oracle/pdb.mjs drop L_MAIN
node scripts/oracle/pdb.mjs clone TPL_SCHEMA L_MAIN
# §4 의 convert(필요하면 백업본 ~/dmes-db-backup-*/ 에서) → import → compare_counts
```

Oracle 쪽 문제로 서버를 급히 띄워야 하는 경우의 임시 우회는 없다(SQLite 설정이 dev 에서 제거됐다). 이 때문에 전환은 리허설(§7)이 끝난 모듈부터 한다.

## 7. 확인 항목과 리허설 결과

### 확인 항목(전환 뒤 브라우저)

| 모듈 | 확인 |
|---|---|
| mcm | `admin`/`admin123` 로그인, 메뉴 트리(공통·MDM·MLS 폴더와 화면 수), 즐겨찾기·시작 프로그램, 홈 위젯(고정 탭·사용자 탭, 데이터 위젯 6개의 SQL 실행), 공지사항, 화면 사용 통계, 역할·권한 관리 조회 |
| mdm | 포털에서 MDM 메뉴 진입, 표준 용어·도메인·코드 조회 건수(용어 약 8천 건), 코드·룰 화면 조회, 버전 화면, 용어 등록/수정 1건(저장 후 다시 조회) |
| mls | 공지 목록(6건), 샘플 재고 조회 |
| 공통 | 서버 로그에 `ORA-` 오류가 없다, `pdb.mjs sessions L_MAIN` 으로 세션 수가 한도 안(limit 322) |

### mcm 리허설 (2026-10-07, `L_ORA_BASE`, 실제 서버는 기동하지 않음)

- 방법: dev(14b09f1af 이후)의 mcm V1(MCMAPUSER·MCAAPUSER·MCM_SOURCE·MCM_BACKUP)만 적용한 임시 템플릿에서 `L_ORA_BASE` 를 다시 복제하고(5초), 메인의 현재 `mcm.db` 를 `convert --full` → `import --replace` 했다.
- 변환: MCMAPUSER 55표 1,699행, MCAAPUSER 2표 6행, MCM_SOURCE 3표 6행. 적재 3.5초.
- 행 수 대조: SQLite 58표 1,706행 대비 Oracle 대조 59건(복사본 포함) **일치, 불일치 0**. 대조에서 제외한 보조 표는 `HTE_TB_MCM_MOM_TC_SEND`(Hibernate 임시 표)와 `SEQ_MCM_MOM_TC_SEND`(SQLite 가 흉내 낸 시퀀스, Oracle 은 진짜 시퀀스)다.
- 참고: 공유용 변환(`--full` 없음)은 같은 `mcm.db` 에서 481행만 남고 사용자·즐겨찾기·위젯 탭·로그인 기록 등 14개 표가 줄어든다. 그래서 로컬 서버 전환에는 `--full` 을 쓴다.
- mdm·mls 리허설: mdm V1 은 머지②, mls V1~V4 는 머지④ 뒤에 같은 방법으로 한다(mdm 변환은 미리 확인: 39표 42,870행, CSV 56MB).

### 막힌 점

- mdm·mls Oracle V1 이 dev 에 없어 이 둘의 적재·대조는 아직 못 했다.
- 앱 기동 확인(Flyway 체크섬 검증, 로그인)은 리허설에 넣지 않았다(무거운 기동이라 이 리허설은 적재까지). `pdb.mjs` 가 넣는 이력 행(체크섬)이 앱 Flyway 의 검증과 맞는지는 전환 때 기동 로그로 처음 확인하게 된다. 실패하면 `flyway_schema_history` 의 체크섬 불일치 메시지가 나오므로 §6 으로 롤백한다.
- mcm 은 기동 때 caravan 표(CARAVANUSER·EAIUSER)가 없으면 `CaravanMetaSeeder` 가 실패한다(ora-mcm-app 메모, 가드 사용자 확인 대기). caravan 표는 caravan-hub V1 이 만들므로 전환 PDB 는 caravan V1 이 dev 에 들어온 뒤(머지④) `template-schema --rebuild` 로 만든 `TPL_SCHEMA` 에서 복제해야 한다.
- 열린 PDB 슬롯: `L_MAIN` 상주 + `FREEPDB1` 닫기 결정이 필요하다(§1).
