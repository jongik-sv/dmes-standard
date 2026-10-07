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
   > 링크 방식은 `docker` CLI 명령만 대체합니다. 소켓에 직접 붙는 도구는 §7-4 를 따릅니다.
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

## 7. 주요 트러블슈팅

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
5. **Podman 머신 메모리를 2 GB 로 줄여 쓰고 싶을 때(메모리 16GB 이하 PC):**
   - 기본값(SGA 1536M + PGA 512M)은 2 GB 머신에서 `ORA-01092` 로 기동에 실패하므로, 먼저 SGA·PGA 를 줄입니다. 2026-10-07 MacBook Air(16GB)에서 SGA 900M·PGA 200M 로 정상 기동을 확인했습니다(머신 여유 약 280MB).
   - `pga_aggregate_limit` 은 최소값이 2048M 이라 낮추면 `ORA-00093` 이 납니다. 지정하지 않습니다.
     ```bash
     podman compose down
     podman machine stop && podman machine set --memory 2048 && podman machine start
     podman run --rm --entrypoint bash -v oracle-free_oracle-data:/opt/oracle/oradata:Z \
       docker.io/gvenzl/oracle-free:slim-faststart -c '
       D=/opt/oracle/oradata/dbconfig/FREE; P=/tmp/initFREE.ora
       ln -sf $D/spfileFREE.ora $ORACLE_HOME/dbs/spfileFREE.ora
       echo "create pfile='\''$P'\'' from spfile;" | sqlplus -s / as sysdba
       sed -i -E "/sga_target|sga_max_size|pga_aggregate_target|pga_aggregate_limit/d" $P
       printf "*.sga_target=900M\n*.sga_max_size=900M\n*.pga_aggregate_target=200M\n" >> $P
       echo "create spfile='\''$D/spfileFREE.ora'\'' from pfile='\''$P'\'';" | sqlplus -s / as sysdba'
     podman compose up -d
     ```
   - 볼륨을 지우고(`down -v`) 새로 만들면 기본값으로 돌아가므로 위 절차를 다시 실행합니다.
6. **IDE나 외부 도구(Testcontainers 등)에서 소켓 인식 실패 시:**
   - Podman Desktop 설정에서 `Docker Socket`이 켜져 있는지 확인하고, 필요 시 실제 소켓 경로를 조회해 환경 변수로 지정합니다(Mac 은 경로가 머신마다 다름):
     ```bash
     export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
     ```
