# 94. dev-portal 설계 (참고)

> 통합 원본: `개발플랜/dev-portal-design.md` (347줄)
> 성격: **참고**. 모듈 개발자가 portal 본체 없이 m-xxx 만 독립 개발할 수 있도록 하는 경량 호스트 앱 설계 (검토 단계).
> 구현 상태: **설계 검토 단계** (배포 방식 A/B/C 선택지 단계, 구현 미착수).

---

## 1. 설계 배경

### 1.1 현재 문제
- m-xxx 모듈 개발자가 변경사항을 보려면 **portal 전체 dev 서버**를 띄워야 함
- portal 은 NextAuth, 메뉴 DB(prisma), BFF 프록시 등 인프라가 무거움
- 외부 협력 개발자에게 portal 전체 코드를 노출하기 부담

### 1.2 목표
- shared + m-xxx 만으로 독립 실행 가능한 **경량 호스트 앱** (`dev-portal`) 제공
- 로그인 / 메뉴 / API 프록시 최소 기능
- 본 portal 과 동일한 PageLayout / 메시지 / 인증 인터페이스 제공

---

## 2. 책임 분리 (제안)

| 항목 | dev-portal | portal (본체) |
|---|---|---|
| 라우팅 | 단순 (모듈별 path 직접 매핑) | 메뉴 DB 기반 동적 |
| 인증 | 더미 로그인 (개발용) 또는 백엔드 직결 | NextAuth + 권한 검증 |
| 메뉴 | 환경변수 또는 단순 JSON | DB 시드 (Prisma) |
| BFF | shared/oasis-proxy 직접 호출 | proxy.ts + 권한 캐시 |
| 배포 | 개발 환경 only | 운영 |

---

## 3. 검토된 배포 방식

### 3.1 옵션 A: 사내 npm 패키지로 배포
- `@dk-oasis/dev-portal` 로 GitLab 에 publish
- 모듈 개발자가 `pnpm create dk-oasis-module` 후 `pnpm dev-portal` 로 실행
- **장점**: 설치 단순
- **단점**: 패키지 업데이트 운영 부담

### 3.2 옵션 B: 별도 git repository
- `dmes-aps-dev-portal` 별도 리포
- 모듈 개발자가 clone 후 자체 dev 진행
- **장점**: 완전 분리, 외부 협력 가능
- **단점**: shared / 본 portal 과의 변경 동기화 부담

### 3.3 옵션 C: 본 모노리포 내 별도 앱
- `src/frontend/dev-portal/` 디렉토리 추가
- shared / m-xxx 와 같은 워크스페이스
- **장점**: 동기화 자동, 기존 인프라 재활용
- **단점**: 외부 분리 효과 약함

→ **권장**: 옵션 C (현재 모노리포 정책과 부합)

---

## 4. 최소 기능 설계

### 4.1 dev-portal 디렉토리 구조 (옵션 C)
```
src/frontend/dev-portal/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  # 모듈 선택 화면
│   └── [module]/
│       └── [...path]/
│           └── page.tsx          # 동적 모듈 페이지 로딩
├── lib/
│   ├── auth.ts                   # 더미 로그인 또는 환경변수 토큰
│   └── proxy.ts                  # 단순 프록시 (권한 검증 없음)
├── package.json
└── next.config.ts
```

### 4.2 환경변수 (.env.dev-portal)
```
DEV_PORTAL_BACKEND_URL=http://localhost:8082
DEV_PORTAL_DUMMY_USER_ID=dev-user
DEV_PORTAL_DUMMY_TOKEN=eyJhbGc...   # 백엔드에서 발급한 테스트 토큰
NEXT_PUBLIC_DEV_MODE=true
```

### 4.3 모듈 선택 화면
- 환경변수 또는 단순 JSON 으로 등록된 모듈 목록 표시
- 클릭 → `/[module]/[feature]` 동적 import

---

## 5. 통합 인터페이스

m-xxx 모듈은 **dev-portal 과 portal 둘 다에서 동일하게 동작**하도록 다음 인터페이스 준수:

| 인터페이스 | 위치 |
|---|---|
| PageProps | `@dk-oasis/shared/portal-shell-core` |
| useGfnMessage | `@dk-oasis/shared/message-provider` |
| apiRequest | `@dk-oasis/shared/http` |

dev-portal 은 위 인터페이스의 dummy 구현 제공:
- PageProps.onSnapshotChange → no-op
- gfn_message → console.log + alert
- apiRequest → 단순 fetch + dummy 토큰

---

## 6. 향후 확장 (검토)

| 항목 | 설명 |
|---|---|
| Mock 백엔드 | MSW (Mock Service Worker) 통합으로 백엔드 없이도 화면 개발 |
| Storybook | 컴포넌트 단위 시각화 |
| 권한 시뮬레이션 | 환경변수로 가짜 role 부여 → BFF 차단 동작 테스트 |

---

## 7. 미구현 사유

- 현재 모듈 개발자 수가 많지 않아 portal 전체 dev 로 감당 가능
- 외부 협력 개발자 요건 미발생
- 우선순위 낮음 (Phase 5 이후)

---

## 8. 임시 대안

- 모듈 개발자에게 portal dev 환경 셋업 가이드 제공
- 메뉴 DB 시드는 한 번 실행 후 재실행 불필요
- BFF 인증은 NextAuth + 테스트 계정으로 진행

---

## 9. 관련 정리본

- 92 shared 와 portal 역할 분담
- 93 shared 배포 및 신규 모듈 가이드
