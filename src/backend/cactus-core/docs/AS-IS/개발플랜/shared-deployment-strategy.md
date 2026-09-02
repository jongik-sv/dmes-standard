# @dk-oasis/shared 모듈 배포 전략

> 작성일: 2026-04-06
> 목적: shared 패키지를 GitLab Package Registry를 통해 배포하고, 모듈 개발자가 독립적으로 개발할 수 있는 환경을 구축하기 위한 전략 문서

---

## 1. 배포 개요

### 1.1 현재 상황

```
dmes-aps/src/frontend/
├── shared/          ← @dk-oasis/shared (공통 라이브러리)
├── portal/          ← @dk-oasis/portal (호스트 앱)
└── m-aps/           ← @dk-oasis/m-aps (업무 모듈)
```

- 현재 pnpm workspace 기반 모노레포 구조
- `m-aps`는 `"@dk-oasis/shared": "workspace:*"`로 로컬 참조
- 외부 모듈 개발자가 shared를 사용하려면 별도 배포가 필요

### 1.2 목표 구조

```
[GitLab Package Registry]
    └── @dk-oasis/shared (npm 패키지)

[모노레포 - 본사]                    [외부 모듈 개발]
├── shared/ (소스)                   m-xxx/
├── portal/ (호스트 앱)                ├── .npmrc (GitLab 레지스트리)
└── m-aps/ (workspace:*)              └── @dk-oasis/shared (npm install)
```

---

## 2. GitLab Package Registry 설정

### 2.1 사전 준비

| 항목 | 설명 |
|------|------|
| GitLab 프로젝트 | shared 소스가 포함된 프로젝트 (또는 전용 패키지 프로젝트) |
| 프로젝트 ID | GitLab 프로젝트 설정 > General에서 확인 |
| Access Token | Project > Settings > Access Tokens에서 `api` 스코프로 생성 |
| 스코프 | `@dk-oasis` (패키지 네임스페이스) |

### 2.2 GitLab 프로젝트 레지스트리 활성화

1. GitLab 프로젝트 > Settings > General > Visibility, project features, permissions
2. "Packages" 기능 활성화 확인
3. Project > Deploy > Package Registry에서 확인

### 2.3 인증 토큰 종류

| 토큰 종류 | 용도 | 생성 위치 |
|-----------|------|-----------|
| **Project Access Token** | CI/CD 자동 퍼블리시 | Project > Settings > Access Tokens |
| **Personal Access Token** | 수동 퍼블리시/개발자 설치 | User > Preferences > Access Tokens |
| **Deploy Token** | 읽기 전용 (모듈 개발자용) | Project > Settings > Repository > Deploy Tokens |
| **CI_JOB_TOKEN** | CI 파이프라인 내 자동 사용 | 자동 제공 |

**권장**: 퍼블리시는 Project Access Token, 모듈 개발자 설치는 Deploy Token 사용

---

## 3. shared 패키지 퍼블리시 설정

### 3.1 shared/package.json 수정

```jsonc
{
  "name": "@dk-oasis/shared",
  "version": "0.1.0",        // ← 배포 시 버전 관리 필수
  "private": false,           // ← false여야 퍼블리시 가능
  "publishConfig": {
    "@dk-oasis:registry": "https://gitlab.회사도메인.com/api/v4/projects/{프로젝트ID}/packages/npm/"
  }
  // ... 나머지 기존 설정 유지
}
```

### 3.2 shared 루트에 .npmrc 추가 (퍼블리시용)

```ini
# shared/.npmrc
@dk-oasis:registry=https://gitlab.회사도메인.com/api/v4/projects/{프로젝트ID}/packages/npm/
//gitlab.회사도메인.com/api/v4/projects/{프로젝트ID}/packages/npm/:_authToken=${GITLAB_TOKEN}
```

### 3.3 수동 퍼블리시 절차

```bash
# 1. 환경변수 설정
export GITLAB_TOKEN="glpat-xxxxxxxxxxxx"

# 2. 빌드
cd src/frontend/shared
pnpm build

# 3. 퍼블리시
npm publish

# 4. 확인
# GitLab > Project > Deploy > Package Registry 에서 패키지 확인
```

### 3.4 .gitignore에 토큰 보호

```gitignore
# shared/.gitignore
.npmrc   # 토큰이 포함된 .npmrc는 커밋하지 않음
```

> `.npmrc.example` 파일을 만들어 템플릿만 커밋

---

## 4. CI/CD 자동 퍼블리시 (GitLab CI)

### 4.1 .gitlab-ci.yml

```yaml
stages:
  - build
  - publish

variables:
  NPM_TOKEN: ${CI_JOB_TOKEN}

# shared 빌드
build-shared:
  stage: build
  image: node:22-alpine
  before_script:
    - corepack enable
    - corepack prepare pnpm@latest --activate
  script:
    - cd src/frontend/shared
    - pnpm install --frozen-lockfile
    - pnpm build
  artifacts:
    paths:
      - src/frontend/shared/dist/
    expire_in: 1 hour
  rules:
    - changes:
        - src/frontend/shared/**/*

# shared 퍼블리시
publish-shared:
  stage: publish
  image: node:22-alpine
  needs: [build-shared]
  before_script:
    - corepack enable
    - corepack prepare pnpm@latest --activate
  script:
    - cd src/frontend/shared
    - |
      echo "@dk-oasis:registry=https://${CI_SERVER_HOST}/api/v4/projects/${CI_PROJECT_ID}/packages/npm/"
      echo "//${CI_SERVER_HOST}/api/v4/projects/${CI_PROJECT_ID}/packages/npm/:_authToken=${CI_JOB_TOKEN}"
    - npm publish
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      changes:
        - src/frontend/shared/**/*
```

### 4.2 트리거 조건

| 조건 | 동작 |
|------|------|
| `main` 브랜치 + `shared/` 변경 | 자동 빌드 & 퍼블리시 |
| feature 브랜치 + `shared/` 변경 | 빌드만 (퍼블리시 안 함) |
| `shared/` 외 변경 | 스킵 |

---

## 5. 버전 관리 전략

### 5.1 Semantic Versioning (semver)

```
MAJOR.MINOR.PATCH
  │     │     └── 버그 수정, 내부 변경 (하위 호환)
  │     └──────── 기능 추가 (하위 호환)
  └────────────── Breaking Change (하위 호환 깨짐)
```

### 5.2 버전 올리기 규칙

| 변경 내용 | 버전 | 예시 |
|-----------|------|------|
| 컴포넌트 버그 수정 | PATCH | 0.1.0 → 0.1.1 |
| 새 컴포넌트 추가 | MINOR | 0.1.1 → 0.2.0 |
| 기존 export 이름/타입 변경 | MAJOR | 0.2.0 → 1.0.0 |
| CSS 클래스명 변경 | MAJOR | 하위 호환 깨짐 |
| 새 유틸 함수 추가 | MINOR | 0.2.0 → 0.3.0 |

### 5.3 버전 올리기 명령

```bash
# 퍼블리시 전 버전 올리기
cd src/frontend/shared

npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
npm version major   # 0.1.0 → 1.0.0

# 커밋 & 태그 자동 생성됨
git push && git push --tags
```

### 5.4 모노레포 내 workspace 호환

모노레포에서는 `"workspace:*"`를 사용하므로, 퍼블리시된 버전과 무관하게 항상 로컬 소스를 참조합니다.

```jsonc
// m-aps/package.json (모노레포 내)
{ "@dk-oasis/shared": "workspace:*" }    // 로컬 참조

// m-xxx/package.json (외부 모듈)
{ "@dk-oasis/shared": "^0.2.0" }         // GitLab 레지스트리에서 설치
```

---

## 6. 모듈 개발자를 위한 설치 가이드

### 6.1 .npmrc 설정

```ini
# 프로젝트 루트/.npmrc
@dk-oasis:registry=https://gitlab.회사도메인.com/api/v4/projects/{프로젝트ID}/packages/npm/
//gitlab.회사도메인.com/api/v4/projects/{프로젝트ID}/packages/npm/:_authToken=${GITLAB_TOKEN}
```

### 6.2 환경변수 설정 방법

**방법 A: 쉘 환경변수 (권장)**
```bash
# ~/.bashrc 또는 ~/.zshrc에 추가
export GITLAB_TOKEN="glpat-xxxxxxxxxxxx"
```

**방법 B: .env 파일 (CI용)**
```bash
# .env (gitignore에 추가)
GITLAB_TOKEN=glpat-xxxxxxxxxxxx
```

### 6.3 설치

```bash
pnpm add @dk-oasis/shared
```

### 6.4 버전 업데이트

```bash
pnpm update @dk-oasis/shared        # 최신 호환 버전으로
pnpm add @dk-oasis/shared@0.3.0    # 특정 버전으로
```

---

## 7. 배포 체크리스트

### 퍼블리시 전

- [ ] `pnpm build` 성공 확인
- [ ] `pnpm lint` (tsc --noEmit) 에러 없음
- [ ] `package.json`의 `version` 올림
- [ ] `exports` 필드에 새로 추가한 모듈 반영
- [ ] Breaking Change가 있으면 MAJOR 버전 올림
- [ ] CHANGELOG.md 업데이트 (있는 경우)

### 퍼블리시 후

- [ ] GitLab Package Registry에서 새 버전 확인
- [ ] 테스트 프로젝트에서 `pnpm add @dk-oasis/shared@새버전` 설치 확인
- [ ] import 정상 동작 확인
- [ ] 모듈 개발자에게 업데이트 안내

---

## 8. 트러블슈팅

### 8.1 퍼블리시 실패

```
npm ERR! 403 Forbidden
```
→ `GITLAB_TOKEN`이 만료되었거나 `api` 스코프가 없음. 토큰 재발급

```
npm ERR! 401 Unauthorized
```
→ `.npmrc`의 레지스트리 URL 또는 토큰 확인

### 8.2 설치 실패

```
ERR_PNPM_FETCH_404  GET https://gitlab.../packages/npm/@dk-oasis/shared/-/...
```
→ 패키지가 아직 퍼블리시되지 않았거나, 프로젝트 ID가 잘못됨

### 8.3 버전 충돌

```
WARN deprecated @dk-oasis/shared@0.1.0
```
→ `pnpm update @dk-oasis/shared`로 최신 버전 설치

### 8.4 타입 에러

```
Cannot find module '@dk-oasis/shared/layout'
```
→ shared의 `exports` 필드에 해당 경로가 없거나, 빌드 후 `dist/`에 파일이 누락됨. shared를 다시 빌드 후 퍼블리시
