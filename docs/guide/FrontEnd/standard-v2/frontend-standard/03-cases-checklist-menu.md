# 03. 케이스, 체크리스트, 메뉴 인프라

> 상위 문서: [Frontend 표준 개발 가이드 V2](../../FrontEnd_표준_통합_개발가이드_v2.md)

## 11. 케이스 선택표

| 유형 (§3-1) | 주요 템플릿 (§14) | 필수 shared import | 참고 |
|---|---|---|---|
| A. 조회 전용 Form | 14-2 (Grid 제외) | `/layout`, `/form`, `/use-api-call`, `/message-provider` | — |
| B. 조회 + Grid | 14-2 | 위 + `/grid` | rowState 불필요 |
| C. 조회 + 저장 | 14-1 + 14-2 | 위 + `useGridDataManager` | §9 변환 규칙 |
| D. Master-Detail | 14-2 확장 | 위 + 2개 `AgDataGrid` | 상·하위 Grid 분리 |
| E. 팝업·모달 | `/modal` | `/modal`, `/form` | portal 재내보내기 불필요 |

---

## 12. 가이드 외 시나리오 대응 정책

### 12-1. 절차 (MUST)

1. §3 유형표 / §11 선택표에 부합하는지 재확인.
2. 「Part B: shared 사용 정책」 허용 목록 확인.
3. 해결되지 않으면 **작업을 중단하고** 사용자에게 확인.
4. 결정 사항은 본 가이드 또는 레퍼런스에 반영한 뒤 재개.

### 12-2. 임의 처리 금지 (MUST NOT)

- 레퍼런스에 없는 shared 경로 추측 import.
- §14 외 구조로 페이지 배치.
- §6 금지 사항 우회.

### 12-3. 범위 외 시나리오

- 대용량 차트 라이브러리 변경/추가
- 신규 전역 상태관리 도입
- SSR/RSC 복잡 패턴
- WebSocket / SSE
- 파일 업/다운로드
- i18n 도입

### 12-X. 외부 도메인 / 인프라 미구축 처리 (MUST)

외부 master 도메인 (`master.Material` / `master.Customer` / `wwUser` 등) 또는 외부 인프라 (mybatis SqlSession / RBAC role 등) 가 미구축 상태에서:

1. **임의 시뮬레이션 데이터/Entity 를 본 모듈에 생성하지 않는다.** (FE 측에서도 임의 상수 옵션으로 LoV 마스터를 대체하지 않는다)
   - **사례**: `B053` / `B055` / `B056` LoV 가 BE 측 `/lov/master/{code}` 미구축이라 FE 의 `types.ts` 에 옵션 상수를 임의 정의 = MUST NOT (외부 master 도메인 책임).

2. **사용자에게 명시적 동의 요청** — "도메인 X 가 미구축이라 Y 가 불가능합니다. Q-NNN deferred 로 등재 + placeholder 처리하겠습니다" 라고 보고.

3. **동의 후 분석리포트 §13 + 정합체크서 §G 에 Q-NNN 등재.**

4. **코드에는 placeholder 토스트** ("X 도메인 구현이 필요합니다 (deferred — Y 후 활성화)") 또는 비활성 button **처리.**

5. **master 도메인 / 인프라 구축 후 placeholder 해제 + 정합체크서 갱신.**

**인프라 격차** (예: BE Phase 7 mybatis 미구축 → OASIS 단일 simplification):
- 외부 도메인 미구축과 **별도 카테고리**.
- 결정 사유 + 향후 전환 조건을 분석리포트 §11.2 (채택 결과) 또는 화면별 Decision Log (§12-X-6) 에 등재.

**6. 위 절차 위반 시 정합체크서 §K 가 ✗ 되어 §13-5 의 재개발 의무 발동.**

### 12-X-6. 결정사항 기록 (Decision Log)

위치: `docs/{moduleId}/decisions/{screenId}.md` (화면별)

형식:
```
### D-001 {요약}
- 일시: YYYY-MM-DD
- 결정: simplification / deferred / 추가 / 제거 / 변경
- 사유: (왜)
- 사용자 동의: ✓ (일시) / ✗ (보류 사유)
- 영향 범위: (어디까지)
- 향후 조치: (해제 조건)
```

본 §12-X 의 절차로 deferred / simplification 결정한 경우 반드시 Decision Log 에 등재한다.

---

## 13. 완료 체크리스트

### 13-1. 개발 전

- [ ] 페이지 유형(A~E) 을 결정했는가?
- [ ] 대상 패키지(portal / shared / `m-{moduleCode}`) 를 결정했는가?
- [ ] Frontend 업무 모듈(mesModule) 이 §2-3 기준으로 올바르게 선택되었는가?
- [ ] mesModule / moduleGroup / pageName / pageId / API path / tsup entry 가 정해졌는가?
- [ ] **분석리포트 §3 S-NNN 수량 추출 = N개?**
- [ ] **§4.3 G-NNN 수량 + GE-NNN 수량 추출?**
- [ ] **§4.5 B-NNN 수량 + §4.5-1 GB-NNN 수량 추출?**
- [ ] **§4.6 P-NNN 수량 추출?**
- [ ] **§6 V-NNN 수량 추출?**
- [ ] **§7 Entity 컬럼 목록 추출 (편집 가능 컬럼 / 외부 JOIN 컬럼 / 계산 컬럼 분류)?**
- [ ] **§10 LV-NNN 수량 추출?**
- [ ] **위 매트릭스 표가 작업 노트 또는 정합체크서 §A.2 에 기재되었는가?**

### 13-2. 개발 후

- [ ] 컴포넌트 안에서 직접 `fetch` 하지 않았는가? (`*-api.ts` 경유)
- [ ] shared 에 있는 컴포넌트를 재구현하지 않았는가?
- [ ] 커스텀 fetch wrapper 가 없는가?
- [ ] `.catch(() => ...)` 로 에러를 삼키지 않았는가?
- [ ] `alert` / `console.error` 를 사용자 메시지로 쓰지 않았는가?
- [ ] 에러 메시지가 한 곳에서만 표시되는가?
- [ ] `useGridDataManager` 의 `SavePayload` 가 `*-api.ts` 에서 변환되었는가? (`nativeeditor_status` 필드가 body 에 유출되지 않았는가?)
- [ ] body 는 해당 API 가 요구하는 plain DTO shape 인가?
- [ ] 대상 업무 모듈(`m-{moduleCode}`) 의 `tsup.config.ts` 에 엔트리가 추가되었는가? (MES: `pages/{moduleGroup}/{screenId}` — suffix `-page` 금지. APS 예외: `pages/{group}/{page-name}-page` 유지) m-mdm 은 와일드카드 exports 를 쓰지 않으므로 같은 이름을 `package.json` exports 에도 함께 등록했는가? (`m-mdm/tests/package-exports.test.ts` 가 대조한다)
- [ ] portal 재내보내기가 존재하는가? (MES: `page-components/{moduleGroup}/{screenId}/page.tsx`. APS 예외: `page-components/{group}/{page-name}/page.tsx`)
- [ ] (MES 한정) 페이지 엔트리 파일명이 `{screenId}.tsx` (camelCase 단일 토큰) 인가? suffix `-page` / kebab-case 사용 시 ✗.
- [ ] shared 를 수정했다면 `cd shared && pnpm build` 를 실행했는가?
- [ ] 상대경로 체인(`../../../`) 이 없는가?

### 13-3. 품질 통제 최소 원칙

- SHOULD: `*-api.ts` 의 body 변환 함수(§10-4) 는 단위 테스트 대상으로 삼는다.
- MUST: 대상 모듈(`m-{moduleCode}`) 및 portal 빌드(`pnpm build`) 가 에러 0 건으로 통과해야 한다.
- MAY: 린터/포매터는 프로젝트 기본 설정을 따른다. 프로젝트 설정이 없는 경우 본 가이드 범위 외이다.

### 13-4. 설계서 ↔ 코드 1:1 대조 (MUST)

매 화면 개발 완료 시 다음 항목을 모두 ✓ 처리. 한 항목이라도 ✗ 면 미완성 판정 + §13-5 의 재개발 의무 발동.

**[결함 등급 전수 처리 의무 — A3·E2, MUST]**
- **결함 전부 처리: Critical / High / Medium / Low 4 등급 모두 등재 및 보완. "사소한 것은 생략" 금지.** 정합체크서 §A·§K 의 ✗ / △ 항목은 등급 무관 전수 처리한다. Low 등급이라는 이유로 △ 잔존 / 다음 사이클 이연 금지 (사용자 동의 받은 Q-NNN deferred 만 예외).
- 본 4 등급 분류는 [00_Agent지시_가이드.md §6.14 Phase 종료 자동 고해성사](../../../design/agent-directive/06-analysis-source-db-api.md) 와 정합한다.

- [ ] **FE types 의 응답 모델 필드 수 = 분석리포트 §7 Entity 컬럼 수** (BE 응답 매핑 기준 — 임의 추가/제외 0건)
- [ ] **§4.3 "편집 여부 N" 컬럼은 자체 캐싱 컬럼이 아닌 BE 응답에서 매번 받는 동적 변환 값?**
- [ ] **§4.3 "UI 표시 전용" / "(STUFF/JOIN)" 표시 컬럼은 동적 변환으로 처리되었는가?**
- [ ] **그리드 컬럼 수 (`GRID_COLS` 길이) = §4.3 G-NNN + GE-NNN 수** (정확히 일치, 숨김 포함)
- [ ] **검색조건 수 (`SearchField` 또는 묶음 컴포넌트 수) = §3 S-NNN 수** (정확히 일치)
- [ ] **본체 버튼 수 (`buttons` 배열 길이) = §4.5 B-NNN 수** (정확히 일치)
- [ ] **그리드셀 버튼 수 (cellRenderer button 컬럼 수) = §4.5-1 GB-NNN 수** (정확히 일치)
- [ ] **팝업 호출 핸들러 수 = §4.6 P-NNN 수** (deferred placeholder 포함)
- [ ] **LoV 옵션 매핑 = §10 LV-NNN 수** (정확히 일치 — 또는 외부 도메인 deferred Q-NNN 등재)
- [ ] **검증 핸들러 수 (handleSave 내부 가드) = §6 V-NNN 수** (정확히 일치)
- [ ] **정합체크서 §A.2 누락 검증 + §K (코드 정합) 모두 ✓?**
- [ ] 위반 시 §6-A-1~6-A-4 중 어느 항목에 해당하는지 명시?

**[As-Is 정합 매트릭스 — As-Is 가 있는 경우 MUST] (§K.5.0 절대 원칙 + 3단계 검증 차단 조항)**

본 체크박스는 `/analyze-service {SCREEN-ID}` 산출 cache + 분석리포트 §17.2-T1/T2/T3/T4 + 정합체크서 §K.5 (컬럼 단위 + UI 이벤트 + 표준 라이브러리 + 코드 인용/quote) 를 인용해 강제 검증한다. FE 책임 외 (순수 DB cascade 등) 항목은 "해당 없음" 표기 가능. As-Is 없는 To-Be only 화면은 전체 "해당 없음".

**["해당 없음" 표기 기준 — A3·A5·E3, MUST]**
- **A3 외부 도메인 한정 허용**: "해당 없음" 표기는 **FE 책임 외부 도메인** 만 허용 — BE deferred (서버측 자동 채번 / 트리거 cascade 등) / DB cascade / cross-module stub (다른 모듈 BE 미구축) / Q-NNN deferred (사용자 결정 보류).
- **A5 FE 책임 영역 금지**: T1 (As-Is 컴포넌트 → FE `*.tsx` 매핑) / T2 (이벤트 → `onClick` / `useEffect` 매핑) / T3 (표준 라이브러리 → `apiRequest` / `portal-shell-core` / `use-api-call` 매핑) 누락에 "해당 없음" 표기 금지. 누락 시 §K.5.6 위반 → ✗ 자동.
- **E3 사유 기재 의무**: "해당 없음" 표기 시 사유 (Q-NNN ID / To-Be only / BE 외부 도메인 ID 등) 함께 기재. 무근거 "해당 없음" 표기 = ✗ 자동 (E1·E3 정직성 선언 §1-2 위반).

**🚨 §K.5.0 절대 원칙 (정합체크서.template §K.5.0 인용) — 위반 시 즉시 ✗ 재개발 의무**:
- **§K.5.0.1 As-Is 1:1 보존**: 화면 구조 / 컴포넌트 / 자동 연동 / 그리드 개수/배치 임의 변경 금지. 변경 사유에 "효율" / "단순화" / "표준에 맞춤" / "시간" / "유사" / "동등" 표현 등장 = ✗ 자동.
- **§K.5.0.2 Skip 금지**: T1~T4 모든 행 1:1 매핑 의무. "분량이 커서 다음" / "유사하므로 생략" = ✗ 자동.
- **§K.5.0.3 3단계 검증 의무**: A 추출 완전성 + B 수량 동일성 + C 임의 변경 검증 모두 통과해야 §K.5 ✓.

**1단계: 추출 완전성 검증 (§K.5.5.A)**

- [ ] **분석리포트 §17.2-T4 의 E-NNN ID** ↔ **정합체크서 §K.5.1 의 E-ID** 가 1:1 정합 (누락/추가 0건)
- [ ] **§K.5.1 매 행 = As-Is 1 컬럼 / 1 분기 / 1 이벤트 / 1 라이브러리** (case 단위 또는 INSERT/UPDATE 전체 단위 묶음 ✓ 표기 0건)
- [ ] **§K.5.1 모든 행에 As-Is 코드 위치** (`file:line` 형식) **+ As-Is 코드 quote** (본문 한 줄 이상) 보유
- [ ] **§K.5.1 ✓ 행 모두 FE/BE 코드 위치** (`file:line`) **+ 코드 quote** 보유 — **인용/quote 누락 ✓ 행 = 0건** (있으면 ✗ 자동 전환)
- [ ] **§K.5.1 △ 행 모두 §G Q-NNN ID 인용** (예: `Q-MasterDomain-deferred` / `Q-MLS-deferred` / `Q-LoV-deferred`)
- [ ] **부속 dialog 별로 위 항목 각각 검증** (분석리포트 §17.3 의 부속 매핑 + 부속별 §K.5 인용)

**2단계: 수량 동일성 검증 (§K.5.5.B — §17.4 ↔ §K.5)**

- [ ] **§17.4 의 T1 카운트 (As-Is 컴포넌트 수) = FE 페이지 (`*.tsx`) 의 대응 컴포넌트 수** 동일 — 그리드 / 본체 버튼 / 검색 필드 / 첨부 영역 / Dialog 모두 포함. 차이 발생 시 §G Q-NNN 등재 또는 §12 결정 후보 ID 인용 필수
- [ ] **§17.4 의 T2 카운트 (이벤트 수) = FE 의 대응 이벤트 핸들러 수** 동일 (`onClick` / `onChange` / `useEffect` / `onSelectionChange` 등)
- [ ] **§17.4 의 T3 카운트 (표준 라이브러리 수) = FE 의 대응 처리 수** 동일 (apiRequest / portal-shell-core / use-api-call / Modal / GridSelect / FilePicker 등)
- [ ] **§17.4 의 T4 SP case 컬럼 E-NNN 수 = §K.5.1 의 컬럼 행 수** 동일

**3단계: 임의 변경 검증 (§K.5.6)**

✗ 자동 전환 패턴 — 각 항목 0건 검증:

- [ ] **화면 구조 임의 분리/통합** — As-Is 1 화면이 To-Be N 화면으로 분리되었으나 §G Q-NNN / §12 결정 ID 인용 없음 = ✗ (예: As-Is 메인 grid1+grid2 통합 → To-Be moldMaster + moldAttach popup 분리 — 사유 없음)
- [ ] **컴포넌트 임의 제거** — As-Is 의 Grid/Btn/Txt/Combo 중 하나가 FE 페이지에 매핑 안 됨 (T1 행에 FE 위치 빈 행) = ✗
- [ ] **이벤트 자동 연동 누락** — As-Is 의 OnGridRowSelectionChanged / OnGridCellDoubleClick / btn*_Click 등이 FE 에 대응 코드 없음 (T2 행 미매핑) = ✗ (예: As-Is `OnGridRowSelectionChanged → AttachmentManager.Load` 자동 동작이 FE 에 없음 — 사유 없음)
- [ ] **표준 라이브러리 호출 누락** — As-Is 의 AttachmentManager / AutoFillup / RfdCustomerDialog / NewCodeQuery 등이 FE 에 대응 처리 없음 (T3 행 미매핑) = ✗
- [ ] **그리드 컬럼 임의 누락** — As-Is SELECT N 컬럼이 FE GRID_COLS 에 N 컬럼 아닌 K 컬럼만 (사유 없음) = ✗
- [ ] **As-Is 외 FE 동작** (§K.5.2 X-NNN) 모든 행에 §12 결정 후보 ID 또는 §G Q-NNN ID 인용 보유

**(MUST NOT — 표면 통과 차단)**:
- As-Is 코드 인용/quote 없이 ✓ 표시 금지. 위반 시 §13-4 미통과 → §13-5 재개발 의무 자동 발동.
- 묶음 부수효과 (한 셀에 여러 부수효과 결합 텍스트) 금지. 부수효과 1건 = 1행.
- "분량이 커서 다음 응답에" / "유사하므로 생략" / "효율 위해 단순화" 표현 사용 시 §K.5.0.2 위반 — ✗ 자동.

차이 발생 시:
- 사용자 동의 받은 차이 → 정합체크서 §G 에 Q-NNN 등재 + △ 행 + ✓ 인정
- 사용자 동의 없는 차이 → ✗ 처리 + §13-5 재개발 의무 발동

### 13-5. 검증 실패 시 재개발 의무 (MUST)

§13-4 1:1 대조의 한 항목이라도 ✗ 면 다음 절차를 반드시 수행한다. 사용자에게 "이 정도면 완성된 것 같다" 라고 보고하는 행위 금지.

**[재개발 의무 사이클]**

**Step R-0. Phase 종료 자동 고해성사 — 4 질문 자체 점검 (MUST, C1·E2)** (정본 절차: `docs/guide/design/00_Agent지시_가이드.md §6.14`)

§13-4 1:1 대조 결과를 Step R-1 에 넘기기 직전, 워커 본인이 스스로 다음 4 질문을 자체 점검한다. 사용자가 묻기 전 에이전트가 먼저 수행 (§1-2 E3 정직성 선언).

| # | 질문 | 점검 방식 | 통과 조건 |
|---|---|---|---|
| **Q1** | 잔존 ✗ / △ / 누락 항목이 있는가? | §13-4 체크박스 전수 grep | "없음" 응답 가능해야 통과 |
| **Q2** | `pnpm build` / 1:1 대조 / `*-api.ts` 매핑을 직접 검증 안 한 부분이 있는가? | 빌드 로그 + grep 결과 + 코드 quote 첨부 | 직접 수행 흔적 100% |
| **Q3** | As-Is 1:1 보존 (§1-3 Step 0 B3 / §K.5.0.1) 위반이 있는가? — 임의 분리·통합·축소·캐싱 | T1~T4 매핑 표 vs FE `*.tsx` 코드 비교 | 임의 변경 0 건 |
| **Q4** | 사용자 동의 없는 단순화 / "유사하므로 동등" / Q-NNN 누락 등재 변경이 있는가? | §G Q-NNN 등재 vs 변경 항목 비교 | 무근거 변경 0 건 |

- **4 질문 모두 No** (위반 / 미검증 / 그대로 수용 / 임의 합리화 모두 0) → Step R-1 진행.
- **하나라도 Yes** → 즉시 정정 후 R-0 재점검 (재귀).

**Step R-1. ✗ 항목 식별 + 고해성사**
- R-0 에서 식별한 항목 + ✗ 처리된 체크박스 모두 나열 (잔존 ✗ / △ / 누락 빠짐없이)
- 각 항목이 §6-A-1~6-A-4 중 어느 안티패턴에 해당하는지 분류
- **(E2 고해성사 정직)**: 결함 있으면 솔직 보고, 없으면 억지로 만들지 말 것 (없는 결함 생성 금지)

**Step R-2. 해당 단계로 복귀**
- `types.ts` 필드 ✗ → §1-3 의 "5. types.ts 작성" 단계로 복귀
- 그리드/검색조건/버튼 ✗ → "6. 페이지 본체 작성" 단계로 복귀
- tsup entry 누락 ✗ → "7. tsup.config.ts 엔트리 등록" 단계로 복귀 (m-mdm 은 `package.json` exports 항목 누락도 같은 단계로 복귀)
- 그 외 → 해당 단계로 복귀

**Step R-3. 사용자 동의 필요 여부 판단**
- 단순 코드 수정으로 ✓ 가 가능 → 코드 수정 후 재검증
- 설계서 항목을 의도적으로 추가/제거/변경 필요 → 사용자에게 명시적 동의 요청
  - 동의 받으면 Q-NNN 등재 후 ✓ 인정
  - 동의 못 받으면 설계서대로 복원 (§6-A 임의 변경 금지 적용)

**Step R-4. 재검증**
- §13-4 1:1 대조 다시 수행
- 또 다른 항목이 ✗ 일 수도 있음 → R-1 로 복귀

**Step R-5. 종료 조건**
- 모든 항목이 ✓ 일 때만 화면 개발 완료 판정
- 그 외에는 R-1~R-4 사이클 반복

**[금지 사항 — 재개발 우회 (MUST NOT)]**
- "이 정도면 됐다" 라며 ✗ 인 채로 종료 보고 → MUST NOT
- 검증 항목 자체를 임의로 ✓ 처리 → MUST NOT
- 사용자 동의 없이 설계서 항목을 ✗ 회피용으로 임의 변경 → MUST NOT (§6-A 위반)

---

## 11. 2026-06-05 Phase 1~4 — 동적 메뉴 인프라

DB 메뉴 트리를 SoT 로 삼는 신규 라우팅 인프라. **`module-pages.ts` 정적 매핑 파일은 2026-06-05 완전 제거**되었으며 (외부 import 0 검증 후 삭제), Sidebar 는 BE derived `componentPath` 를, 모듈 진입점은 codegen `PAGE_REGISTRY` 를 직접 소비한다.

### 11-1. PortalShellMenuItem.componentPath 우선 소비 (MUST)

- **MUST**: `PortalShellMenuItem.componentPath?: string | null` 신설 필드는 BE myMenusTree 응답의 derived 값 (`{group}/{leaf}` 형식 — 예: `csa/commMenuMng`) 을 그대로 보존한다. (`shared/src/portal-shell/types.ts:32` 참조)
- **MUST**: `adaptMenuNode` 가 row 의 `componentPath` 를 매핑한다 — null / blank 는 그대로 null 로 유지. (`shared/src/portal-shell/use-portal-menu.ts:136-158` 참조)
- **MUST (Sidebar)**: `pageId` 조립 우선순위 = `${item.moduleId}:${item.componentPath}` (1차) → 기존 `sysCd + path + pageName` 조합 fallback (2차). `componentPath` 가 `/` 를 포함하지 않으면 fallback 으로 폴백. (`shared/src/portal-shell/sidebar/Sidebar.tsx:394-419` 참조)
- **이유**: 이전에는 portal `module-pages.ts` 의 group prefix 정적 테이블을 통해 leaf-only pageName 을 `{group}/{leaf}` 로 확장했지만, DB SoT 룰 적용 후에는 BE 가 이미 group 토큰을 응답에 포함시키므로 FE 의 정적 매핑이 불필요해졌다.

### 11-2. page-registry codegen 워크플로우 (MUST)

- **MUST**: 모듈 진입점 (`m-{moduleCode}/app/portal/module-config.ts`) 의 `sharedPortalPageLoader` 는 codegen 산출물 `lib/generated/page-registry.ts` 의 `PAGE_REGISTRY` 를 **직접 lookup** 한다. 정적 매핑 파일 import 금지.
- **MUST**: `createStrictModuleLoader` 는 `isRegisteredInRegistry(pageName)` + `resolveRegistryPath(pageName)` 를 사용해 strict 라우팅 검증한다 — registry 미등록 = throw + 콘솔 가이드 메시지. (`m-mcm/app/portal/module-config.ts:53-131` 참조)
- **MUST**: codegen 스크립트 `scripts/generate-page-registry.mjs` 는 `page-components/**/page.tsx` 를 glob 으로 수집해 `{leaf}` (depth 1) 와 `{group}/{leaf}` (depth 2) 두 형태만 키로 채택, depth 3+ 은 무시한다. 산출물 (`lib/generated/page-registry.ts`) 헤더에 `AUTO-GENERATED ... do not edit manually` 명시 — 수동 편집 금지.
- **MUST**: `package.json` 에 3 종 npm script 등재 — `generate:page-registry` / `predev` / `prebuild` 모두 `node scripts/generate-page-registry.mjs`. (`m-mcm/package.json:6-8`)
- **이유**: 신규 화면 추가 = `page-components/{group}/{leaf}/page.tsx` 파일 생성만으로 충분. 다음 `pnpm dev` / `pnpm build` 가 prebuild hook 으로 registry 를 자동 재생성 → DB componentPath 키와 1:1 정합.

### 11-3. 신규 화면 등록 절차 (MUST)

1. 화면명 = `screenId` 정본 (§4-0 단일 토큰 camelCase) 확정.
2. `page-components/{group}/{screenId}/page.tsx` 신규 파일 작성 — `PortalShellPageComponent` 인터페이스 준수.
3. BE 측 `DataInitializer.insertMcmSecMenuIfAbsent(..., parentMenuId={group}, objectId={screenId})` 시드 한 줄 추가. (BE 가이드 §13-2 정규식 가드 통과)
4. `pnpm dev` / `pnpm build` 실행 → predev/prebuild 훅이 registry 재생성 → Sidebar 클릭 시 BE derived `componentPath` 키로 동적 import 성공.
5. 수동 등재 / 정적 매핑 / 라우터 변경 = 모두 불필요. 디스크 page.tsx 가 SoT.

### 11-4. 마이그레이션 노트 — module-pages.ts 완전 제거 (2026-06-05)

- **삭제 대상**: `m-mcm/app/portal/module-pages.ts` (및 동등 모듈 위치). 본 파일은 group prefix 정적 테이블 + `isPageRegisteredForModule` helper 를 export 했으나 codegen PAGE_REGISTRY 로 책임 이관.
- **외부 호출처 0 검증 후 삭제** — 삭제 PR 전 `grep -r "module-pages" src/frontend` 결과 0 건 확인.
- **호환 잔재 처리**: 본 파일을 import 했던 portal 코드는 PAGE_REGISTRY 의 `isRegisteredPage` / `resolveRegistryPath` 로 1:1 교체. legacy alias 미제공 (완전 제거 — 재도입 금지).
- **단일 SoT 원칙**: 페이지 등록 정보는 디스크의 `page-components/**/page.tsx` 파일이 유일 SoT. 정적 manifest / lookup 테이블 신설 금지 (codegen 산출물 외).

---
