# z4 화면 프로파일링 · 실서버 첫 확인 (perm-bench 회차)

- 날짜: 2026-11-27 23:28~23:45 (측정 창, 측정 레인 = perm-fe-a)
- 기준 커밋: `d0c310a6d`(통합 tip = origin/claude/perm-bench)
- BE: mcm 8100(Mac 조정이 띄움), PDB = clone `L_PERM_Z4`(TPL_DATA 복제 + Flyway·DataInitializer 시드). 로그인 = 시드 `admin`(SYSADMIN)
- FE: `next build --profile --no-mangling` → `next start -p 5300`, 주소 `http://localhost:5300`
- 측정: `RENDER_SCREENS=… PERF_OUT=<저장소 밖> node scripts/perf/render/count-renders.mjs` 1회(commPermBench 1회 + 나머지 3화면 1회, 아래 「하네스 고침」)
- 판정 기준: [Screen-Performance-Guide §5](../guide/FrontEnd/Screen-Performance-Guide.md#5-성능-예산) 주 기준
  - 상세 입력 한 글자 → 화면 루트 렌더 0회 · 그리드 셀(`Cell2`) 재렌더 0회
  - 행 클릭 → 포털 셸(`PortalShell*`) 재렌더 0회
- 원자료(저장소 밖): `~/.coord/perm-bench-mac/lanes/perm-fe-a/z4/renders-commPermBench.json`·`renders-3screens.json`, 캡처 같은 폴더

## 1. 렌더 수 (동작별 React 커밋 · 렌더 시간 합)

| 화면 | 동작 | 커밋 | 렌더 시간 합 | 루트 렌더 | 그리드 셀 재렌더 | 포털 셸 재렌더 | 기준 | 판정 |
|---|---|---|---|---|---|---|---|---|
| commPermBench | ① 진입(자동 조회) | 47 | 41.5ms | - | - | - | 참고 ≤ 20ms | 참고 초과 |
| commPermBench | ③ 행 클릭(메뉴 칸) | 6 | 2.1ms | 1 | 0 | 0 | 셸 0 | 통과 |
| commPermBench | ④ 탭 돌아오기 | 19 | 14.0ms | - | - | - | 참고 ≤ 16ms | 참고 통과 |
| commPermBench | ⑤ 입력 5글자(사람 찾기) | 5 (1.0/글자) | 4.1ms (0.8/글자) | 0 | 0 | - | 루트 0·셀 0 | 통과 |
| commPermMng | ① 진입 | 44 | 40.7ms | - | - | - | 참고 ≤ 20ms | 참고 초과 |
| commPermMng | ② 조회 | 23 | 5.9ms | 2 | 0 | - | 참고 ≤ 16ms | 참고 통과 |
| commPermMng | ③ 행 클릭 | 1 | 0.1ms | 0 | 0 | 0 | 셸 0 | 통과 |
| commPermMng | ④ 탭 돌아오기 | 4 | 3.1ms | - | - | - | 참고 | 참고 통과 |
| commPermMng | ⑤ 상세 입력 5글자(버튼 권한 칩 입력) | 5 (1.0/글자) | 1.0ms (0.2/글자) | 0 | 0 | - | 루트 0·셀 0 | 통과 |
| commRoleMng | ① 진입 | 33 | 53.6ms | - | - | - | 참고 ≤ 20ms | 참고 초과 |
| commRoleMng | ② 조회 | 14 | 14.6ms | 4 | 0 | - | 참고 ≤ 16ms | 참고 통과 |
| commRoleMng | ③ 행 클릭 | 5 | 3.4ms | 0 | 0 | 0 | 셸 0 | 통과 |
| commRoleMng | ④ 탭 돌아오기 | 4 | 3.6ms | - | - | - | 참고 | 참고 통과 |
| commRoleMng | ⑤ 상세 입력 5글자(역할명) | 5 (1.0/글자) | 14.9ms (3.0/글자) | 0 | 0 | - | 루트 0·셀 0 | 통과(z4fix 재측정) |
| commObjMng | ① 진입 | 60 | 68.7ms | - | - | - | 참고 ≤ 20ms | 참고 초과 |
| commObjMng | ② 조회 | 25 | 13.6ms | 2 | 0 | - | 참고 ≤ 16ms | 참고 통과 |
| commObjMng | ③ 행 클릭 | 5 | 2.2ms | 0 | 0 | 0 | 셸 0 | 통과 |
| commObjMng | ④ 탭 돌아오기 | 4 | 4.2ms | - | - | - | 참고 | 참고 통과 |
| commObjMng | ⑤ 상세 입력 5글자(OBJECT명) | 5 (1.0/글자) | 22.9ms (4.6/글자) | 0 | 0 | - | 루트 0·셀 0 | 통과 |

- 루트 = `Comm<화면>Page` 의 update 수. 그리드 셀 = AG Grid 셀 컴포넌트 `Cell2` 의 update 수. 포털 셸 = `PortalShell*` update 수. 모두 `renders.json` 의 커밋별 컴포넌트 목록에서 셌다.
- commPermBench 는 조회 버튼이 없다(진입 자동 조회, `needsSearch: false`) → ② 없음.
- ms 값 = profiling 번들 1회 값(참고). 이 PC 는 같은 설정에서도 2배 가까이 흔들린다(가이드 §5).

### 위반 목록

없음(z4 의 1건은 z4fix 로 고쳤다, 아래 §1.1).

- 고친 것 — **commRoleMng ⑤ 상세 입력**(z4 첫 측정): 역할명 한 글자마다 화면 루트 `CommRoleMngPage` 가 1회 다시 그려진다(5글자 → 5회). 그 여파로 목록 그리드 래퍼(`GridPanelComponent`→`AgDataGridComponent`→`AgDataGridInner`→`AgGridReact`) 도 글자마다 1회 다시 그려진다(셀 `Cell2` 는 0회). 한 글자당 6.6커밋·4.8ms, 상세 폼 라벨(`MdmFieldLabel` 65회)·입력(`InputWrapper` 55회)이 함께 다시 그려진다. 상세 입력 값이 화면 루트 상태에 올라가 있는 모양(R12 위반 사례와 같은 꼴). 몫 = commRoleMng(perm-fe-b 설계).

### 1.1 z4fix 재측정(commRoleMng 만)

- 고침: 상세 입력 초안을 `RoleDetailPanel` 안 `useDetailDraft`(shared) 로 옮겼다(commObjMng `ObjDetailForm` 과 같은 꼴). 화면 루트는 ref 핸들로 blur·행 전환·저장 직전에만 행에 반영한다. 사용 안 함 확인 상자 상태도 패널 안에 둔다. 작업대에서 열기(f7) 받는 쪽 동작은 그대로(고친 칸이 반영 전이어도 「고친 것 있음」으로 본다).
- 측정: 2026-11-28 00:25~ 측정 창, `next build --profile --no-mangling` → 5300, `RENDER_SCREENS=commRoleMng` count-renders 1회. 원자료 = `~/.coord/perm-bench-mac/lanes/perm-fe-a/z4/renders-commRoleMng-z4fix.json`

| 동작 | z4 커밋 | z4fix 커밋 | z4 렌더 시간 합 | z4fix 렌더 시간 합 | z4fix 루트 | z4fix 셀 | z4fix 셸 | 판정 |
|---|---|---|---|---|---|---|---|---|
| ① 진입 | 33 | 32 | 53.6ms | 49.5ms | - | - | - | 참고 초과 |
| ② 조회 | 14 | 14 | 14.6ms | 14.8ms | 4 | 0 | - | 참고 통과 |
| ③ 행 클릭 | 5 | 5 | 3.4ms | 3.3ms | 0 | 0 | 0 | 통과 |
| ④ 탭 돌아오기 | 4 | 4 | 3.6ms | 3.9ms | - | - | - | 참고 통과 |
| ⑤ 상세 입력 5글자 | 33 (6.6/글자) | 5 (1.0/글자) | 24.1ms (4.8/글자) | 14.9ms (3.0/글자) | 0 | 0 | - | **통과** |

- ⑤ 에서 다시 그려진 화면 부품 = `RoleDetailPanel` 5회(글자당 1회)뿐. 목록 그리드 래퍼(`GridPanelComponent`·`AgDataGridComponent`·`AgGridReact`)는 0회.

### 참고(주 기준 밖)

- 진입 렌더 시간 합이 4화면 모두 참고 기준 20ms 를 넘는다(40.7~68.7ms). profiling 번들·1회 값이라 판정에 쓰지 않는다. commObjMng 진입이 가장 크다(60커밋·68.7ms).
- commRoleMng·commObjMng ③ 행 클릭 커밋 5개 중 다수가 `@mantine/notifications` 알림(`Notification`×5) 렌더다. 앞 동작(조회)의 알림이 닫히는 전환으로 보인다. 같은 화면을 브라우저로 행 클릭했을 때 알림은 뜨지 않았다.
- commPermBench ③ 행 클릭에서 화면 루트가 1회 다시 그려진다(메뉴 칸 선택 = 화면 상태). 주 기준(셸 0)은 통과.

### 하네스 고침

- `scripts/perf/render/screens.mjs` commPermMng `breadcrumb` = 「공통관리 > 시스템관리 > PERMISSION 관리」 → 「… > 퍼미션 관리」. 메뉴 트리 이름은 「PERMISSION 관리」지만 화면 breadcrumb 은 화면 제목 「퍼미션 관리」를 쓴다. 첫 실행에서 commPermMng 진입 대기가 60초 넘어 멈췄고, 고친 뒤 나머지 3화면을 다시 돌렸다.
- 이 Mac 에 Playwright 브라우저가 없어 `pnpm exec playwright install chromium-headless-shell`(1.62.1) 을 한 번 설치했다.
- heavy 슬롯 2개 + 독점은 측정 창이 잡고 있어(`sleep 2700`) 빌드·측정은 heavy 없이 직접 돌렸다.

## 2. 실서버 첫 확인

브라우저 = ego-browser. 캡처 = `~/.coord/perm-bench-mac/lanes/perm-fe-a/z4/<파일>`.

| 화면 | 되는 것 | 안 되는 것 | 캡처 |
|---|---|---|---|
| commPermBench(권한 작업대) | 진입 자동 조회(사람 1·그룹 3·역할 3·메뉴 28) · 사람 기준 미리보기 · 버튼 아래 켠 역할 · 퍼미션 칩 편집 → 초안 자동 저장(「마지막 저장 11-27 23:35:06」, 서버 시각 형식 정상) · 초안 막대(바꾼 것 1건·영향) · 초안 적용 창 → 적용(`PA20261127233522953903`, 초안 비워짐) · 이력 목록·바꾼 것 상세(전/뒤 값 `BTN=…`) · ↗ 링크 3종(역할 편집 → 역할 관리, 메뉴 수정 → 메뉴 관리, 오브젝트 수정 → OBJECT 관리, 각각 고른 항목 선택) · 돌아오면 오류 없이 다시 보임 | 없음. 확인 못 한 것: 충돌(PERM_CONFLICT)·잃는 사람 확인(관리자 1명이 SYSADMIN 이라 잃는 사람 0) | 01-bench-open · 02-bench-draft · 03-apply-modal · 04-applied · 05-history · 06-history-dtl · 30/31/32-bench-link-* |
| commPermMng(퍼미션 관리) | 진입 자동 조회 56건 · 행 상세(퍼미션 한 줄, 칩) · 「조회만」 → 저장(「저장되었습니다.」) · 「권한 작업대에서 보기」 → 작업대 역할 기준(표준 관리자 × 도메인 관리, 저장한 search·view 반영) | 없음 | 10-permmng-open · 11-permmng-save · 12-permmng-to-bench |
| commRoleMng(역할 관리) | 진입 자동 조회 3건 · 행 상세 · 이 역할의 퍼미션 28건 · 역할 설명 수정 → 저장(「역할 1건 저장되었습니다.」) · 「권한 작업대에서 이 역할 보기」 → 작업대 역할 기준 · 작업대 ↗ 로 열 때 그 역할 선택 | 없음(z4 렌더 위반 1건은 z4fix 로 고침, §1.1) | 20-rolemng-row · 21-rolemng-save · 22-rolemng-to-bench · 30-bench-link-role |
| commObjMng(OBJECT 관리) | 진입 자동 조회 48건 · 행 상세(버튼 권한 칩) · 이 오브젝트의 퍼미션 · 가리키는 메뉴 · OBJECT명 수정 → 저장(「1건 저장되었습니다.」) · 작업대 ↗ 로 열 때 그 오브젝트(domainMng) 선택 | 없음 | 23-objmng-row · 24-objmng-save · 32-bench-link-obj |

- 메뉴 관리(commMenuMng)도 작업대 ↗ 로 열면 그 메뉴(domainMng) 가 선택된다(31-bench-link-menu).
- 확인 중 바꾼 clone 자료: MDM_STEWARD×mdmSample 버튼 +copy(작업대 적용), MDM_STD_ADMIN×domainMng 조회만(퍼미션 관리), MDM_STD_ADMIN 역할 설명 끝 「 z4」, commUserRoleCopy OBJECT명 끝 「 z4」. 모두 clone `L_PERM_Z4` 안이다.
