# Oasis Project

BPMN 프로세스 실행 엔진 코어 라이브러리

## 요구 사항

- Java 17 이상
- Gradle 8.12.1

## 주요 의존성

| 라이브러리 | 버전 |
|-----------|------|
| Spring Framework | 7.0.6 |
| Spring Data JPA | 4.0.4 |
| Jakarta Persistence API | 3.2.0 |
| Hibernate ORM | 7.0.5.Final |
| MyBatis | 3.5.19 |
| MyBatis-Spring | 3.0.4 |
| SLF4J | 2.0.16 |
| Jackson | 2.18.2 |
| Gson | 2.12.1 |
| Guava | 33.4.0-jre |

## 빌드

```bash
./gradlew build
```

## 빌드 및 배포 설정

이 프로젝트는 라이브러리 배포를 위해 Nexus 저장소를 사용합니다. 배포를 위해서는 Nexus 자격 증명 설정이 필요합니다.

보안을 위해 자격 증명은 소스 코드에 포함되지 않으며, 다음 두 가지 방법 중 하나로 설정할 수 있습니다.

### 방법 1: 환경 변수 설정 (권장 - CI/CD 환경)

시스템 환경 변수에 다음 값을 설정하십시오.

*   `NEXUS_USERNAME`: Nexus 사용자 아이디
*   `NEXUS_PASSWORD`: Nexus 사용자 비밀번호

**예시 (Linux/macOS):**
```bash
export NEXUS_USERNAME=your_username
export NEXUS_PASSWORD=your_password
./gradlew publish
```

**예시 (Windows PowerShell):**
```powershell
$env:NEXUS_USERNAME="your_username"
$env:NEXUS_PASSWORD="your_password"
./gradlew publish
```

### 방법 2: 로컬 설정 파일 (권장 - 로컬 개발 환경)

`oasis-core` 디렉토리 내에 `.secrets.properties` 파일을 생성하고 다음과 같이 작성하십시오. 이 파일은 git에 커밋되지 않도록 설정되어 있습니다.

**파일 경로:** `oasis-core/.secrets.properties`

**내용:**
```properties
NEXUS_USERNAME=your_username
NEXUS_PASSWORD=your_password
```
