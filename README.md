# DMES — APS · MES (표준 프로젝트 템플릿)

`dmes-ksm` 프로젝트에서 뽑아낸 **표준/템플릿 저장소**다. 고객사 ERP 를 신규 **APS**(고급 계획·스케줄링)와 **MES**(제조 실행) 로 이관·구축하는 프로젝트를 시작할 때 이 저장소를 복제해 쓴다. 백엔드는 Spring Boot 멀티 모듈(JDK 21), 프론트엔드는 Next.js/React(pnpm 모노레포) 기반이다.

거버넌스 체계·프레임워크 모듈(oasis, cactus-core, caravan-\*, analog)·빌드 골격은 원본 그대로다. 여기에 더해 **어느 프로젝트에서나 그대로 쓰는 공통 기반**은 실동작 코드로 들어 있고(아래 §"바로 동작하는 기반"), 고객사별로 달라지는 업무 도메인만 `sample`/`Sample*` 접두어가 붙은 얇은 예시로 대체되어 있다. 실제 고객사 프로젝트에 쓸 때는:

1. `RULE.md`·`docs/external/SampleErp/`·`.bp-sync.json` 등의 `{CLIENT}` 표기를 실제 고객사명으로 채운다.
2. 각 업무 모듈(`aps-core`, `mcm`/`mls`/`mqc`/`mpp`/`mpn` 의 `sample` 패키지, `m-mpn`/`m-mls`/`m-mqc`/`m-mpp` 의 `sample` 컴포넌트)을 실제 업무 도메인으로 교체한다.
3. `docs/aps`, `docs/mls`, `docs/mqc`, `docs/mpp`, `docs/mes`, `docs/glossary` 등의 placeholder 문서를 실제 분석·설계 산출물로 채운다.
4. 초기 계정(`admin`)의 비밀번호, `cactus.jwt.secret`, `BACKEND_CLIENT_KEY`, `AUTH_SECRET` 을 전부 교체하고 비밀번호 정책을 켠다.

## 바로 동작하는 기반

복제 직후 로그인·권한·메뉴·마스터코드·업무기준·로그 분석이 실제로 동작한다. 화면을 새로 만들지 않아도 관리자가 사용자와 권한을 등록하고 메뉴를 붙일 수 있다.

| 영역 | 화면 | 위치 |
|---|---|---|
| 공통관리 › **마스터관리** | 카테고리 관리 · Master Code 관리 · Master Code 상세조회 (+ 코드선택·엑셀업로드 팝업) | `mcm-core/cma`·`cme` · `m-mcm/page-components/cma`·`cme`·`cmz` |
| 공통관리 › **시스템관리** | OBJECT · 메뉴 · 역할 · 역할그룹 · 사용자 · PERMISSION · 사용자 권한 일괄 등록 · 동기화 관리 | `mcm-core/csa` · `m-mcm/page-components/csa` |
| 공통관리 › **업무기준관리** | 업무기준 목록조회 · Data관리 · 상세조회 · 구조관리 (+ 팝업 3종) | `mcm-core/cmb` · `m-mcm/page-components/cmb`·`cmz` |
| **로그 분석** | 로그 뷰어 (모듈별 로그 검색·SQL 바인딩·워크스페이스) | `analog` · `m-analog` |
| 포털 기반 | 로그인 · 탭·즐겨찾기·메뉴 트리 셸 · BFF 프록시 · API 권한(RBAC) 검증 | `mcm` 런처 · `m-mcm` · `shared/portal-shell` |

메뉴·OBJECT·RBAC 초기 데이터는 `mcm/api` 의 `DataInitializer` 가 **멱등**으로 적재하므로 빈 DB 로 시작해도 된다. 이 화면들의 5종 설계 산출물은 [`docs/mcm/design/`](docs/mcm/design/) 에 함께 들어 있어, 신규 화면 설계의 깊이 기준선으로 쓴다.

포털 알림(STOMP push)과 EAI 인터페이스 화면(caravan 콘솔·인터페이스 포맷·전송오류)은 이 템플릿에 포함하지 않았다. 필요한 프로젝트에서 원본 패턴을 따라 붙인다.

## 문서 진입점

모든 에이전트·개발 작업 규칙의 정본은 [RULE.md](RULE.md) 다. 작업 착수 전 RULE.md 의 §"작업 분기 — 가이드 라우팅" 에서 단일 진입점을 고른다. `AGENTS.md` / `CLAUDE.md` 는 RULE.md 를 가리키는 래퍼다.

| 목적 | 진입점 |
|---|---|
| 전체 라우팅 (정본) | [RULE.md](RULE.md) |
| 세부 가이드 인덱스 | [docs/guide/README.md](docs/guide/README.md) |
| APS 현재 상태·작업·설계·개발 | [docs/aps/README.md](docs/aps/README.md) |
| MES 화면 설계 | [docs/guide/design/README.md](docs/guide/design/README.md) |
| MES 개발 | [docs/guide/MES/Mes-Guide.md](docs/guide/MES/Mes-Guide.md) |
| Backend / Frontend 표준 | [docs/guide/BackEnd/README.md](docs/guide/BackEnd/README.md) · [docs/guide/FrontEnd/README.md](docs/guide/FrontEnd/README.md) |

## 작업 분기

작업은 **목적**(설계 vs 개발) × **모듈**(APS vs MES) 로 아래 3개 분기 중 하나다. 상세 판정·게이트는 [RULE.md](RULE.md) 를 따른다.

1. **MES 화면 설계** — As-Is 분석 → 5종 설계 산출물 작성
2. **APS 작업** (설계+개발 통합) — `src/backend/{aps-core, mpn}`, `src/frontend/m-mpn`
3. **MES 개발** — 작성된 설계 산출물 → 코드 구현 — `src/backend/{moduleId}`, `src/frontend/m-{moduleId}`

## 저장소 구성

### Backend (`src/backend/`, Spring Boot · JDK 21)

- **APS** — `aps-core`(제품 라이브러리 `com.dongkuk.dmes:aps-core`), `mpn`(APS 런처, `api`+`lib`)
- **MES** — `mls`(물류), `mqc`(품질), `mpp`(조업), `mcm`·`mcm-core`(앱 호스트·메뉴·권한·마스터코드·업무기준 — **실동작**)
- **공통/인프라** — `cactus-core`(인증·OASIS 플랫폼), `oasis`(BPMN 런타임), `caravan-core`/`caravan-hub`/`caravan-console`(EAI/메시지 허브), `analog`(로그 검색 엔진), `data-migration`(고객사 데이터 이관 — `sample-migration` 이 패턴 예시)

`mcm`·`mcm-core` 를 뺀 업무 모듈(`aps-core`, `mls`, `mqc`, `mpp`, `mpn`)에는 `sample`/`Sample*` 패키지 한 벌만 들어 있다. 실제 업무 도메인 코드는 여기에 채워 넣는다.

### Frontend (`src/frontend/`, Next.js · React · pnpm)

- 모듈 앱 — `m-mcm`(포털 호스트 + BFF + 공통관리 화면 — **실동작**), `m-analog`(로그 뷰어 — **실동작**), `m-mpn`(APS), `m-mls`, `m-mpp`, `m-mqc`
- 공유 — `shared`(`@dk-oasis/shared` — 공통 컴포넌트·http·grid·portal-shell), `m-design-dummy`(디자인 핸드오프 샌드박스)

## 처음 받은 뒤 셋업

로컬 앱 기동·백엔드 자동 시험·운영 DB 는 모두 **Oracle 26ai Free 하나**다(oracle-1007). 로컬은 Podman 으로 띄운 Oracle 컨테이너 하나를 쓰고,
격리는 PDB 로 한다(템플릿 `TPL_EMPTY`·`TPL_SCHEMA`·`TPL_DATA`, 레인 개발용 `L_<레인>`, 자동 시험용 `T_*`). 메인 로컬 서버는 전용 PDB `L_MAIN` 을 쓰고 `FREEPDB1` 은 close 만 한다.
스키마는 Flyway 로 만들고(스키마별 위치 독립), SQL 은 Oracle 전용으로 쓴다(규칙: [`oracle-sql-rules.md`](docs/guide/Database/oracle-sql-rules.md)).
SQLite·H2·MSSQL·PostgreSQL 은 가정하지 않는다. 내 PC 의 옛 SQLite `.db` 를 옮기려면 [`docs/oracle-1007/local-cutover.md`](docs/oracle-1007/local-cutover.md) 를 따른다.

### 1. 준비물

| 항목 | 내용 |
|---|---|
| JDK 21 | 백엔드 컴파일 대상이 21 이다. 기본 `java` 가 17 이하면 실행할 때 `JAVA_HOME` 을 21 로 준다(아래 5번). Gradle wrapper jar 는 저장소에 들어 있다. |
| Node.js · pnpm | 프론트엔드(`src/frontend`, pnpm 모노레포). 처음 실행 때 `fe-run.sh` 가 `pnpm install` 과 화면 라이브러리 build 를 한다. |
| Podman | Oracle 26ai Free 컨테이너(`tools/oracle-free/docker-compose.yml`)를 Podman 으로 띄운다. 설치는 아래 2번. |
| python3 · `pip install oracledb` | db-snapshot CSV 적재기(`scripts/db-snapshot/snapshot.py`)가 쓴다. |

```bash
git clone https://github.com/jongik-sv/dmes-standard.git
cd dmes-standard
```

### 2. Podman 설치와 머신 만들기 (DB 설치 방법 ①)

Docker Desktop 은 쓰지 않는다(기업 유료 라이선스). Podman 은 무료이고 Mac·Windows 에서 명령이 같다. 컨테이너를 돌리는 가상 머신(VM)의 메모리가 기준이다.

| VM 메모리 | 쓰는 경우 | 1회 설정 |
|---|---|---|
| **4GB 이상**(권장 기본) | 메모리 여유가 있는 PC | 필요 없다(이미지 기본값 SGA 1536M + PGA 512M 으로 기동) |
| **3GB** | 메모리 16GB 이하 PC(예 MacBook Air) | 필요하다(아래 3번의 「VM 3GB 이하일 때만」) |

2GB 는 쓰지 않는다(여러 작업이 겹치면 스래싱했다).

**Mac (Apple Silicon·Intel)** — sudo 없이 CLI 로 설치한다. `podman compose` 가 `docker-compose` 를 불러 쓰므로 함께 설치한다.

```bash
brew install podman docker-compose          # GUI 가 필요하면 brew install --cask podman-desktop
podman machine init --cpus 2 --memory 4096 --disk-size 40   # 메모리 16GB 이하 PC 는 --memory 3072
podman machine start
```

- 이미 머신이 있고 메모리만 바꾸려면: `podman machine stop && podman machine set --memory 3072 --cpus 2 && podman machine start`
- Podman Desktop 첫 실행 안내의 Kind·Minikube(쿠버네티스) 설치는 Skip 한다. 이미 켰다면 Settings ➡️ Extensions 에서 Disable 한다.

**Windows (WSL2 기반)**

1. [podman-desktop.io](https://podman-desktop.io/) 에서 Windows 설치 파일(EXE)을 받아 실행한다(WSL2 가 자동 연동된다).
2. `C:\Users\<사용자계정>\.wslconfig` 로 WSL 메모리를 정한다(4GB 이상이면 1회 설정이 필요 없다. 16GB 이하 PC 에서 3GB 로 줄이면 3번의 1회 설정이 필요하다).
   ```ini
   [wsl2]
   memory=6GB
   processors=4
   autoMemoryReclaim=gradual
   networkingMode=mirrored
   ```
   PowerShell 에서 `wsl --shutdown` 으로 재시작해 적용한다.
3. 프로젝트는 `/mnt/c/...` 가 아니라 WSL2 리눅스 내부 파일시스템(`\\wsl$\Ubuntu\home\<사용자>\...`)에 두면 I/O 가 5~10배 빠르다.

### 3. Oracle 컨테이너 기동과 확인 (DB 설치 방법 ②)

```bash
cd tools/oracle-free
podman compose up -d          # 처음 한 번은 이미지(약 1.5GB)를 내려받는다. 내려받기를 뺀 기동은 10초 안팎
podman logs -f oracle-26ai-free   # 「DATABASE IS READY TO USE!」 가 나오면 준비 끝(Ctrl+C 로 빠져나온다)
podman ps                     # oracle-26ai-free 가 떠 있는지 확인
```

버전 확인(Oracle AI Database 26ai Free Release 23.26.x 가 나오면 정상):

```bash
podman exec oracle-26ai-free bash -c "echo 'select banner_full from v\$version;' | sqlplus -s dmes_user/dmes_password_123@localhost/FREEPDB1"
```

접속 정보(DBeaver·IntelliJ·SQLcl 등):

| 항목 | 값 |
|---|---|
| Host · Port | `localhost` · `1521` |
| Service Name | `FREEPDB1` (JDBC `jdbc:oracle:thin:@localhost:1521/FREEPDB1`) |
| 관리자 | `SYS`(역할 `SYSDBA`)·`SYSTEM`, 비밀번호 `sys_password_123` ([`docker-compose.yml`](tools/oracle-free/docker-compose.yml) 의 `ORACLE_PASSWORD`) |
| 일반 계정 | `dmes_user` / `dmes_password_123` |

앱은 `FREEPDB1` 이 아니라 다음 4번에서 만드는 PDB(`L_MAIN`)에 접속한다. 컨테이너·볼륨 이름은 compose 가 정한다(컨테이너 `oracle-26ai-free`, 데이터 볼륨 `oracle-free_oracle-data`).

**정지와 초기화**

```bash
podman compose down       # 컨테이너만 내린다(데이터 유지). 다시 올리려면 up -d
podman compose down -v    # 데이터 볼륨까지 지운다(처음 상태). 지운 뒤에는 아래 「1회 설정」을 다시 한다
```

**VM 3GB 이하일 때만: 1회 설정**

VM 이 4GB 이상이면 건너뛴다. 3GB 머신(메모리 16GB 이하 PC)은 컨테이너를 한 번 띄워 볼륨이 생긴 뒤 아래를 **한 번** 적용한다. 값은 SGA `900M`, `pga_aggregate_target` `400M`, `pga_aggregate_limit` `2G`, `control_management_pack_access=NONE`, `job_queue_processes=0`(자동 작업·통계 수집 정지), 루트 AWR 스냅숏 간격 0(끔)이다. 절차 정본은 [`oracle-26ai-test-guide.md`](docs/guide/Database/oracle-26ai-test-guide.md) §8-5 이고 아래는 같은 명령이다.

```bash
cd tools/oracle-free
podman compose down                     # -v 를 붙이지 않는다
# Mac: VM 을 3GB 로 (이미 3GB 면 생략). Windows 는 .wslconfig 로 정한다
podman machine stop && podman machine set --memory 3072 --cpus 2 && podman machine start
podman run --rm --entrypoint bash -v oracle-free_oracle-data:/opt/oracle/oradata:Z \
  docker.io/gvenzl/oracle-free:slim-faststart -c '
  D=/opt/oracle/oradata/dbconfig/FREE; P=/tmp/initFREE.ora
  ln -sf $D/spfileFREE.ora $ORACLE_HOME/dbs/spfileFREE.ora
  echo "create pfile='\''$P'\'' from spfile;" | sqlplus -s / as sysdba
  sed -i -E "/sga_target|sga_max_size|pga_aggregate_target|pga_aggregate_limit|control_management_pack_access|job_queue_processes/d" $P
  printf "*.sga_target=900M\n*.sga_max_size=900M\n*.pga_aggregate_target=400M\n*.pga_aggregate_limit=2G\n*.control_management_pack_access=NONE\n*.job_queue_processes=0\n" >> $P
  echo "create spfile='\''$D/spfileFREE.ora'\'' from pfile='\''$P'\'';" | sqlplus -s / as sysdba'
podman compose up -d
podman logs -f oracle-26ai-free         # 「DATABASE IS READY TO USE!」 확인
podman exec oracle-26ai-free bash -c "echo 'exec dbms_workload_repository.modify_snapshot_settings(interval => 0);' | sqlplus -s / as sysdba"   # 루트 AWR 간격 0
```

`pga_aggregate_limit` 의 최소값이 2048M 이라 그보다 낮추면 `ORA-00093` 이 난다. 이 설정은 볼륨 안에 저장되므로 `down` 후 `up -d` 에는 유지되고, `down -v` 로 볼륨을 지우면 기본값으로 돌아가 다시 해야 한다.

**자주 막히는 것** (전체 목록은 가이드 §8)

- 머신이 멈추거나 시작되지 않을 때: Mac 은 `podman machine stop` 후 `podman machine start`, Windows 는 PowerShell 에서 `wsl --shutdown` 후 Podman Desktop 을 다시 연다.
- 컨테이너가 `Exited (137)` 로 죽을 때: VM 메모리 부족이다. 위 2번 표의 3GB 이상으로 올리고, 3GB 면 1회 설정을 했는지 본다.
- 재기동 때 `ORA-01078`·`LRM-00109`(initFREE.ora): 볼륨 매핑 끝에 `:Z` 가 있어야 한다(저장소의 compose 에는 이미 있다). `podman compose down` 후 `up -d` 하면 복구된다.
- `docker` 명령을 쓰고 싶으면 Mac 은 `ln -s /opt/homebrew/bin/podman ~/bin/docker`(`~/bin` 이 PATH 에 있어야 한다)로 `docker` CLI 명령만 대신할 수 있다. 소켓에 직접 붙는 도구는 가이드 §8-6.

이미지 비교·리소스 제약(메모리 2GB 상한·CPU 2코어·데이터 12GB)·PDB 운영은 [`oracle-26ai-test-guide.md`](docs/guide/Database/oracle-26ai-test-guide.md) 가 정본이다.

### 4. PDB 만들기와 데이터 넣기

컨테이너가 떠 있어야 한다(위 3번). 소요는 이 PC(VM 3GB)에서 잰 값이다([`SUMMARY.md`](docs/oracle-1007/SUMMARY.md) §2): `template-schema` 약 2분, `template-data` 약 2분(적재 자체는 mdm 9.5초), `clone` 몇 초. 다른 레인이 Oracle 을 쓰고 있으면 PC 잠금 때문에 더 걸릴 수 있다.

```bash
node scripts/oracle/pdb.mjs template-schema TPL_SCHEMA            # 전 모듈 Oracle V 파일을 적용한 데이터 없는 템플릿
node scripts/oracle/pdb.mjs template-data TPL_DATA                # + db-snapshot CSV 적재(python3 + oracledb)
node scripts/oracle/pdb.mjs clone TPL_DATA L_MAIN                 # 개발용 PDB(메인 로컬 서버는 L_MAIN, 레인 개발자는 L_<레인>)
```

- 이미 만든 PDB·템플릿이 있으면 그 단계는 건너뛴다(`node scripts/oracle/pdb.mjs list` 로 확인).
- 데이터 없이 시작하려면 `clone TPL_SCHEMA L_<레인>` 한 뒤 CSV 를 직접 넣는다. 이미 있는 PDB 에는 `python3 scripts/db-snapshot/snapshot.py import --pdb L_<레인> MDMAPUSER` 처럼 스키마별로 넣는다(데이터만 넣으며 표는 Flyway 가 만든 것이다).
  ```bash
  python3 scripts/db-snapshot/snapshot.py import --pdb L_<레인> MDMAPUSER      # 초기 행까지 CSV 로 덮으려면 --replace
  ```
- `pdb.mjs` 명령 전체와 PDB 이름 규칙·잠금·열린 PDB 상한(3개)은 [`scripts/oracle/README.md`](scripts/oracle/README.md) 에 있다. 레인 PDB 는 쓰는 동안만 `open` 하고 끝나면 `close` 한다.
- 복제·열기·삭제와 Oracle 을 쓰는 시험 빌드는 PC 잠금 아래 한 PC 에서 하나씩 돈다(다른 레인이 쓰고 있으면 차례를 기다린다). 윈도우는 `scripts\oracle\pdb.cmd` 로도 같은 명령을 쓴다.
- 데이터 원본은 표별 CSV [`db-snapshot/`](db-snapshot/) 이다(MDM 은 [`db-snapshot/MDMAPUSER/`](db-snapshot/MDMAPUSER/)). `be-run.sh` 는 `--mdm.sample.path` 를 붙이지 않으며 `MDM_SAMPLE` 설정도 없다.

### 5. 백엔드·프론트 기동

```bash
# 앞서 PDB 를 만들어 둔다(위 4번). 백엔드는 접속할 PDB 를 --pdb 로 지정한다. 개발자는 자기 레인 PDB 를 쓴다.
JAVA_HOME=<JDK 21 경로> PATH="$JAVA_HOME/bin:$PATH" ./be-run.sh --mcm --mdm --mls --pdb=L_MAIN
```

- `--pdb=<PDB>` 가 접속값 `DMES_ORA_PDB`·`DMES_ORA_URL` 을 앱에 넘긴다(env `BE_ORA_PDB` 도 같다). PDB 가 없으면 앱 기동이 바로 실패한다.
- 프론트까지 띄우려면 [`.run.env.example`](.run.env.example) 을 `.run.env` 로 복사해 `BE_RUN_ARGS` 에 같은 인자(`--mcm --mdm --mls --pdb=L_MAIN`)를 적고 `./local-run.sh` 를 실행한다. 모듈을 줄여 메모리를 아낄 수도 있다.
- `src/frontend/m-mcm/.env` 가 없으면 `fe-run.sh` 가 `.env.example` 로 만들고 `AUTH_SECRET` 을 발급한다.
- 브라우저에서 포털 http://localhost:5100 에 **`admin` / `admin123`** 으로 로그인한다.

### 6. 기동 때 자동으로 되는 일 (DB)

| 무엇 | 누가 |
|---|---|
| 스키마 이력 확인과 V2 이상 적용 (템플릿에서 복제했으면 V1 은 이미 적용돼 체크섬만 확인한다) | 모듈별 Flyway 마이그레이션 (`db/migration/**`) |
| 관리자 계정·메뉴·권한·OBJECT·마스터 시드 (MDM 메뉴 포함) | mcm `DataInitializer` (멱등) |

- 머지된 `V` 파일은 고치지 않고 `V2` 이상을 새로 추가한다. 번호 채번·스캐폴딩은 [`flyway-migration-add` 스킬](.claude/skills/flyway-migration-add/SKILL.md) 을 쓴다. 스키마 소유·연결 규약은 [`schema-owners.md`](docs/oracle-1007/schema-owners.md) 를 본다.
- MDM 화면 확인용 데이터(용어·도메인·컬럼·레이아웃·마루 코드·마루 데이터·업무 룰)는 기동 때 자동으로 넣지 않는다. 위 4번의 CSV 적재나 `TPL_DATA` 복제로 넣는다.

#### DB 를 처음 상태로 되돌리기

서버를 끄고 그 PDB 를 지운 뒤 템플릿에서 다시 복제한다. 지울 PDB 는 `L_` 로 시작하는 내 레인용이어야 한다(도구는 `TPL_`·`L_`·`T_` 접두만 만들고 지우며 `FREEPDB1` 은 건드리지 않는다).

```bash
node scripts/oracle/pdb.mjs drop L_<레인>
node scripts/oracle/pdb.mjs clone TPL_DATA L_<레인>
```

### 7. (선택) D'Flow 에이전트 스킬

`.claude/skills/dflow-*` 를 쓰려면 개인 설정 파일이 필요하다. 샘플을 복사하고 토큰만 채운다.

```bash
cp .dflow.local.example .dflow.local   # pats= 에 D'Flow 웹 /account 「내 토큰」 값을 넣고 dev_branch 를 확인한다
.claude/skills/dflow-work/scripts/dflow.sh doctor
```

`.dflow.local` 은 개인 토큰이 들어가므로 커밋하지 않는다(`.gitignore`). 필요한 명령: git · curl · jq · node(18.17 이상) · gh. 윈도우(Git Bash)에서는 jq 를 `.claude/skills/_shared/bin` 에 동봉한 것을 스크립트가 쓰므로 따로 설치하지 않는다. python3 는 dflow 스킬에 필요 없다(mantine-aggrid-ui 의 문서 조회 스크립트 `.py` 만 아직 python3 를 쓰며 node 로 이식 중이다). 자세한 환경은 `.claude/skills/_shared/platform-support.md` 를 본다.

### 8. (필수) Claude Code — 사용 한도 초기화 뒤 자동 계속

Claude Code 세션이 claude.ai 사용 한도(5시간 슬롯)에 걸리면 작업이 멈춘다. 아래 설정을 켜 두면 한도가 초기화될 때
멈춘 작업을 스스로 이어 간다. 밤새 돌리는 에이전트·팀 작업이 한도 때문에 아침까지 멈춰 있지 않도록 **모두 켠다.**

개인 설정 파일 `~/.claude/settings.json` 에 한 줄을 넣는다(저장소에 커밋하는 설정이 아니다).

```json
{
  "autoContinueAtUsageLimit": true
}
```

- claude.ai 구독 계정으로 로그인한 세션에 적용된다. 확인한 버전: Claude Code 2.1.287.
- 끄면 한도에 걸릴 때 선택 창(`What do you want to do?`)이 뜬다. 추가 지출·업그레이드 항목이 들어 있을 수 있으므로 Enter 를 무심코 누르지 않는다.
- 다음 경우에는 자동 계속이 취소된다. 그때는 직접 프롬프트를 보내거나 `/rate-limit-options` 로 다시 건다.
  - 기다리는 동안 Claude Code 를 다시 띄우거나 세션을 백그라운드로 보낸 경우
  - 초기화까지 24시간 넘게 남은 경우(주간 한도)
  - 초기화 뒤에도 한도에 거듭 걸린 경우

## 빌드·실행

복제 직후 아래 한 줄이면 백엔드 7개 모듈과 프론트엔드가 전부 뜬다. Ctrl+C 한 번으로 전부 정리된다.

```bash
./local-run.sh
```

백엔드/프론트를 따로 띄우려면:

```bash
./be-run.sh          # 백엔드만 (기본 --all)
```

```bash
./fe-run.sh --all -q # 프론트만, 설치·빌드 건너뛰고 dev 만
```

포트를 이미 물고 있는 프로세스가 있으면 정리하고 시작한다. 모듈 하나가 죽어도 나머지는 계속 뜨고,
어느 모듈이 죽었는지 로그에 남는다.

| 스크립트 | 기본 동작 | 주요 옵션 |
|---|---|---|
| `be-run` | 7개 모듈 동시 기동 (먼저 Gradle 로 [빌드](#백엔드-빌드와-기동-be-run)하고 앱은 `java` 로 직접 띄운다) | `--all` / 모듈별 `--mcm --mpn --mls --mqc --mpp --mdm --analog` / `--keep-port` / `--build-only` / [`--dry-run`](#드라이런---dry-run) |
| `fe-run` | pnpm install → 화면 라이브러리 build → 전체 dev | `--all` · `--mpn` · `-q`(설치·빌드 skip) · `--clean` · `--build` |
| `local-run` | BE + FE 동시 | 인자는 FE 로 전달. BE 대상은 `.run.env` 의 `BE_RUN_ARGS` |
| `dmes-up` (Windows 전용) | JDK 21 지정 → wrapper jar 보충 → 포트 정리 → BE + FE | `-Detach` · `-Be` · `-Fe` · `-Full` · `-Clean` · `-Warmup`(아무 동작 안 함) — [아래](#windows-한-번에-띄우기-dmes-up) |

**Windows** — 같은 동작의 PowerShell 판이 `*.ps1` 로 함께 들어 있다. 실행 정책에 막히지 않도록
`*.cmd` 래퍼를 두었으니 cmd·탐색기에서는 그쪽을 쓴다.

```bat
local-run.cmd
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\local-run.ps1
```

포트·옵션은 셸 판과 같다. 단 PowerShell 판 `be-run.ps1` 은 아직 `mdm` 모듈을 띄우지 않고(MDM 샘플 자동 적재도 셸 판에만 있다),
`.run.env` 와 환경변수를 읽는 순서가 셸 판과 다르다([아래 표](#runenv-와-환경변수-우선순위)). 한글이 든 `.ps1` 은 Windows PowerShell 5.1 이 깨뜨리지 않도록
UTF-8 BOM + CRLF 로 커밋돼 있다(줄 끝은 `.gitattributes` 가 CRLF 로 고정. `dmes-up.ps1`·`dmes-down.ps1` 은 ASCII 만 쓴다).
Windows 에서 확인할 항목은 [docs/refactor-2026-10/windows-ps1-checklist.md](docs/refactor-2026-10/windows-ps1-checklist.md) 에 모았다.

기본 인자는 `.run.env` 에서 바꾼다 (`BE_RUN_ARGS` / `FE_RUN_ARGS` / `LOCAL_RUN_ARGS`).
이 파일은 개인 설정이라 git 에 없다 — [`.run.env.example`](.run.env.example) 을 복사해 쓰고,
없으면 스크립트가 `--all` 로 폴백하므로 복제 직후 설정 없이도 그대로 뜬다.

**로컬 포트** — 포털 `5100` · mls `8092` · mqc `8093` · mpp `8094` · mpn `8095` · mdm `8096` · **mcm `8100`(포털 호스트)** · analog `8191`.
FE 는 `m-mcm/.env` 의 `{모듈}_WAS_URL` 로 각 백엔드를 찾는다. 이 파일이 없으면 `fe-run.sh` 가
`.env.example` 에서 만들고 `AUTH_SECRET` 을 자동 발급한다 (로컬 전용 — 실 프로젝트에서 반드시 교체).

**초기 계정은 `admin` / `admin123`.** local 프로파일은 `--pdb` 로 지정한 Oracle PDB 에 접속하고,
빈 DB 로 시작해도 `DataInitializer` 가 메뉴·권한·마스터 시드를 멱등 적재한다(자세한 내용은 §"처음 받은 뒤 셋업").

개별 모듈만 다룰 때:

- **Backend** — `cd src/backend/{모듈} && ../gradlew test` (Gradle wrapper 는 `src/backend` 한 벌만 둔다)
- **Frontend** — `cd src/frontend && pnpm install && pnpm dev` (세부 절차는 [docs/guide/FrontEnd/Local-Rules.md](docs/guide/FrontEnd/Local-Rules.md) §3)

세부 규칙(영속성·테스트·보안·배포·명명)은 모두 [docs/guide/](docs/guide/README.md) 하위 정본 문서를 따른다.

### 백엔드 빌드와 기동 (be-run)

> 이 절은 셸 판(`be-run.sh`)이다. ps1 판(`be-run.ps1`)은 아직 종전대로 모듈마다 `gradlew :api:bootRun` 을 띄우며 선빌드 계획(`-m`)을 쓴다.

be-run.sh 는 Gradle 로 **빌드만 하고 앱은 `java` 로 직접 띄운다.** bootRun 은 모듈마다 Gradle 데몬 하나(약 0.6GB)를 서버가 도는 내내 붙들었다.
3개 모듈이면 데몬 3개(약 1.7GB)에 gradlew 실행기 3개(약 0.3GB)가 더 상주해, 16GB PC 에서 스왑이 9GB 까지 찼다.

1. **빌드** — `scripts/lib/be-run-classpath.init.gradle` 을 `-I` 로 줘서 `<모듈>/api/build/be-run/classpath.txt`(1행 main class, 2행 classpath)를 만든다.
   값은 bootRun 이 쓰는 것과 같다. 모듈이 2개 이상이면 `src/backend` 루트 composite 에서 한 번(공유 includeBuild 를 Gradle 하나가 빌드해 경합이 없다),
   1개면 그 모듈 폴더에서 한다. 기본은 `--no-daemon` 이라 빌드가 끝나면 Gradle 프로세스가 남지 않는다. 코드를 고친 뒤 다시 띄우면 늘 최신 코드로 빌드된다.
2. **기동** — 모듈 폴더(`src/backend/<모듈>`)에서 `java <JVM 옵션> -cp <classpath> <main class> --spring.profiles.active=local …`.

- 빌드가 실패하면 **아무 모듈도 띄우지 않고** exit 1 로 끝난다. 이전 빌드의 classpath.txt 는 빌드 직전에 지우므로 낡은 값으로 뜨지 않는다.
  `local-run` 은 be-run 종료를 보고 FE 까지 정리하고, `dmes-up.ps1 -Detach` 는 함께 띄운 FE 를 정리한 뒤 `1` 로 끝난다.
- 빌드 도중 Ctrl+C·TERM 을 받으면 빌드 프로세스(단일 사용 데몬 포함)까지 정리하고 130·143 으로 끝난다.
- `./be-run.sh --mcm --build-only` 는 빌드까지만 하고 끝난다. 아무것도 띄우지 않으므로 이전 be-run 종료·포트 회수도 하지 않는다.
- 앱 JVM 의 pid 는 be-run 의 자식이다. 종료 신호를 받으면 TERM → 5초 대기 → KILL 순서로 정리하고, 이 체크아웃 모듈 폴더에서 도는 포트 리스너도 정리한다. 다른 be-run 이 가져간 모듈은 건드리지 않는다(아래 「모듈을 나중에 하나 더 띄울 때」).
  프로세스 명령줄에 `-Dbe.run.module=<모듈>` 이 있어 `ps` 로 어느 모듈인지 알 수 있다. (명령줄에 `bootRun` 이 더는 없다.)

| 변수 | 값 | 동작 |
|---|---|---|
| `BE_GRADLE_DAEMON` | `1` | 빌드에 Gradle 데몬을 쓴다 — 재기동이 몇 초 빨라지지만 데몬이 10분 남는다 |
| `BE_GRADLE_RUN` | `1` | **되돌리기** — 종전처럼 모듈별 `gradlew :api:bootRun` 으로 띄운다(아래 선빌드 설명 참고) |
| `BE_PREBUILD` | `0` | 빌드를 건너뛰고 직전 빌드의 classpath.txt 로 바로 띄운다(코드를 고쳤다면 최신이 아니다) |
| `BE_PREBUILD_CONTINUE` | `1` | 빌드가 실패해도 classpath.txt 가 만들어진 모듈은 띄운다 |

`BE_GRADLE_RUN=1` 이면 종전 동작이다. 모듈이 2개 이상일 때만 `src/backend` 루트 composite 로 `gradlew :<모듈>:api:bootRun … -m -q`(계획)를 돌려 `bootRun` 을 뺀
태스크를 Gradle 1회(`--continue`)로 선빌드한 뒤 모듈별 bootRun 을 띄운다. 계획·선빌드가 실패하면 아무 모듈도 띄우지 않으며(`BE_PREBUILD_CONTINUE=1` 이면 계속), `BE_PREBUILD=0` 이면 선빌드를 건너뛴다.

```bash
BE_GRADLE_RUN=1 ./be-run.sh --all          # 종전 bootRun 방식으로 되돌려 기동
BE_PREBUILD=0 ./be-run.sh --all            # 빌드 없이 직전 classpath.txt 로 기동
BE_PREBUILD_CONTINUE=1 ./be-run.sh --all   # 실패해도 기동
```

모두 환경변수나 `.run.env` 에 둔다. `BE_PREBUILD`·`BE_PREBUILD_CONTINUE` 가 겹칠 때 어느 쪽이 이기는지는 셸 판과 ps1 판이 다르다([아래 표](#runenv-와-환경변수-우선순위)).

#### 앱 JVM 메모리 옵션

기본값은 로컬 PC 메모리를 아끼는 쪽이다(실측 힙 사용 66~141MB, 종전 서버 1개 점유 383~472MB, `-Xmx` 없음 → 최대 힙 = PC 메모리의 1/4).

| 옵션 | 기본 | 비고 |
|---|---|---|
| `-XX:TieredStopAtLevel=1` · `-Dfile.encoding=UTF-8` · `-Duser.country=KR` · `-Duser.language=ko` · `-Duser.variant` | 종전 bootRun 과 같음 | |
| `-Xmx` | `768m` | `BE_JAVA_XMX` |
| `-XX:+UseSerialGC` | 켬 | G1 은 스레드·영역 관리로 힙 밖을 더 쓴다 |
| `-Xss` | `512k` | `BE_JAVA_XSS` (종전 macOS 기본 2MB) |
| `-XX:ReservedCodeCacheSize` | `40m` | `BE_JAVA_CODECACHE`. C1 만 쓰는 기본값이 이미 48MB 라 줄어드는 폭은 작다(실측 사용 최대 약 27MB) |

덧붙이기: `BE_JAVA_OPTS="-Xmx1g"` 는 모든 모듈, `BE_JAVA_OPTS_MDM="-Xmx1g"` 는 mdm 만(`BE_JAVA_OPTS_<모듈 대문자>`). 뒤에 오는 옵션이 이기므로 기본값도 덮는다.
엑셀 내보내기처럼 큰 요청이 `OutOfMemoryError` 를 내면 그 모듈의 `-Xmx` 를 올린다.
**KURE 임베딩 인코더를 다시 켜면**(`application-local.yml.kure-on` 로 복구) mdm 은 힙 밖(ONNX 네이티브 메모리)이 약 1GB 더 든다. `-Xmx` 로는 막을 수 없으니 그만큼 여유가 있을 때만 켠다.

### 드라이런 (`--dry-run`)

`./be-run.sh --all --dry-run` (ps1 판도 같은 이름 — `.\be-run.ps1 --all --dry-run`)은 **서버를 띄우지도 끄지도 않고** 이전 인스턴스 정리·포트 회수도
하지 않은 채 할 일만 출력한다 — 기동 대상, 회수할 포트, 빌드 명령, 모듈별 `java` 명령(JVM 옵션 포함).

- 셸 판의 기본 방식은 Gradle 을 부르지 않는다. 종전 방식(`BE_GRADLE_RUN=1`)에서 선빌드 대상(모듈 2개 이상이고 `BE_PREBUILD` 가 `0` 이 아님)이면
  태스크 목록을 보이려고 **`gradlew -m`(계획만, 태스크 실행 없음)을 한 번 부른다.** 이때는 Gradle 데몬이 뜨고(10분 뒤 스스로 내려간다),
  계획이 실패하면 그 출력 끝 15줄을 보인다(드라이런 자체는 0 으로 끝난다). ps1 판은 이 계획을 부른다.
- 모듈 플래그 없이 `--dry-run`(·`--keep-port`)만 주면 `BE_RUN_ARGS`(없으면 `--all`)의 모듈을 대상으로 한다.

### 모듈을 나중에 하나 더 띄울 때 (현재 동작)

셸 판 be-run 은 **이번에 고른 모듈만** 이전 실행에서 가져온다. 이전 be-run 은 끝나지 않고, 그 be-run 이 맡은 다른 모듈은 계속 돈다.
예를 들어 `./be-run.sh --mcm --mdm --analog` 가 도는 중에 다른 터미널에서 `./be-run.sh --mcm` 을 실행하면 mcm 앱 JVM 만 새로 뜨고 mdm·analog 는 그대로다.

- 방식(`be-run.sh` 의 「모듈 소유 기록」·`take_over_modules`) — 체크아웃의 `.be-run/<모듈>.own`(gitignore)에 `<맡은 be-run pid> <앱 JVM pid>` 를 남긴다.
  새 실행은 고른 모듈의 기록을 먼저 자기 것으로 바꾼 뒤, 이전에 맡았던 앱 JVM(java 이고 작업 디렉터리가 이 체크아웃 모듈 폴더일 때만)을 TERM → 대기 → KILL 한다.
  이전 be-run 은 기록이 넘어간 모듈을 「이어받았다」 로 알리고 더 관리하지 않으며, 나중에 cleanup 을 돌아도(Ctrl+C·남은 모듈 종료) 넘어간 모듈의 JVM·포트는 건드리지 않는다.
  모듈을 전부 가져가면 이전 be-run 은 맡은 모듈이 없어 스스로 끝난다.
- 새 판 be-run 은 살아 있는 동안 `.be-run/<pid>.alive` 표식을 둔다. 표식이 없는 예전 버전 be-run 은 종전처럼 통째로 끝낸다(TERM 뒤 cleanup 을 최대 30초 기다리고, 남으면 KILL).
  **예전 판에서 새 판으로 바꾸는 첫 재기동 한 번은 모든 모듈이 한 번 내려간다.** 새 판으로 띄운 뒤부터 모듈 단위로 갈아 끼울 수 있다. 시작한 지 3초가 안 된 be-run 은 표식을 만들기 전일 수 있어 건드리지 않는다.
- 소유 기록의 읽기·쓰기는 `.be-run/lock.d`(mkdir 잠금, 최대 5초 대기, 죽은 pid 의 잠금은 바로 치움)로 묶는다. 같은 모듈을 동시에 시작하면 나중에 기록한 쪽이 이기고, 진 쪽은 모듈을 띄우지 않거나 방금 띄운 JVM 을 내린다(고아 없음).
  기록한 be-run 이 죽었으면(강제 종료·선빌드 실패) 낡은 기록이라 무시한다. cleanup 은 신호를 보내기 직전에 소유와 앱 JVM(java·작업 디렉터리)을 다시 확인한다.
- 맡은 모듈을 다른 be-run 이 모두(또는 일부) 이어받아 끝나는 be-run 은 종료 코드 **79** 로 끝난다(`scripts/lib/proc.sh` 의 `BE_RUN_HANDED_OVER_RC`).
- 셸 판이 끝내는 be-run 은 **이 체크아웃의** 것뿐이다(명령줄 절대경로나 작업 디렉터리로 판정). 다른 워크트리·체크아웃의 be-run 과
  자기를 띄운 부모(`local-run.sh`)는 건드리지 않는다.
- `--dry-run` 은 기록을 읽기만 해서 모듈마다 어느 be-run 의 어느 앱 JVM 을 내릴지 보인다.
- 회귀 시험: `scripts/tests/be-run-restart.sh`(가짜 앱 3개, 포트 38092~38191, 이 체크아웃의 서버·DB 를 쓰지 않는다).
- ps1 판(`be-run.ps1` 의 `Stop-PreviousBeRuns`)은 아직 종전 동작이다 — 명령줄에 `be-run.ps1` 이 든 **PC 의 모든 프로세스**를 끝낸다(체크아웃을 가리지 않는다).
  taskkill `/T` 뒤 30초 안에 끝나지 않으면 `/F`. 그래서 ps1 판에서는 한 모듈만 다시 띄우면 이전 실행이 통째로 끝난다.
- `local-run` 이 도는 중에 따로 be-run 을 실행해 그 be-run 이 모듈을 모두 이어받으면, local-run 은 종료 코드 79 로 이를 알아보고 프론트를 내리거나 잔존 프로세스를 정리하지 않는다(안내만 남기고 계속 돈다).
  다른 이유로 be-run 이 끝나면 종전대로 프론트까지 내리고, 명령줄에 이 체크아웃 `src/` 경로가 든 프로세스를 쓸어 담는다. local-run 을 끝낼 때의 정리도 같다.

여러 모듈을 처음부터 함께 띄우려면 한 번의 be-run 에 모듈을 같이 준다 — `./be-run.sh --mcm --mdm` 또는 `--all`.
이미 돌던 구성에 모듈을 더할 때는 더할 모듈만 `./be-run.sh --mdm` 처럼 따로 띄워도 앞의 모듈은 그대로 산다(각 실행이 맡은 모듈만 관리한다).
로컬 기본 구성으로 굳히려면 `.run.env` 의 `BE_RUN_ARGS` 에 적는다.

### .run.env 와 환경변수 우선순위

셸 판(`be-run.sh`·`fe-run.sh`·`local-run.sh`)은 `.run.env` 를 셸 스크립트로 실행(`. .run.env`)하고, ps1 판은 `이름=값` 줄을 글자로 읽는다.
그래서 같은 설정이 다르게 먹을 수 있다.

| 항목 | 셸 판 (sh) | ps1 판 |
|---|---|---|
| `.run.env` 읽는 방식 | 셸로 실행(source) — 셸 문법을 다 쓸 수 있다 | `이름=값` 줄만 정규식으로 읽고 값 양끝 따옴표를 뗀다. `export 이름=…` 줄은 못 읽고, 줄 끝 주석은 값에 섞인다 |
| 같은 이름이 여러 줄 | 마지막 줄이 이긴다 | 첫 줄이 이긴다 |
| `BE_PREBUILD` · `BE_PREBUILD_CONTINUE` | `.run.env` 에 있으면 **`.run.env` 가 이긴다**(환경변수를 덮어쓴다). 없을 때만 환경변수 | **환경변수가 이긴다.** 비어 있을 때만 `.run.env` |
| `BE_RUN_ARGS` · `FE_RUN_ARGS` · `LOCAL_RUN_ARGS` | `.run.env` 가 이기고, 거기 없으면 환경변수도 읽힌다 | `.run.env` 만 읽는다(환경변수는 보지 않는다) |
| `DEV_LOG_COLOR` | 위와 같은 순서(`.run.env` → 환경변수) | 해당 기능이 없다 |
| 포털 포트 | `modules.conf` 값을 `.run.env` 의 `PORTAL_PORT` 가 덮을 수 있다(`fe-run.sh`·`local-run.sh`) | `modules.conf` 값만 쓴다 |
| `*_RUN_ARGS` 가 붙는 때 | 공통 — 명령줄에 대상 플래그(be: 모듈, fe·local: `--all`·`--mpn`·`--mdm` 등 범위)가 없을 때만 | 같음(ps1 판 `local-run` 의 범위 플래그는 `--all`·`--full`·`--mpn`·`--mpn-only`) |

- 셸 판에서 한 번만 다른 값으로 돌리려면(`BE_PREBUILD=0 ./be-run.sh …`) `.run.env` 에 그 변수를 두지 않는다. 두면 `.run.env` 값이 이긴다.
- `dmes-up.ps1 -Detach` 는 백엔드·프런트를 WMI 로 띄우므로 호출한 창의 환경변수가 전달되지 않을 수 있다(미검증) — 이때 `BE_PREBUILD*` 는 `.run.env` 에 둔다.

### Windows 한 번에 띄우기 (dmes-up)

`dmes-up.cmd`(→ `dmes-up.ps1`)는 JDK 21 지정 → `gradle-wrapper.jar` 보충 → 이 저장소의 이전 실행·포트 정리 → BE + FE 기동을 한 번에 한다.
백엔드 대상은 `-Detach`·`-Be` 면 `be-run.ps1 --all`(ps1 판 6개 모듈), 옵션 없는 포그라운드면 `local-run.ps1` 을 거쳐 `.run.env` 의 `BE_RUN_ARGS`(없으면 `--all`)다.

| 옵션 | 동작 |
|---|---|
| (없음) | 포그라운드 — `local-run.ps1` 로 띄우고 이 창의 Ctrl+C 로 함께 끈다 |
| `-Detach` | 백그라운드 — 이 창을 닫아도 남는다. 로그 `logs\be.log`·`logs\fe.log`, 끄기는 `dmes-down.cmd`. 포트가 다 열릴 때까지 최대 8분(선빌드 포함) 기다리고, 백엔드가 포트를 열기 전에 끝나면(선빌드 실패 등) 함께 띄운 FE 를 정리하고 `1` 로 끝난다 |
| `-Be` / `-Fe` | 한쪽만 |
| `-Full` | FE 를 install·build 부터(`--all`). 주지 않으면 `--all -q` |
| `-Clean` | `-Full` 과 같다 |
| `-Warmup` | **아무 동작도 하지 않는다.** 예전 모듈별 직렬 warm-up 은 be-run.ps1 선빌드로 바뀌었고, 옛 명령이 깨지지 않게 받아 두기만 한다(백엔드를 띄울 때(`-Be`) 주면 "더 필요 없다" 안내만 내고, `-Fe` 만 줄 때는 아무 출력도 없다) |
