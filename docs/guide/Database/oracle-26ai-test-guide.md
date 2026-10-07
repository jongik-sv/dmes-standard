# 오라클 26ai Free 로컬 DB 테스트 가이드 (Podman 기반)

본 문서는 로컬 개발 및 테스트 환경에서 **Podman**을 기본 도구로 사용하여 **Oracle 26ai Free**를 가볍고 빠르게 구동하기 위한 표준 가이드입니다.  
Docker Desktop의 **기업 유료 라이선스 제약**을 피하고, **Mac(Apple Silicon)과 Windows(WSL2)** 양쪽 환경에서 동일한 설정과 **`podman compose`**(또는 Docker 호환 모드) 명령어로 테스트할 수 있도록 구성되었습니다.

---

## 1. 핵심 아키텍처 및 선정 이유

| 구성 요소 | 표준 선택 | 선정 이유 및 특징 |
| :--- | :--- | :--- |
| **DBMS 버전** | **Oracle 26ai Free** | 23ai의 AI Vector Search 등 신기능을 안정화한 차세대 **장기 지원(LTS)** 릴리스 |
| **컨테이너 도구** | **Podman / Podman Desktop (표준)** | **기업 라이선스 100% 무료 (Apache 2.0)**, Rootless 보안, Mac/Windows 동일 UI/CLI |
| **컨테이너 이미지** | **`gvenzl/oracle-free:slim-faststart`** | **5~10초 초고속 기동**, ~1.5GB 경량화, Mac(ARM64) & Windows(x86) 네이티브 지원 |
| **명령어 환경** | **Podman CLI / Compose 기본** | `podman compose` 표준 사용 (필요시 Docker 호환 모드로 `docker` 명령어 병행 가능) |

---

## 2. Oracle Database Free 리소스 제약 기준

Oracle Database Free 에디션은 엔진 내부적으로 하드웨어 상한선이 고정되어 있습니다.

* **메모리(RAM):** 최대 **2 GB** (SGA + PGA 합산, 인스턴스 하드 리밋)
* **CPU:** 최대 **2 Core / Thread** (포그라운드 프로세스 기준)
* **사용자 데이터 스토리지:** 최대 **12 GB** (SYSTEM 테이블스페이스 제외)
* **호스트 권장 할당 메모리:** 최소 **3.5 GB ~ 4 GB 이상** (컨테이너 OS 및 백그라운드 프로세스 감안)

---

## 3. 컨테이너 이미지 비교

| 항목 | `gvenzl/oracle-free:slim-faststart` (표준 추천) | `container-registry.oracle.com/database/free:latest-lite` (공식 OCR) | `gvenzl/oracle-free:full` (전체판) |
| :--- | :--- | :--- | :--- |
| **기동 속도** | **약 5 ~ 10초** (`faststart` 스냅샷) | 약 3 ~ 5분 (최초 인스턴스 생성 필요) | 약 3 ~ 5분 |
| **이미지 크기** | **약 1.5 GB** (`slim`) | 약 1.5 GB (`lite`) | 약 9 GB ~ 10 GB |
| **다운로드 인증** | **로그인 불필요 (Docker Hub)** | Oracle 계정 로그인 필수 (`docker login`) | 로그인 불필요 (Docker Hub) |
| **제공 기능** | 핵심 RDBMS + AI Vector Search | 핵심 RDBMS + AI Vector Search | MLE(DB 내 JS 실행) 등 전체 기능 |
| **적합 용도** | **로컬 단위/통합 테스트, CI/CD** | 사내 보안 규정상 공식 이미지만 써야 할 때 | 전체 엔터프라이즈 부가기능 검증 |

---

## 4. 환경별 초기 설치 및 1회 필수 설정

### 4.1. Mac 환경 (macOS / Apple Silicon M시리즈 & Intel)

1. **설치:** [podman-desktop.io](https://podman-desktop.io/)에서 다운로드 또는 Homebrew 설치
   ```bash
   brew install --cask podman-desktop
   ```
2. **Podman Machine 생성:**
   - Podman Desktop 실행 후 안내에 따라 Machine 생성
   - **권장 사양:** CPU **2 코어 이상**, Memory **4 GB 이상**
3. **Docker 명령어 호환 모드 (선택/권장):**
   - Podman Desktop ➡️ **Settings(설정)** ➡️ **Resources** ➡️ **Podman Machine**
   - **`Enable Docker Socket`** 및 **`docker CLI symlink`** 체크 시 기존 `docker` 명령어 그대로 병행 가능
4. **CLI 만으로 설치할 때(sudo 권한 없이 가능):** `podman compose` 는 `docker-compose` 를 불러 쓰므로 함께 설치합니다.
   ```bash
   brew install podman docker-compose
   podman machine init --cpus 2 --memory 4096 --disk-size 40
   podman machine start
   # (선택) docker 명령 병행: Docker Socket 설정에 sudo 가 필요하면 PATH 의 개인 bin 에 링크
   ln -s /opt/homebrew/bin/podman ~/bin/docker
   ```
   > 링크 방식은 `docker` CLI 명령만 대체합니다. 소켓에 직접 붙는 도구는 §8-6 을 따릅니다.
5. **쿠버네티스는 켜지 않습니다:** Podman Desktop 첫 실행 안내의 Kind·Minikube 설치는 Skip 하고, 이미 켰다면 Settings ➡️ Extensions 에서 Disable 합니다.

### 4.2. Windows 환경 (WSL2 기반)

1. **설치:** [podman-desktop.io](https://podman-desktop.io/)에서 Windows용 설치 파일(EXE) 실행 (WSL2 자동 연동)
2. **WSL2 메모리 최적화 (`C:\Users\<사용자계정>\.wslconfig` 설정):**
   ```ini
   [wsl2]
   memory=6GB
   processors=4
   autoMemoryReclaim=gradual
   networkingMode=mirrored
   ```
   > 설정 후 PowerShell에서 `wsl --shutdown` 실행 후 재시작
3. **프로젝트 작업 디렉터리 권장:**
   - Windows C드라이브(`/mnt/c/...`) 대신 **WSL2 리눅스 내부 파일시스템(`\\wsl$\Ubuntu\home\<사용자>\...`)**에 프로젝트를 두고 작업해야 I/O 속도가 5~10배 빠릅니다.

---

## 5. 프로젝트 표준 `docker-compose.yml`

Mac과 Windows 개발자가 Git으로 그대로 공유하여 실행할 수 있는 단일 설정입니다. 저장소의 [`tools/oracle-free/docker-compose.yml`](../../../tools/oracle-free/docker-compose.yml) 에 있으므로 그 폴더에서 실행합니다.

> `version:` 항목은 최신 Compose 에서 쓰이지 않아 넣지 않습니다. 이미지 이름은 Podman 이 레지스트리를 묻지 않도록 `docker.io/` 를 붙여 적습니다.

```yaml
services:
  oracle-db:
    image: docker.io/gvenzl/oracle-free:slim-faststart
    container_name: oracle-26ai-free
    ports:
      - "1521:1521"
    environment:
      # SYS / SYSTEM 관리자 비밀번호
      ORACLE_PASSWORD: "sys_password_123"
      # 프로젝트용 일반 사용자 자동 생성 (선택 사항)
      APP_USER: "dmes_user"
      APP_USER_PASSWORD: "dmes_password_123"
    volumes:
      # Podman Rootless 권한 에러를 방지하는 네임드 볼륨 (데이터 영구 유지)
      # (gvenzl 이미지의 데이터 경로는 /opt/oracle/oradata)
      - oracle-data:/opt/oracle/oradata:Z
      # 최초 구동 시 자동 실행할 DDL/DML 초기화 스크립트가 있다면 매핑
      # - ./init-scripts:/container-entrypoint-initdb.d

volumes:
  oracle-data:
```

---

## 6. 테스트 실행 및 검증 명령어 (Podman 기본)

Podman 환경을 기본으로 실행하며, Docker 호환 모드를 켠 경우 `docker` 명령어로도 동일하게 작동합니다.

### 6.1. DB 컨테이너 실행
```bash
# Podman 기본 실행 (백그라운드, 최초 실행 시에도 10초 내 기동 — 이미지 내려받기 시간 제외)
cd tools/oracle-free
podman compose up -d

# (Docker 호환 모드 사용 시)
# docker compose up -d
```

### 6.2. 기동 상태 및 로그 확인
```bash
# Podman 기본: 실시간 기동 로그 확인
podman compose logs -f

# 아래 메시지가 출력되면 테스트 준비 완료
# "DATABASE IS READY TO USE!"

# 버전 확인 (Oracle AI Database 26ai Free Release 23.26.x 가 나오면 정상)
podman exec oracle-26ai-free bash -c "echo 'select banner_full from v\$version;' | sqlplus -s dmes_user/dmes_password_123@localhost/FREEPDB1"
```

### 6.3. 컨테이너 프로세스 확인
```bash
podman ps
```

### 6.4. 접속 정보 및 클라이언트(DBeaver, IntelliJ, SQLcl) 연결

* **Host:** `localhost`
* **Port:** `1521`
* **Database / Service Name:** `FREEPDB1`
* **JDBC URL:** `jdbc:oracle:thin:@localhost:1521/FREEPDB1`
* **접속 계정:**
  - **관리자 계정:** `SYS` (접속 역할: `SYSDBA`, 비밀번호: `sys_password_123`)
  - **일반 계정:** `dmes_user` (비밀번호: `dmes_password_123`)

### 6.4.1. 레인별 PDB 와 동시 OPEN 상한

레인(워크트리)·자동 시험은 PDB 를 복제해 쓴다. 도구·이름 규칙·운용 규칙은 [`scripts/oracle/README.md`](../../../scripts/oracle/README.md), 스키마 소유표·연결 규약은 [`docs/oracle-1007/schema-owners.md`](../../oracle-1007/schema-owners.md) 에 있다.

* 동시에 열린 PDB 수 상한은 환경 변수 `DMES_ORA_MAX_OPEN`(기본 **3** = FREEPDB1 + 템플릿 1 + 작업 1)으로 정한다. 기본값을 그대로 쓰고(VM 3GB 기준, §8-5), 2GB 머신은 3 을 넘기지 않으며, 4GB 이상·기본 SGA 인 PC 는 메모리 여유만큼 올린다(예: `export DMES_ORA_MAX_OPEN=5`). 2GB 에서 4개를 열면 인스턴스가 내려간다.

### 6.4.2. 레인 PDB·시험 PDB 사용법

PDB 이름은 접두로 용도를 나눈다. 도구는 이 세 접두의 PDB 만 만들고 지운다(`FREEPDB1` 과 조정자 데이터는 건드리지 않는다).

| 접두 | 용도 | 수명 |
| :--- | :--- | :--- |
| `TPL_<태그>` | 복제 원본 템플릿(`TPL_EMPTY` 사용자만, `TPL_SCHEMA` 표만, `TPL_DATA` 표와 데이터) | 닫아 두고 복제 때만 읽기 전용으로 잠깐 연다 |
| `L_<레인>` | 레인 개발·E2E·로컬 서버 확인용 | 쓰는 동안만 `open`, 끝나면 `close`(데이터는 남는다) |
| `T_<레인>` | 자동 시험용 | Gradle 이 복제 → 시험 → 삭제를 한 번에 한다 |

```bash
node scripts/oracle/pdb.mjs clone TPL_EMPTY L_ORA_MDM     # 레인 PDB 만들기(없을 때 한 번)
node scripts/oracle/pdb.mjs open L_ORA_MDM                # 서버를 띄우거나 시험하기 전에 연다
node scripts/oracle/pdb.mjs url L_ORA_MDM                 # JDBC URL 확인
./be-run.sh --mdm --pdb=L_ORA_MDM                         # 그 PDB 로 로컬 서버 기동(--pdb 가 없으면 종전 동작)
node scripts/oracle/pdb.mjs close L_ORA_MDM               # 다 쓰면 닫는다(drop 은 데이터까지 지운다)

# 자동 시험: 빌드 한 번에 T_<레인> 복제 → 시험 → 삭제
cd src/backend/mdm && ../gradlew test -Pdmes.ora.test=clone
# 이미 있는 PDB 로 시험하려면(복제·삭제 없음)
cd src/backend/mdm && ../gradlew test -Pdmes.ora.pdb=L_ORA_MDM
```

시험 JVM 은 `-Duser.timezone=Asia/Seoul` 이고 Hikari 풀은 3 으로 제한된다. 접속 규약·스키마 소유표는 [`schema-owners.md`](../../oracle-1007/schema-owners.md) 가 정본이다.

### 6.4.3. PC 잠금 규칙

인스턴스 하나를 PC 의 모든 레인·시험이 나눠 쓰므로 무거운 작업은 PC 전체에서 한 번에 하나만 돈다(잠금 폴더 `$TMPDIR/dmes-ora-pdb.lock`).

* `clone`·`open`·`drop`·`template-*` 는 잠금을 잡고, 다른 작업이 쥐고 있으면 끝날 때까지 기다린다(기다리는 한도 `DMES_ORA_LOCK_WAIT_SEC`, 기본 900초).
* `-Pdmes.ora.test=clone`(또는 `-Pdmes.ora.pdb=…`) 시험 빌드는 복제 직전부터 PDB 를 지울 때까지(시험 JVM 이 도는 구간 포함) 같은 잠금을 쥔다. 기다리는 한도는 `DMES_ORA_HARNESS_LOCK_WAIT_SEC`(기본 7200초)이다. Gradle 이 죽어도 잠금 주인이 스스로 놓는다.
* Oracle 시험(gradle)은 PC 전역 무거운 명령 슬롯(`heavy.sh`)도 거치며, 슬롯이 차 있으면 기본 90초 뒤 `HEAVY_BUSY`(exit 75)로 끝난다. Oracle 시험은 **`DFLOW_HEAVY_WAIT=1800`** 으로 걸어 차례를 기다린다(예: `DFLOW_HEAVY_WAIT=1800 .claude/skills/dflow-dev/scripts/heavy.sh ../gradlew test -Pdmes.ora.test=clone`).
* `close` 는 잠금을 잡지 않고 바로 실행한다(열린 PDB 와 메모리를 줄이는 쪽이라 시험과 겹쳐도 안전하다).
* 명령을 중간에 끊으면(SIGTERM·SIGINT) `pdb.mjs` 가 자식 `podman exec` 를 먼저 끊고 잠금을 놓는다. sqlplus 한 번이 `DMES_ORA_SQL_TIMEOUT_SEC`(기본 1200초)를 넘기면 끊고 실패로 본다.
* 인스턴스가 느릴 때 상태 확인용 sqlplus 를 계속 보내지 않는다(대기 세션만 쌓인다). 응답이 2분 넘게 없으면 보낸 쪽이 끊는다.

### 6.4.4. 로컬 데이터 넣기(snapshot import)

데이터 원본은 git 에 올라 있는 표별 CSV(`db-snapshot/<스키마>/*.csv`, UTF-8·LF·PK 순·NULL 은 `\N`·BLOB 은 `b64:`)이고, 적재기는 `scripts/db-snapshot/snapshot.py`(`python3` + `pip install oracledb`)다. 데이터만 넣으므로 표는 Flyway(또는 `template-schema`)가 먼저 만든 것이어야 한다.

```bash
# 레인 PDB 에 넣기(스키마를 생략하면 db-snapshot 아래 전부)
python3 scripts/db-snapshot/snapshot.py import --pdb L_ORA_MDM MDMAPUSER
python3 scripts/db-snapshot/snapshot.py import --pdb L_ORA_MDM --replace MCMAPUSER   # 초기 행까지 CSV 로 덮기

# 처음부터 데이터가 든 PDB 가 필요하면 템플릿에서 복제
node scripts/oracle/pdb.mjs template-schema TPL_SCHEMA   # 전 모듈 V 파일 적용, 데이터 없음
node scripts/oracle/pdb.mjs template-data TPL_DATA       # 그 위에 CSV 적재(mdm 약 6분)
node scripts/oracle/pdb.mjs clone TPL_DATA L_ORA_MDM

# 스냅샷 갱신: 레인 PDB -> CSV
python3 scripts/db-snapshot/snapshot.py export --pdb L_ORA_MDM
```

* 값 변환: epoch(초·밀리초) 시각은 KST 로, 빈 문자열은 NULL 로 바꾼다. 용어 임베딩(`TB_MDM_TERM.EMBEDDING`)과 비밀번호·키·로그 표는 비어 있거나 제외된다.
* 코드 원장 3표는 `MCM_SOURCE` 와 `MCMAPUSER` 양쪽에 들어가고, `MCM_BACKUP` 은 비워 둔다. `TB_MCA_*` 동적 표는 적재기가 만든다.
* 마이그레이션 `V1` 은 dev 에 머지된 뒤 고치지 않는다(체크섬이 달라진다). 바꿀 일은 `V2` 이상으로 추가한다. 옛 `V1` 이 적용된 레인 PDB 는 `template-schema --rebuild` 로 템플릿을 다시 만들고 레인 PDB 를 다시 복제한다.
* 데이터 보정(`FORM_URL`·폴더 `USE_TP`)은 SQLite 에서 CSV 로 바꾸는 `convert` 단계에서 한 번 한다.

### 6.5. 컨테이너 정지 및 데이터 리셋

```bash
# 1. DB 일시 정지 (데이터 유지)
podman compose down
# (Docker 호환 모드: docker compose down)

# 2. 데이터 완전 초기화 (새로운 DB 상태로 리셋하고 싶을 때)
podman compose down -v
# (또는 podman volume rm oracle-free_oracle-data)
```

---

## 7. (참고) 옛 SQLite 데이터를 Oracle 로 옮기기

> 로컬 DB 가 Oracle 로 바뀌면서 이 절은 이관 크기 측정·방언 비교용 참고 자료가 되었다. 로컬 데이터는 §6.4.4 의 `snapshot.py import` 로 넣는다. 아래 도구(`tools/oracle-free/*.py`·`scripts/db-snapshot/{export,import}.sh`)는 SQLite 원본이 있을 때만 쓴다.

### 7.0. 옛 스냅샷에서 적재하기(참고)

git 에 올라 있는 `db-snapshot/` 만으로 로컬 Oracle 에 같은 데이터를 넣는다(원본 `src/backend/data/*.db` 가 없어도 된다). Oracle 컨테이너가 떠 있고 `pip install oracledb` 가 되어 있으면 된다.

```bash
python3 tools/oracle-free/load_snapshot.py                 # db-snapshot/ 아래 전부(mdm mcm) -> 스키마 MDM·MCM
python3 tools/oracle-free/load_snapshot.py mdm --drop      # 하나만, 스키마가 이미 있으면 지우고 다시 적재
```

* [`load_snapshot.py`](../../../tools/oracle-free/load_snapshot.py) 는 스냅샷을 임시 SQLite 로 복원(`scripts/db-snapshot/import.sh` 와 같은 순서)한 뒤 아래 `sqlite_to_oracle.py` 로 적재하고, 임시 파일은 지운다. 셸·`sqlite3` 명령 없이 파이썬만 쓰므로 윈도우에서도 같다.
* 스키마가 이미 있는데 `--drop` 이 없으면 아무것도 하지 않고 멈춘다. 끝에 스키마별 표 수·행수 일치 여부를 요약한다.
* 스냅샷을 최신으로 바꾸는 쪽은 `scripts/db-snapshot/export.sh`(로컬 SQLite -> `db-snapshot/`)다. 스냅샷에 없는 것은 Oracle 에도 없다.
* 용어 임베딩(`TB_MDM_TERM.EMBEDDING`)은 스냅샷에서 NULL 이라 Oracle 에서도 NULL 이다. 다시 계산하는 법은 `db-snapshot/README.md` 참고.
* 비밀번호·키·로그 표(`TB_MCM_SEC_USER_PWD`·`TB_SEC_KEY_STORE`·`TB_SEC_LOGIN_LOG` 등)는 스키마만 있고 비어 있으며, 사용자 표는 `admin` 행만 있다. admin 비밀번호는 mcm 서버를 기동할 때 `admin123` 으로 채워진다.

### 7.0.1. 로컬 SQLite 를 직접 옮길 때

[`tools/oracle-free/sqlite_to_oracle.py`](../../../tools/oracle-free/sqlite_to_oracle.py) 는 SQLite 파일 하나를 Oracle 스키마(사용자) 하나로 옮긴다. 데이터 크기 측정·방언 차이 확인용이며, 앱 설정은 바꾸지 않는다. 스냅샷이 아니라 지금 로컬 DB 전체(사용자·로그 포함)를 옮긴다.

```bash
# 1. 원본은 로컬 서버가 쓰고 있을 수 있으므로 사본을 뜬다(원본 직접 지정 금지)
mkdir -p /tmp/ora-mig
for d in mdm mcm mls mpn mpp mqc caravan-console; do
  sqlite3 src/backend/data/$d.db ".backup /tmp/ora-mig/$d.db"
done

# 2. DB 하나 = 스키마 하나. 여러 개를 동시에 돌려도 된다
python3 tools/oracle-free/sqlite_to_oracle.py --sqlite /tmp/ora-mig/mdm.db --schema MDM --drop --report /tmp/ora-mig/mdm.json
```

* **필요 조건:** `python3` + `oracledb` 패키지(thin 모드, `pip install oracledb`).
* **스키마:** SYSTEM 으로 만들고 비밀번호는 `dmes_password_123` 이다. `--drop` 은 MDM·MCM·MLS·MPN·MPP·MQC·CARAVAN_CONSOLE 과 `TMP_` 접두 스키마만 지우고 다시 만든다(`dmes_user` 등 다른 사용자는 건드리지 않음).
* **선택 인자:** `--batch`(기본 1000행), `--epoch-tz`(기본 UTC), `--tables`(일부 테이블만), `--report`(요약 JSON), `--dsn`·`--system-password`(환경변수 `ORA_DSN`·`ORA_SYSTEM_PASSWORD`).
* **결과 출력:** 테이블별 SQLite·Oracle 행수 대조, 건너뛴 항목, 스키마 크기(`dba_segments`, 테이블·인덱스·LOB 별 MB).

### 7.1. 변환 규칙과 한계

| 항목 | 처리 |
| :--- | :--- |
| 문자열 | `VARCHAR2(n CHAR)`. 실제 값이 4000바이트를 넘으면 `CLOB` |
| 정수·실수·BOOLEAN | `NUMBER(19)` · `BINARY_DOUBLE` · `NUMBER(1)` |
| 시각 | `TIMESTAMP(6)`. epoch 밀리초 숫자는 UTC 기준 변환, 문자열 값은 원문 그대로 |
| 빈 문자열 | Oracle 은 NULL 로 저장하므로, 빈 문자열이 있는 NOT NULL 컬럼은 NOT NULL 을 푼다 |
| 옮기지 않음(보고만) | 부분 인덱스(WHERE)·식 인덱스, CHECK·FK, 뷰·트리거, 함수식 DEFAULT, AUTOINCREMENT(IDENTITY 미적용) |

> 위 한계 때문에 이관 결과는 크기 측정·조회 시험용이다. 앱을 Oracle 에 연결하려면 IDENTITY·부분 인덱스 대체·뷰를 따로 보완해야 한다.

### 7.2. 실측 (2026-10-07, MacBook Air M5 · Podman VM 2GB · SGA 900M)

| 스키마 | 테이블 | 행수 | Oracle 크기 |
| :--- | ---: | ---: | ---: |
| MDM | 40 | 42,889 | 98.9 MB (LOB 73.6) |
| MCM | 58 | 1,704 | 5.9 MB |
| 그 밖 5개 | 2~4 | 1~10 | 각 0.2~0.4 MB |

* 모든 테이블의 행수가 일치했고, MDM 은 약 40초 걸렸다.
* MDM LOB 72MB 는 용어 임베딩(`TB_MDM_TERM.EMBEDDING`, 행당 4096바이트)이다. 값이 행 안 저장 한도(약 4000바이트)를 넘어 행마다 별도 8KB 청크를 쓰므로 원래 크기(32MB)의 두 배가 넘는다.
* 업무 데이터는 약 34MB 라 버퍼 캐시(552MB)에 모두 올라간다.

---

## 8. 주요 트러블슈팅

1. **Podman 머신이 멈추거나 시작되지 않을 때:**
   - Mac: 터미널에서 `podman machine stop` 후 `podman machine start`로 재시작합니다.
   - Windows: PowerShell에서 `wsl --shutdown` 후 Podman Desktop 재실행.
2. **컨테이너가 `Exited (137)` (OOM 메모리 부족 에러)로 비정상 종료될 때:**
   - 호스트/가상머신의 메모리가 부족한 경우입니다.
   - Mac: Podman Desktop Settings ➡️ Resources에서 Machine Memory를 **4GB 이상**으로 증설.
   - Windows: `.wslconfig`의 `memory=6GB` 설정 확인.
3. **볼륨 마운트 권한 에러 (`Permission Denied`):**
   - 로컬 디렉터리 바인드 마운트(`./data:/opt/oracle/oradata`) 대신 반드시 `volumes:` 섹션에 정의된 **네임드 볼륨(`oracle-data:/opt/oracle/oradata`)**을 사용하십시오 (Podman Rootless 환경 완벽 호환).
4. **재기동 시 `ORA-01078` / `LRM-00109: could not open parameter file '.../initFREE.ora'` 로 종료될 때:**
   - Podman 머신의 SELinux 가 첫 컨테이너가 볼륨으로 옮긴 spfile 에 그 컨테이너 전용 라벨을 붙여, 다음 컨테이너가 읽지 못하는 경우입니다.
   - 볼륨 매핑 끝에 `:Z` 를 붙입니다(`oracle-data:/opt/oracle/oradata:Z`, §5 표준 설정에 반영됨). 기존 볼륨도 그대로 `podman compose down` → `up -d` 하면 복구됩니다.
5. **Podman 머신 메모리: 3GB 를 권장합니다(2GB 는 SGA 900M 에서도 스래싱했습니다):**
   - 기본값(SGA 1536M + PGA 512M)은 2GB 머신에서 `ORA-01092` 로 기동에 실패합니다. 2GB 에서는 SGA 900M·PGA 200M 로 낮춰야 기동하고(머신 여유 약 280MB), 레인·시험이 PDB 를 복제하고 시험 JVM 이 접속을 열면 가용 메모리가 50MB 아래로 떨어져 2026-10-07 에 세 번 스래싱했습니다(§8-7). 그래서 **Podman 머신 메모리는 3GB(cpus 2)로 둡니다.**
   - 3GB 에서의 설정값(2026-10-07 사용자 결정·실측): SGA `900M`, PGA 목표 `pga_aggregate_target=400M`, `pga_aggregate_limit=2G`, `control_management_pack_access=NONE`, 루트 AWR 스냅숏 간격 0(끔). PGA 목표를 200M 에서 올린 이유는 실측에서 목표 200M 에 할당이 286M 까지 늘고 초과 할당이 50회 났기 때문입니다. SGA 는 문제가 생길 때만 1200M 로 올립니다.
   - 올리는 절차(컨테이너 데이터는 볼륨에 남습니다):
     ```bash
     podman compose down                     # 컨테이너만 내림(-v 를 붙이지 않는다)
     podman machine stop && podman machine set --memory 3072 --cpus 2 && podman machine start
     podman compose up -d
     ```
   - SGA·PGA 를 바꾸는 절차(2GB 로 줄이거나 값을 고칠 때, 값은 상황에 맞게):
     ```bash
     podman compose down
     podman run --rm --entrypoint bash -v oracle-free_oracle-data:/opt/oracle/oradata:Z \
       docker.io/gvenzl/oracle-free:slim-faststart -c '
       D=/opt/oracle/oradata/dbconfig/FREE; P=/tmp/initFREE.ora
       ln -sf $D/spfileFREE.ora $ORACLE_HOME/dbs/spfileFREE.ora
       echo "create pfile='\''$P'\'' from spfile;" | sqlplus -s / as sysdba
       sed -i -E "/sga_target|sga_max_size|pga_aggregate_target|pga_aggregate_limit/d" $P
       printf "*.sga_target=900M\n*.sga_max_size=900M\n*.pga_aggregate_target=400M\n*.pga_aggregate_limit=2G\n" >> $P
       echo "create spfile='\''$D/spfileFREE.ora'\'' from pfile='\''$P'\'';" | sqlplus -s / as sysdba'
     podman compose up -d
     ```
   - `pga_aggregate_limit` 은 최소값이 2048M 이라 그보다 낮추면 `ORA-00093` 이 납니다(2GB 머신에서는 지정하지 않습니다).
   - 볼륨을 지우고(`down -v`) 새로 만들면 기본값으로 돌아가므로 위 설정과 `job_queue_processes=0`(자동 작업·통계 수집 정지)을 다시 적용합니다(조정자에게 알립니다).
6. **IDE나 외부 도구(Testcontainers 등)에서 소켓 인식 실패 시:**
   - Podman Desktop 설정에서 `Docker Socket`이 켜져 있는지 확인하고, 필요 시 실제 소켓 경로를 조회해 환경 변수로 지정합니다(Mac 은 경로가 머신마다 다름):
     ```bash
     export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
     ```
7. **2GB VM 에서는 무거운 작업을 한 번에 하나만(스래싱 사례):**
   - 2026-10-07 18:24 여러 레인이 동시에 PDB 를 복제·삭제하고 시험 JVM 을 돌리자 VM 의 가용 메모리가 48MB, `kswapd` 38%, load 42 까지 올라 인스턴스가 스래싱했고 `sqlplus` 응답이 수 분씩 밀렸다. 같은 날 먼저 PDB 4개를 동시에 열었을 때는 서버 프로세스가 `ORA-03113` 으로 죽었다(`docs/oracle-1007/spike.md`).
   - 증상: `pdb.mjs list` 나 sqlplus 가 2분 넘게 응답이 없고 `podman exec` 세션이 쌓입니다. 이때 상태 확인을 더 보내지 않습니다(대기만 늘어납니다).
   - 원칙: ① 동시에 열린 PDB 는 3개 이하(`DMES_ORA_MAX_OPEN`) ② `clone`·`drop`·`open`·`template-*`·Oracle 시험 빌드는 PC 전체에서 하나(§6.4.3 의 PC 잠금) ③ 레인 PDB 는 쓸 때만 열고 `close` ④ 시험 PDB 는 복제 직후 시험하고 바로 삭제 ⑤ 인스턴스 부하를 줄이려고 `job_queue_processes=0`(자동 작업·통계 수집 정지)을 쓴다.
   - 복구: 조정자가 동결을 알리면 새 Oracle 명령을 멈추고, 진행 중인 `drop` 등 변경 작업은 끝나게 둡니다. 확인용으로 띄운 sqlplus 와 고아 `podman exec` 는 종료합니다. 인스턴스가 응답하면 재개합니다.
8. **Oracle 오류가 났을 때: VM 때문인지 코드 때문인지 먼저 가립니다:**
   - Oracle 시험 실패·접속 실패·시간 초과가 나면 **다시 돌리기 전에** VM 상태를 한 번 잽니다(Oracle 명령이 아닙니다): `podman machine ssh -- 'free -m; cat /proc/loadavg'`. 시험 하니스는 시험이 실패하거나 PDB 준비가 실패했을 때 같은 값을 `[dmes-ora] … VM available=…MB load=…` 한 줄로 남기고 VM 신호면 「VM 의심」 을 붙입니다.
   - 보고에는 오류 번호와 VM 값(available MB·load)을 함께 적습니다.

     | 구분 | 신호 | 처리 |
     | :--- | :--- | :--- |
     | VM 의심 | available 150MB 미만, load 10 이상, ORA-04031·04030·00020·00018·12516·12519·12520·3136·609·12751·00800·01092·00822, JDBC 접속·읽기 시간 초과 | 재실행하지 않고 조정자에게 「VM 의심」 으로 보고 |
     | 코드 | ORA-00942·00904·00001·01400·12899·00933 같은 SQL·제약 오류 | 평소대로 레인이 고침 |
   - 경고 로그에 `Time drifted`·ORA-3136·ORA-609·ORA-12751·ORA-00800 이 쌓였으면 그 시각은 스래싱 구간입니다. 같은 표는 `scripts/oracle/README.md` 「Oracle 오류 판별」 에도 있습니다.
9. **JPQL 에서 CLOB 칸에 `UPPER`·`LOWER`·`LIKE` 를 쓸 때 `FunctionArgumentException`:**
   - Hibernate 7.2.12 + Oracle 26ai 에서 `@Lob`(CLOB) 칸에 JPQL 문자열 함수·`LIKE` 를 쓰면 이 예외가 납니다(ora-mdm 실측).
   - 해결: 그 조회를 네이티브 SQL 로 바꾸거나(CLOB 은 `DBMS_LOB`·`TO_CHAR` 로 다룸), 값이 4000바이트를 넘지 않는 칸이면 `VARCHAR2(4000 CHAR)` 로 둡니다. 정본은 `docs/oracle-1007/schema-owners.md` §3.1.1 입니다.
10. **`@Column(name = "`OFFSET`")` 처럼 백틱을 쓴 칼럼은 `ORA-00904` 가 납니다(validate 로는 잡히지 않음):**
    - Hibernate 가 백틱 칼럼을 소문자 따옴표 식별자(`"offset"`)로 내보내는데, 표는 대문자(`OFFSET`)로 만들어져 있어 조회·저장 시점에 `ORA-00904: invalid identifier` 가 납니다. `ddl-auto=validate` 는 이 어긋남을 잡지 못하므로 실제 쿼리를 한 번 실행해 봐야 알 수 있습니다.
    - 해결: 예약어가 아니면 백틱을 뺍니다(`@Column(name = "OFFSET")`). Oracle 예약어(`LEVEL`·`COMMENT` 등)라서 따옴표가 꼭 필요하면 표의 DDL 도 같은 대소문자로 따옴표를 붙여 만들어야 합니다. 예약어 여부는 `select keyword from v$reserved_words where reserved = 'Y'` 로 확인합니다.
11. **`IDENTITY BY DEFAULT ON NULL` 은 명시한 ID 를 따라가지 않습니다:**
    - `GENERATED BY DEFAULT ON NULL AS IDENTITY` 칸에 ID 를 직접 넣어도 내부 시퀀스는 올라가지 않습니다. 그래서 명시 ID 와 자동 ID 를 섞어 쓰는 시험·골든은 번호가 어긋나거나, 자동 번호가 이미 넣은 값과 겹쳐 `ORA-00001`(PK 중복)이 납니다.
    - 해결: 시험·픽스처에서는 한쪽만 씁니다(전부 명시 또는 전부 자동). 섞어야 하면 넣은 뒤에 `alter table <표> modify <칼럼> generated by default on null as identity (start with limit value)` 로 시퀀스를 다시 맞춥니다(snapshot 적재기가 하는 것과 같은 방식). 골든 파일에 자동 번호를 기록하는 시험은 번호에 기대지 않게 고칩니다.
