# Frontend Local Rules

이 문서는 DMES {CLIENT} 저장소의 Frontend 로컬 운영 규칙만 둔다. 공통 Frontend 개발 표준은 [FrontEnd 표준 통합 개발가이드 v2](FrontEnd_표준_통합_개발가이드_v2.md)가 정본이다.

## 1. 정본 관계

- Frontend 화면 구현 표준: [FrontEnd_표준_통합_개발가이드_v2.md](FrontEnd_표준_통합_개발가이드_v2.md)
- BFF URL, OASIS/REST, Phase 7, 모듈별 Phase 7 허용 조건: [standard-v2/frontend-standard/01-rules-decisions-files.md](standard-v2/frontend-standard/01-rules-decisions-files.md)
- 외부 도메인 / 인프라 미구축 처리와 Decision Log: [standard-v2/frontend-standard/03-cases-checklist-menu.md](standard-v2/frontend-standard/03-cases-checklist-menu.md)
- Portal 화면/메뉴/BFF 개발: [Portal-Development-Guide.md](Portal-Development-Guide.md)
- Portal 메뉴 역할 정책: [Portal-Menu-Role-Policy.md](Portal-Menu-Role-Policy.md)
- 화면 시각 표준(톤·토큰·셸·그리드·토스트): [UI-Visual-Standard.md](UI-Visual-Standard.md)

## 2. 로컬 작업 규칙

- 중요한 Frontend 작업 규칙이 바뀌면 이 문서 또는 위 정본 문서를 갱신한다.
- 개발 중에는 매번 `pnpm lint`, `pnpm build`를 실행하지 않는다. 중간에는 변경 범위에 맞는 빠른 검증을 우선하고, lint/build 검증은 작업 최종 완료 시점에 실행한다.
- 작업 완료 전에는 변경 범위에 맞게 `pnpm lint`, `pnpm build`, `pnpm test:all` 또는 대상 패키지의 동등 검증을 실행한다.
- 수정 후 해당 파일만 포맷한다.

## 3. 최초 체크아웃 후 실행

아래 순서는 최초 1회만 필요하다. 이후 실행부터는 `pnpm dev`만 실행한다.

```bash
cd src/frontend
pnpm install

cd shared
cp .env.example .env
cd ..

cd m-mcm
cp .env.example .env
cd ..

cd m-mpn
pnpm build
cd ..

pnpm dev
```

`shared` 또는 `m-mcm`의 `.env` 파일은 `.env.example`을 복사 후 환경에 맞게 수정한다. `m-mpn` 소스를 수정했다면 `cd src/frontend/m-mpn && pnpm build` 후 `pnpm dev`를 다시 실행한다. `shared` 소스를 수정했다면 `cd src/frontend/shared && pnpm build` 후 `pnpm dev`를 다시 실행한다.

## 4. UI 검증 원칙

- UI 수정 후 기본 검증은 각 모듈 가이드가 정한 빌드/정적 검증 중심으로 수행한다.
- Playwright / playwright-cli 등 브라우저 기반 UI 레벨 테스트(E2E 포함)는 사용자가 명시적으로 요청했거나, 별도 필요성을 설명하고 승인받은 경우에만 수행한다.
- 승인 없이 관례적 UI 확인 목적으로 브라우저 기반 테스트를 실행하지 않는다.

## 5. 구현계획서 작성

- 구현계획서는 Phase별로 정리한다.
- 각 Phase에는 타이틀을 부여하고, 세부 항목은 `Phase번호-세부번호` 형식으로 작성한다. 예: `1-1`, `1-2`, `2-1`.
- 모든 항목 앞에 체크박스를 두어 진행 완료된 내용은 체크 처리한다.

```md
## Phase 1: lib 공통함수 옮기기
- [ ] 1-1. 공통 유틸 함수 파일 이관
- [ ] 1-2. import 경로 수정 및 검증
- [x] 1-3. 완료된 항목 예시

## Phase 2: common 컴포넌트 이관
- [ ] 2-1. 공통 컴포넌트 파일 복사
- [ ] 2-2. 의존성 확인 및 수정
```

## 6. Portal 프레임과 버튼 권한

- Portal UI 표준 명칭과 작업 명령 형식은 [portal-frame-names.md](../../../src/frontend/m-mcm/design/portal-frame-names.md)가 정본이다.
- `PageLayout` 의 `buttons[*].action` 코드는 반드시 소문자로 작성한다.
- 표준 코드: `search`, `save`, `delete`, `export`, `import`, `print`, `approve`, `reject`, `confirm`, `cancel`, `copy`
- 표준 코드 정본은 [permission-actions.ts](../../../src/frontend/m-mcm/page-components/access-management/permission-actions.ts)의 `STANDARD_ACTIONS`다.
- 커스텀 액션(`search1`, `recalc` 등)도 소문자 자유 입력은 허용하지만, 권한관리 화면에서 등록한 코드와 글자 단위로 같아야 한다.

## 7. FormGroup 도움말

- `<FormGroup label="..." tip={...}>` 형식으로 라벨과 tip을 함께 제공한다.
- tip 문자열은 inline으로 직접 쓰지 않고 모듈별 `<module>/src/_shared/field-tips.ts`의 도메인별 `{DOMAIN}_TIPS` 객체에서 참조한다.
- 같은 도메인 필드는 같은 TIPS 키를 재사용한다.
- 도메인 의미가 다르면 별도 TIPS 객체를 만든다. 라벨이 같아도 의미가 다른 경우 같은 키를 공유하지 않는다.
- 그리드 제목 도움말은 `GridPanel`의 `help={{ title, summary?, columns }}` prop으로 제공한다. 화면별 도움말 버튼을 직접 만들지 않는다.

## 8. UI 안티디자인

상단·좌측·우측·하단 등 카드/박스의 한 변에 색상 바를 붙여 상태나 유형을 구분하는 디자인은 안티디자인으로 본다.

- 금지: `border-left: 3px solid ...`, `border-top: 3px solid ...` 처럼 박스 한 변을 컬러 바처럼 쓰는 패턴.
- 금지: KPI 카드, 원인 그룹 카드, 예외 카드, 요약 카드에서 좌측/상단 컬러 바를 반복해 구분하는 패턴.
- 허용: 라벨 앞 작은 점, 아이콘, 숫자 색상, 배지, 얇은 전체 테두리, 배경 톤 차이, 텍스트 굵기 등으로 상태를 구분한다.
- 선택/활성 상태는 한쪽 바가 아니라 전체 테두리, 배경 톤, 체크/상태 아이콘 등으로 표현한다.
- 그리드 선택 행, 사이드바 선택 탭, 로그인 카드, 토스트에도 같은 규칙을 적용한다(2px 밑줄·한 변 inset 그림자 포함). 공통 적용 위치는 [UI-Visual-Standard.md](UI-Visual-Standard.md) §9.

## 9. 중요 액션 UX

사용자가 확정, 취소, 삭제, 전송, 마감, 발행, 상태 변경처럼 업무 상태나 하위 데이터에 중요한 변화를 일으키는 액션을 수행할 때는 단순 alert로 끝내지 않는다.

- 액션 전후의 영향 범위를 보여준다. 어떤 대상이 처리되는지, 함께 변경되는 하위·연관 데이터가 무엇인지 명확히 표시한다.
- 실패하거나 일부만 가능한 경우 건별로 설명한다. 무엇이 안 되는지, 왜 안 되는지, 어떤 업무 규칙·상태·연관 데이터가 막고 있는지 구분해 보여준다.
- 사용자가 다음 행동을 할 수 있게 한다. 차단 원인을 해소하려면 어디로 가야 하는지, 어떤 오더·요청·스케줄을 확인해야 하는지 링크 또는 즉시 검색 가능한 진입점을 제공한다.
- 일괄 액션은 전체 실패 메시지 하나로 처리하지 않는다. 가능한 건, 불가능한 건, 상위 선택에 포함되어 별도 처리할 필요가 없는 건을 분리해 표시한다.
- 백엔드는 프론트가 rich UX를 만들 수 있도록 구조화된 검토·검증 응답을 우선 제공한다. 프론트에서 문자열을 파싱해 사유를 추정하지 않는다.

## 10. OASIS LoV BPMN service 미구축 시점

LoV service가 아직 없을 때는 화면에서 임의 Phase 7 LoV 라우트를 호출하지 않는다. 모듈별 Phase 7 허용 조건은 [standard-v2/frontend-standard/01-rules-decisions-files.md](standard-v2/frontend-standard/01-rules-decisions-files.md) §2-2-1-A가 정본이다.

- `mpp`, `mqc`, `mls`, `mcm`처럼 SqlSession 미등록 모듈에서는 `apiLovMaster`, `apiLovQuery`, `apiLovService` 호출을 금지한다.
- LoV가 업무상 필요하면 별도 OASIS BPMN service를 신설하고 `/api/{moduleId}/oasis/{lovServiceId}/{action}` 형태로 호출한다.
- service 미구축 상태에서 화면 진행이 필요하면 정적 옵션, 비활성 상태, 빈 결과 stub 중 하나로 명시 처리하고, Decision Log나 설계서 이슈에 후속 작업을 남긴다.
