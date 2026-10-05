# 새 화면 성능 가이드

새로 만드는 프런트 화면(`m-*`)과 `@dk-oasis/shared` 공통 컴포넌트가 처음부터 느려지지 않도록 지킬 설계 규칙, 확인 절차, 측정 함정을 둔다. 기존 화면을 고치는 일은 이 문서의 범위가 아니며 따로 진행한다.

- 근거: [MDM 화면 렌더링 findings 독립 검증](../../perf-render/mdm-findings-verification.md)(이하 "검증", dev f4378bef)이 정본이다. [1·2차 findings](../../perf-render/mdm-findings.md) 중 검증에서 틀린 것으로 판정된 수치(조회→첫 행 826.9ms, "프런트 442ms", `/api/auth/me` 진입당 22회, 화면 무관 호출 7건 등)는 쓰지 않는다.
- 수정 뒤 재측정: [MDM 화면 성능 수정 후 재측정](../../perf-render/mdm-after-fix.md)(이하 "재측정", 2026-10-04 dev 9a79d1db 기준). R1·K1~K7 의 효과, R11·R12 판정, §5 예산 확정의 근거다.
- 홈 위젯 계층: [홈 대시보드 위젯 중복 렌더·요청 분석](../../perf-render/widget-render-findings.md)(이하 "위젯 분석", 분석 dev c9b1d439, 수정 후는 §6, `perf/fix-widget` fb56fdda). R7 확장·R13~R16·§3 위젯 계층 표·§5 위젯 행의 근거다.
- 측정 범위: MDM 6화면(termMng·columnMng·layoutConfirm·headerMng·dataMng·codeMng), 로컬 SQLite·로컬 망, 프로덕션 빌드, 2026-10-04. 운영 망·운영 DB 값이 아니다.
- 인용한 `file:line` 은 dev f4378bef 기준이다. 다만 R1 적용 사례·R11·R12 와 §8 후속 후보(F1~F5)의 줄 번호는 dev 9a79d1db 기준이다. 줄이 바뀌었으면 검증·재측정의 절 번호(예: 검증 §5.2 C2)로 찾는다.
- 렌더·그리드 세부 규칙 중 이미 [Local-Rules](Local-Rules.md) 에 있는 것은 여기서 다시 적지 않고 링크한다(§11 선택 전환, §16 큰 편집 그리드, §20 AgDataGrid 재렌더).

## 1. 먼저 알아 둘 것

1. **조회 체감의 대부분은 서버다.** 7천~8천 건을 돌려주는 화면에서 조회→첫 행 체감(columnMng ≈380ms, termMng ≈167ms) 중 서버 TTFB 가 92%·80% 를 차지했다. 응답이 온 뒤 첫 행까지의 프런트 구간은 ≈33ms 이고, 그중 ≈20ms 는 2KB 응답 화면에서도 똑같이 드는 바닥값이다(검증 §3.1).
2. **React 렌더 비용은 작다.** 동작(진입·조회·행 클릭·탭 복귀)마다 React 렌더 시간 합은 2~18ms 였다(검증 §5.1). 그래서 화면마다 `memo`·`useCallback` 을 빠짐없이 두르는 일보다 조회 범위와 호출 수를 정하는 일이 훨씬 크다.
3. **공통 계층 문제가 1순위다.** 포털 셸·shared·홈 위젯에서 생긴 낭비는 새 화면 전부에 똑같이 붙는다. 화면 개발자가 직접 고칠 수 없는 것이 많으므로 §3 에 따로 모으고, 고쳐질 때까지 새 화면이 피할 것을 적는다.

## 새 화면 만들 때 하지 말 것

MDM 화면들에서 실제로 나온 문제만 모았다. 설명은 해당 R 절에 있다. 새 화면은 PR 전에 이 표를 한 번 훑는다. 확인 방법 열의 번호는 §7 점검표 번호다. audit 는 `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바꾼 파일·폴더>` 이고, 성능 항목 코드(`P-…`)와 수준은 [README §자동 점검](README.md) 에 있다. audit 가 잡지 못하는 행은 점검표와 `count-renders` 로 확인한다.

| 하지 말 것 | 증상(수치) | 규칙 | 확인 방법 |
|---|---|---|---|
| 조건 없는 전체 조회를 기본 조회로 둠 | 응답 2.89~3.07MB·7,858~8,155건, 조회→첫 행 167~386ms | R1 | 점검표 1, audit `P-R1`(경고), `searchEncodedBytes`·`searchRows` |
| 목록 조회 응답에 본문·긴 텍스트(CLOB, 수십 KB 이상) 열을 실음 | 공지사항 관리 목록이 행마다 본문(최대 20만 자)을 실어 누적되면 수 MB(분류표 27번) | R1 | 점검표 1·16, audit `P-R1b`(경고), `searchEncodedBytes` |
| 고르기 팝업·콤보 목록에 하위 항목(헤더의 항목 등)까지 실음 | 헤더 팝업 항목 포함 목록 10,681B → 목록 537B + 선택 때 단건 4,006B(로컬 헤더 수가 적은데도 20배) | R1 | 점검표 1·16, `searchEncodedBytes` |
| 결과 0건이면 그리드를 언마운트하고 `<p>` 로 바꿈(3항·`&&` 모두) | 0↔N 전환마다 AG Grid 를 다시 만들고 열 상태가 사라짐(분류표 P-R6 19건과 `ImpactPanel` 등 `&&` 형태) | R6 | 점검표 6, audit `P-R6`(경고), 화면 시험 「0→N 전환에 그리드 재마운트 없음」 |
| 진입 자동 조회가 [조회] 와 겹침 | 같은 조회가 두 번 나감(클릭보다 ≈60ms 먼저 나감) | R4 | 점검표 2, `searchAfterClick`·`searchBeforeClick` |
| `busy` 하나를 화면 루트 state 로 둠 | 클릭 즉시 루트 261개 컴포넌트 재렌더 5.2ms | R5 | 점검표 5, `count-renders` ②③ |
| 변화 없는데 새 배열·객체로 `setState` | 진입 ≈300ms 뒤 화면 전체 재렌더, 셸 1회 추가 | R7 | 점검표 7, `count-renders` ① |
| 행 클릭·입력마다 `onSnapshotChange`, 선택 행 ID 를 snapshot 에 넣음 | 행 클릭당 셸 2회 렌더 ≈3~4ms | R8, 3장 K1·K2 | 점검표 4, audit `P-R8`(오류), `count-renders` ③ 의 `PortalShell` |
| `fetch("/api/auth/me")` 직접 호출, 하위·팝업마다 `useUserButtonRbac()` | 구독자 수만큼 auth/me(진입당 4~6건, 수정 후 0건 목표) | R9, 3장 K3·K4 | 점검표 3, audit `P-K`(오류), `authMeAfterMenuClick` |
| 전역 이벤트(`portal-tab-activated`)로 다시 조회, 숨은 탭(폭 0)에서 다시 그림 | 탭 전환마다 요청 1건, 홈 이탈 때 2.5~3ms | R10, 3장 K5·K6 | 점검표 8, audit `P-R10`(경고), `count-renders` ④ |
| 상세 폼 state 를 화면 루트에 두고 그리드 열·행 deps 에 폼 객체를 넣음 | 한 글자마다 루트 171~268개 컴포넌트 재렌더, termMng 은 한 글자당 21커밋·추천 그리드 셀 연쇄 | R12 | 점검표 9, audit `P-R12`(오류)·`P-R12b`(경고), 화면 시험(루트 렌더 수), `count-renders` ⑤ |
| 화면·보드 진입 불러오기를 마운트→사용자 확인→정의 도착마다 다시 실행, 이미 그린 보드를 스켈레톤으로 되돌림 | 홈 진입 `secWidget/search` 3회·보드 2회 구성(WidgetFrame 마운트 22 = 11×2) | R13, R7 확장 | 점검표 13, `count-renders-home` ① 요청 수·`WidgetFrame` 마운트 |
| 같은 목록(같은 엔드포인트)을 컴포넌트·인스턴스마다 따로 요청 | 사이드바 1 + 바로가기 위젯 마운트 2 = 홈 진입 `secFavorite/search` 3회 | R15 | 점검표 14, `count-renders-home` ① 요청 수 |
| `useSyncExternalStore` 스토어를 통째 구독해 일부 필드만 씀 | 공지 행 클릭 하나에 홈 페이지→보드→프레임 11개 재렌더(커밋 2회, 219개 컴포넌트) | R16 | 점검표 15, audit `P-R16`(경고), `count-renders-home` ② |
| 슬라이드·`refreshSec`·`setInterval` 타이머를 탭 활성·표시 여부와 무관하게 돌림 | 현재 기본 배치는 60초 대기 커밋 0·요청 0이라 지금은 안 보임. 잠재 위치만 있음(R14) | R14 | 점검표 13, audit `P-R14`(경고) |

## 2. 설계 규칙 — 새 화면이 지킬 것

상태 표기: **확정** = 검증·재측정의 시간 측정·trace·렌더 횟수·CPU 프로파일로 확인한 것. **기각** = 재 보니 규칙으로 둘 만큼 비용이 없었던 것. 수치 기준은 §5 예산을 따른다.

### R1. 조건 없는 전체 조회를 기본으로 두지 않는다 — 확정

- **하지 말 것**: 목록 화면의 [조회] 가 빈 조건(`{"keyword":""}` 등)으로 전체 행을 돌려받게 두는 것. 진입 자동 조회도 같다.
- **할 것**: 화면 설계 때 첫 조회 조건(필수 키워드·기간, 상한 건수, 페이징 중 하나 이상)을 정한다. 설계서에 "첫 조회 예상 건수·응답 크기"를 적는다. 기준선은 첫 조회 응답 **≤ 500KB, ≤ 1,000건**이다(§5 예산).
- **할 것(응답 열)**: 목록 응답에는 그리드에 보이는 열만 싣는다. 본문·첨부처럼 큰 필드는 행을 선택할 때 상세 조회로 받는다. 적용 사례: 공지사항 관리(커밋 ad9d0a76 서버·5cff7d25 화면, 로컬 6건 목록 2,650→1,816B·본문 제외·limit 1,000, 상세 419B. 이론상 행당 본문 최대 20만 자가 목록 행 ≈300B 가 된다), columnMng 목록 행의 활용처 메모(`usageNote`, 최대 2만 자) 제거(12b7ab5f, 5100 목록 응답 271,200자·1,000건, 메모는 `/view` 상세 778자로 받음, 수정 전 응답 크기는 재지 않았다).
  - **홈 공지 카드·위젯 관리 목록 적용 사례**(브랜치 perf/mcm-list-body, 커밋은 병합 때 기록): `noticeBoard/search` 는 `includeContent:false`(목록)·`noticeId`(상세, 목록과 같은 게시중·기간·대상 조건을 걸어 보이지 않는 공지는 받지 못한다), `commWidgetMng/search` 는 `includeConfig:false`(목록)·`widgetId`(상세)를 받고, 파라미터가 없으면 응답은 그대로다. 위젯 관리 화면은 정의 위젯 행을 고를 때 상세 조회가 끝난 뒤에야 폼을 열어, 설정이 빈 폼의 [저장]이 설정을 지우는 일을 막는다. 로컬 DB 에는 공지 3건(본문 합 713자)·위젯 정의 15건(설정 합 4,032자)뿐이라 응답 크기 전후 차이는 작다(목록에서 각각 713자·4,032자가 빠짐). 이론상 한도는 공지 50건×본문 최대 20만 자, 위젯 정의 행당 설정 최대 200KB 였고 목록은 이제 그 값과 무관하다. 홈 카드는 다른 공지를 고를 때 본문을 한 번 받는 동안 「본문을 불러오는 중입니다.」가 잠깐 보이고, 한 번 받은 본문은 목록을 다시 받을 때까지 요청 없이 쓴다.
- **근거**: columnMng 조회 응답 2.89MB·7,858건, TTFB ≈345ms. termMng 3.07MB·8,155건, TTFB ≈130ms. 두 화면 모두 조건 없는 전체 조회다(검증 §2 주장 3·5, §3.1). 소형 응답 화면의 조회→첫 행은 ≈25ms 다.
- **어기면**: 로컬에서도 조회 체감이 4~15배(≈25ms → 167~380ms)가 된다. 운영 망에서는 3MB 전송 시간이 그 위에 더해진다(로컬 본문 수신은 ≈13ms 라 이 값이 보이지 않는다).
- **할 것(고르기 팝업)**: 고르기 팝업·콤보용 목록에는 하위 항목(헤더의 항목 등)을 싣지 않고, 고른 한 건만 단건 조회로 받는다. 선택 목록은 상한으로 자르면 못 고르는 행이 생기므로 상한 대신 이 방법을 쓴다. 단건 응답이 늦게 도착할 수 있으니 순번(ref)으로 그 사이 선택·EAI·전문이 바뀌었는지 확인하고, 이미 쌓인 행은 중복으로 쌓지 않는다. 적용 사례: layoutMng 헤더 추가 팝업.
- 페이징처럼 `AgDataGrid` props 를 새로 늘려야 하는 방식은 shared 동작 변경이므로 **사용자 승인 뒤** 한다([Part B §18](standard-v2/part-b-shared-policy.md#18-새-공통-컴포넌트-등록)).
- **구현 패턴(상한 건수)**: 서버는 요청에 `limit` 이 오고 조건이 없을 때만 앞쪽 `limit` 건을 DB 단계에서 줄여 읽고, 응답에 `totalCount`(전체 건수)·`truncated`(잘림 여부)를 싣는다. `limit` 을 보내지 않는 기존 호출자는 그대로 전체를 받는다. 정렬이 문자열이면 DB `ORDER BY` 대신 키·정렬 칸만 읽어 화면과 같은 비교로 앞쪽을 고른다(방언 콜레이션이 달라도 잘림 경계가 같다). 다만 columnMng 은 2026-10-05 사용자 결정으로 DB `ORDER BY 논리명, ID LIMIT`·`COUNT(*)` 를 쓰고 상한 경로의 행 순서도 DB 순서를 따른다(§8 F1). 방언(SQLite·Oracle·PostgreSQL)마다 한글·영문 대소문자 순서와 잘림 경계가 조금 다를 수 있음을 감수한 것이다. 화면은 [조회] 에 `limit` 을 보내고, 잘리면 `GridPanel titleExtra` 에 shared `GridLimitNotice`(「전체 N건 중 M건…」·[전체 보기])를 둔다. [전체 보기] 는 상한 없이 다시 받는다. 조건이 있는 조회는 상한을 걸지 않으므로 안내도 없다.
- **적용 사례**: columnMng·termMng(커밋 38e9a470 서버, 004bf672 shared, 0f3402ef 화면). 격리 cold 3회 중앙값, 로컬(재측정 §2.1·§2.2):

  | 화면 | 첫 조회 응답 전 → 후 | 조회→첫 행 전 → 후 | TTFB 전 → 후 | [전체 보기] |
  |---|---|---|---|---|
  | columnMng | 2.89MB·7,858건 → **347KB·1,000건** | 385.8 → 126~156ms | 350.5 → 107~136ms | 428ms·2.89MB(수정 전 전체 조회 수준) |
  | termMng | 3.07MB·8,155건 → **368KB·1,000건** | 166.6 → 64~68ms | 133.8 → 46~47ms | 200ms·3.07MB |

  1,000건 응답은 행당 ≈350B 라 500KB 예산 안에 든다. 상한을 걸 때는 **DB 단계에서 앞쪽만 읽는지**까지 본다. columnMng 은 상한 조회에서도 ID·논리명 7,858건을 전부 읽어 Java 로 정렬했다(§8 F1). DB `ORDER BY 논리명, ID LIMIT 1000`(유일 인덱스 순서 읽기)·`COUNT(*)` 로 바꾼 뒤, 백엔드 직접 호출 TTFB 는 로컬 bootRun 과 같은 C1 전용 JVM(`-XX:TieredStopAtLevel=1`)에서 중앙값 106~108 → **92~93ms**, 부하가 낮은 둘째 회차 62~66 → **56~59ms** 로 약 10% 줄었다(DB 사본, 변경 전후 번갈아 3회차 × 2). C2 까지 켠 JVM(`java -jar`, 운영과 같은 조건)에서는 전후 모두 ≈30ms 로 예산 안이다. 바뀐 단계(앞쪽 ID 고르기)만 떼면 ≈2ms → 0.1ms 다. C1 조건에서는 바꾼 뒤에도 예산(≤50ms)을 넘는다. 남은 시간은 고른 1,000건의 컬럼·매핑·용어 조회와 329KB JSON 직렬화로 본다. 같은 시각 메인 로컬 서버(bootRun, C1) 직접 호출은 ≈145ms 로 측정 서버보다 더 커서, C1 만으로는 다 설명되지 않는다.

  **2회차 적용 사례**(커밋 cbd208a3·9d743877 서버, 9c227305·38a7ca50 화면, 병합 4345869c). 5화면에 같은 패턴(`limit` → `totalCount`·`truncated`, `GridLimitNotice`·[전체 보기])을 얹었고, `limit` 을 보내지 않으면 응답은 그대로다. 5100 에서 `limit` 1000 이 실리고 오류 0 을 확인했다(로컬은 건수가 적어 상한에 안 걸린다).

  | 화면 | 로컬 첫 조회 건수·응답 |
  |---|---|
  | 레이아웃 확정(layoutConfirm) | 5건·948B |
  | 룰 확정(ruleConfirm) | 16건·2,331B |
  | 룰 세트 확정(ruleSetConfirm) | 4건·639B |
  | 전문 헤더 정의(headerMng) | 9건·2,496B |
  | 레이아웃 관리(layoutMng) | 4건·2,553B |

  레이아웃 관리 헤더 고르기 팝업은 항목 포함 목록 10,681B 가 `withoutItems` 목록 537B + 선택 때 단건 4,006B 로 줄었다(헤더·항목이 늘수록 차이가 커진다). DRAFT 한정 목록(확정 3화면)도 상한을 얹는 쪽을 기본으로 했다. 마스터 정의 4화면(domainMng 171건·codeItemEdit·codeMng 17건·dataMng 18건)은 업무 데이터처럼 늘지 않아 오탐으로 두고 고치지 않았다(운영 건수는 확인하지 못했다).

### R2. 큰 목록이 느리면 서버 쪽부터 본다 — 확정

- **하지 말 것**: 조회가 느리다고 행 가공 메모이즈·그리드 옵션부터 손대는 것.
- **할 것**: TTFB·응답 크기·건수를 먼저 확인하고(§4 절차) 조회 범위(R1)와 서버 쿼리를 본다.
- **근거**: 3MB 응답이 프런트에 더하는 몫은 ≈12~15ms 다(검증 §3.1). 프런트를 고쳐도 10ms 대만 준다.

### R3. 진입 때 화면이 필요한 호출만 낸다 — 확정

- **하지 말 것**: 화면 진입(마운트)에 화면이 쓰지 않는 데이터 호출을 붙이는 것.
- **할 것**: 진입 호출 목록을 설계서에 적는다. 메뉴 클릭 뒤 진입 호출은 현재 화면당 6~9건이며(그중 `/api/auth/me` 4~6건), 새 화면은 이 수를 늘리지 않는다(§5 예산).
- **근거**: 메뉴 클릭 뒤 진입 호출은 클릭 후 53~75ms 안에 모두 끝나고 [조회] 와 겹치지 않는다(검증 §2 주장 7, §3.2). 진입 안에 2~3단 짧은 사슬(auth/me → secFavorite, 그리드 마운트 → `mdmMeta/columns`)이 있으므로 사슬을 더 늘리지 않는다.
- **어기면**: 호출 하나가 진입 사슬 끝에 붙을 때마다 화면 틀이 서는 시간이 그만큼 늦어진다.

### R4. 진입 자동 조회를 둘 때는 [조회] 와 겹치지 않게 한다 — 확정

- **하지 말 것**: 진입 자동 조회가 끝나기 전에 사용자가 [조회] 를 누르면 같은 조회가 한 번 더 나가게 두는 것.
- **할 것**: MDM 목록 화면 기본은 진입 자동 조회 없음이다(cf4fbb05). 자동 조회가 필요한 화면은 진행 중인 같은 조건 요청이 있으면 다시 보내지 않는다.
- **근거**: layoutConfirm 은 진입 자동 조회(`layoutConfirm/page.tsx:149-156`)가 클릭보다 ≈60ms 먼저 나가고 클릭이 같은 본문으로 한 번 더 보낸다(검증 §2.1).

### R5. busy·로딩 플래그를 화면 루트 state 하나로 두지 않는다 — 확정(비용 작음)

- **하지 말 것**: 조회·상세·저장 모두에 쓰는 `busy` 를 화면 루트에 두고 클릭 즉시 켜는 것.
- **할 것**: 로딩이 필요한 부분만 그 상태를 받게 하고, 큰 상세 영역은 별도 컴포넌트(`memo`)로 나눈다. 목록 그리드 `loading` 은 목록 조회 전용 상태로 켠다([Local-Rules §11](Local-Rules.md#11-목록상세-선택-전환--깜빡임-금지-2026-09-29)).
- **근거**: columnMng 은 클릭 즉시 화면 루트 전체(컴포넌트 261개)가 다시 렌더된다(5.2ms, 단일 렌더 최대. 검증 §5.2 S3, `columnMng/page.tsx:145-147,215-262`).
- **어기면**: 서버가 빠른 화면에서는 응답 처리 앞에 5ms 대가 놓인다. 서버가 느린 화면에서는 체감에 거의 안 보인다.

### R6. 빈 목록이라고 그리드를 내리지 않는다 — 확정

- **하지 말 것**: `rows.length === 0 ? <p/> : <AgDataGrid/>` 처럼 0건이면 그리드를 언마운트하는 것. `{rows.length === 0 && <p/>}` 와 `{rows.length > 0 && <AgDataGrid/>}` 를 나란히 두는 `&&` 형태도 같다.
- **할 것**: 그리드를 늘 두고 빈 상태는 `emptyMessage` 오버레이로 보인다.
- **근거**: headerMng 는 0건 → 조회마다 AG Grid 를 새로 만든다(생성 2.9ms, 검증 §5.2 S5, `headerMng/components/HeaderList.tsx:32-47`). layoutConfirm 도 같은 구조다.
- **적용 사례**: 커밋 14231811·ddd08bfb·a72e2239·ecceccee(병합 5f862b97). 0건 때 그리드를 내리던 3항·`&&` 24곳(분류표 19건 + `ImpactPanel` + `&&` 형태 4곳)을 상시 마운트 + `emptyMessage` 로 바꿨다. 5100 화면 5곳(도메인·헤더 정의·코드/룰/룰 세트/레이아웃 확정)에서 0건 → N건 전환 때 그리드 DOM 노드가 같았고(재마운트 0) 콘솔 오류는 0 이었다.
- **함정**(고침): 예전에는 `AgDataGrid` 의 빈 오버레이가 `emptyMessage` 변경이나 `rows` 의 `null`(`undefined`) → `[]` 전환 때 문구를 갱신하지 않아, 확정 목록은 빈 문구 상수를 고정해 가렸다. 이제 shared 가 빈 상태·`emptyMessage` 가 바뀔 때마다 안내를 다시 띄워 최신 문구가 보인다(브랜치 `fix/aggrid-empty-overlay`). 확정 목록의 상수 문구는 그대로 두었다(조회 전에도 같은 문구가 보이는 현재 동작).

### R7. 변화가 없으면 새 배열·객체로 setState 하지 않는다 — 확정

- **하지 말 것**: effect·갱신 함수에서 내용이 같아도 `[]`·`{...}`·`prev.filter(...)` 결과를 그대로 넣는 것.
- **할 것**: 같으면 `prev` 를 그대로 돌려준다. 빈 배열은 모듈 상수를 쓰거나 이전이 비었으면 건너뛴다.
- **근거**: 포털 셸 tabOrder 동기화가 변화 없이도 새 배열을 넣어 셸 전체가 한 번 더 렌더된다(검증 §5.2 C1, `use-portal-tabs.ts:429-447`). termMng 은 진입 ≈300ms 뒤 `setCandidates([])` 로 화면 전체가 다시 렌더된다(검증 §5.2 S1, `termMng/page.tsx:182-188`).
- **확장 — 등록부 entry·배치 참조 안정성(위젯 W2·W3)**: 병합 결과가 같으면 원래 객체를 돌려준다. 위젯 등록부(`mergeWidgetRegistry`, 지난 결과를 `prev` 로 넘긴다)는 DB 정의 행이 값을 바꾸지 않으면 기본 entry 를 그대로 돌려주고, lazy 캐시(`WidgetFrame` 의 `lazyCache`)는 entry 객체가 아니라 안정 키(`load` 함수)로 잡는다. 배치(`items`)를 정리(`sanitize`)한 결과도 내용이 같으면 이전 배열을 재사용한다. 그러지 않으면 등록부가 한 번 바뀔 때 위젯 본체가 전부 다시 마운트되고 프레임 전체가 다시 렌더된다.
  - 근거: 수정 전 `widget-registry.ts:139` 가 값이 안 변해도 새 entry 를 만들고 `WidgetFrame.tsx:41-54` 의 캐시가 entry 기준 WeakMap 이라 본체가 리마운트됐고, `WidgetWorkspace.tsx:187` 이 매 load 마다 새 `items` 를 만들었다(위 분석 §3 W2·W3, 측정은 W1 과 같은 커밋이라 분리되지 않음).
  - 적용 사례: 커밋 fc5dbff0(`shared/src/widget/widget-registry.ts`·`WidgetFrame.tsx`·`widget-layout.ts`·`WidgetWorkspace.tsx`), 시험 96f48639. 전후 수치는 R13 적용 사례와 같은 측정이다.
- 그리드 `columns`·`data` 의 참조 안정 규칙은 [Local-Rules §20](Local-Rules.md#20-agdatagrid-화면--입력-한-글자셀-편집-한-번이-그리드-전체를-다시-그리지-않게-2026-10-01) 이 정본이다.

### R8. 탭 snapshot 은 탭 복귀 때 되살릴 값만 담는다 — 확정(선택 행은 snapshot 에 넣지 않는다, 2026-10-05 사용자 결정)

- **하지 말 것**: 행 클릭·선택·입력처럼 잦은 동작마다 `onSnapshotChange` 를 부르는 것. 선택 행(ID·버전)을 snapshot 에 넣는 것. 탭 복귀 때 선택 행을 되살리는 기능은 요구사항이 아니다(2026-10-05 사용자 결정 "F5 는 복원 빼").
- **할 것**: 탭 복귀 때 되살려야 하는 값(조회 조건 등)이 바뀔 때만 부른다. 선택 행은 snapshot 에 담지 않는다. 다른 화면이 handoff(`openMdmPage`)로 열어 줄 때만 그 값을 받아 쓴다.
- **적용 사례**: dataMng·codeMng·layoutConfirm·codeConfirm·ruleConfirm·ruleSetConfirm 에서 선택 행 쓰기·복원을 걷어 냈다. 행 클릭의 `onSnapshotChange` 호출은 0회이며, 셸 렌더 1회가 사라진다. 탭 복귀 때 선택만 풀린다(목록·조회 조건 복원은 이 화면들에 없었다). audit `P-R8`(오류)이 행 처리 함수 안의 `onSnapshotChange` 를 정적으로 잡는다. 조회 조건 선택(dataItemMng 의 마루 데이터 고르기)은 행 클릭이 아니라 대상이 아니다.
- **근거**: 화면이 행 클릭 때 `onSnapshotChange` 를 부르면 셸 `setTabs`(`use-portal-tabs.ts:246-254`) → tabOrder effect(R7)로 포털 셸 전체가 2회 렌더된다. 행 클릭당 ≈3~4ms 로, 행 클릭 렌더의 30~45% 를 차지하는 이번 측정의 최대 순수 중복이다(검증 §5.2 C2. 아래 줄 번호는 수정 전 dev 0047c849 기준: dataMng `page.tsx:121-126,225-231`, codeMng `page.tsx:143-153`, layoutConfirm `page.tsx:126-138`).
- 셸 쪽 낭비는 §3 K1·K2 에서 고쳤다(cf79e675). 이제 값이 바뀐 snapshot 은 셸 1회 렌더, 같은 값은 0회다. 그래도 잦은 동작마다 부르지 않는다.

### R9. 사용자 확인(`/api/auth/me`)과 RBAC 구독을 늘리지 않는다 — 확정

- **하지 말 것**: 새 코드에서 `fetch("/api/auth/me")` 를 직접 추가하는 것. 팝업·하위 컴포넌트마다 `useUserButtonRbac()` 를 다시 부르는 것.
- **할 것**: 화면에서 버튼 권한이 필요하면 화면 루트 한 곳에서 받아 props 로 내린다. 패널을 나눌 때 resizable `ContentBody` 하나마다 구독자가 하나씩 붙는다는 점을 알고 패널 수를 정한다.
- **근거**: `useUserButtonRbac` 인스턴스마다 `/api/auth/me` 를 한 번씩 부른다(`use-user-button-rbac.ts:64-73`, 재로그인 감지 의도는 `:137-139`). 구독자는 `PageLayout.tsx:105`, resizable `ContentBody` 의 `ResizableBody`(`ContentBody.tsx:171`), 화면 루트, 팝업이다. columnMng 은 구독자 5개로 진입 때 auth/me 6건이다(검증 §3.2, §5.2 C6).
- **어기면**: 요청 수가 구독자 수만큼 는다. 동시에 나가므로 벽시계는 1왕복(조회 단추가 RBAC 로딩 동안 ≈70ms 비활성)이지만 서버 부하와 진입 사슬이 는다.
- 사용자 확인을 한 번만 하고 공유하는 근본 수정은 §3 K3 에서 고쳤다(75e84a2b). 사용자 ID 가 필요하면 `getCurrentUser()`(비동기)·`peekCurrentUser()`(동기, 받아 둔 값만)·`useCurrentUserId()`(훅) 를 쓴다(`@dk-oasis/shared/portal-shell`). 권한 판정에는 여전히 `useUserButtonRbac` 를 화면 루트 한 곳에서 쓴다.
  - 적용 사례(F3, 커밋 b3383077): 사용자 ID 만 쓰던 `DashboardBoard`·`dashboard/layout`·메모·단위 계산기 위젯의 `useUserButtonRbac` 구독을 `useCurrentUserState(enabled)`(ID 와 확인 진행 여부만, `portal-shell/use-current-user-id.ts`)로 바꿨다. 권한 목록이 바뀌어도 이 컴포넌트는 다시 그려지지 않고(시험 `current-user-state.unit.test.ts`), `layoutKey` 가 없으면 사용자 확인도 요청하지 않는다.

### R10. 숨은 탭에 있는 것은 자기 탭이 보일 때만 다시 읽는다 — 확정(규모 작음)

- **하지 말 것**: 위젯·화면이 `portal-tab-activated` 같은 전역 이벤트를 받아 어느 탭이 활성화되든 다시 조회하는 것. 숨은 상태(폭 0)에서 크기 변경을 받아 다시 그리는 것.
- **할 것**: 자기 탭이 활성화될 때만 다시 읽는다 — `useTabPage().tabId` 를 `portal-tab-activated` 의 `detail.tabId` 와 비교한다(K5 수정, 3264529f). ResizeObserver 는 폭 0 통지를 무시한다.
- **근거**: 홈 바로가기 위젯이 탭 전환마다 즐겨찾기를 다시 요청한다(`m-mcm/widgets/home/quickLinks/widget.tsx:27-31`, 검증 §5.2 C5). 홈을 떠날 때 숨은 위젯 보드가 폭 0 으로 다시 렌더된다(≈2.5~3ms, 검증 §5.2 C4).
- 포털은 숨은 탭을 언마운트하지 않는다(`portal-shell.tsx`). 탭 복귀 때 화면 본체는 `TabPageSlot` memo 에서 멈춰 다시 렌더되지 않으므로(검증 §5.1), 이 구조를 깨는 전역 구독을 화면에 더하지 않는다.

### R11. 응답 뒤 프런트 시간은 행 가공이 아니라 응답 크기가 정한다 — 확정(행 가공 규칙은 기각)

- **하지 말 것**: 조회가 느리다고 행 가공(라벨 조합·포맷 등)을 먼저 메모이즈·서버 이전하는 것.
- **할 것**: 응답 뒤 시간을 줄이려면 응답 크기(행 수·열 수)를 줄인다(R1). 행 가공은 `useMemo` 로 응답이 바뀔 때 한 번만 하면 충분하다.
- **근거**: columnMng [전체 보기](7,858행, 2.89MB)의 응답 뒤 CPU 32~34ms 중 행마다 라벨을 조합하는 화면 코드 몫은 **0.8ms**(2~3%)다. 나머지는 응답 본문 파싱 등 엔진 작업(1,000행 4~10ms → 전체 16~21ms)과 AG Grid 행 적재(8 → 11~12ms)로, 둘 다 응답 크기에 비례한다(재측정 §3.1, `cpu-profile-search.mjs`, profiling 번들 3회).
- 열이 많거나 행마다 비싼 계산(정규식 다발·날짜 파싱 루프 등)을 하는 화면은 `cpu-profile-search.mjs` 로 화면 청크 몫을 한 번 본다(§4 5단계).

### R12. 입력 중 다시 렌더되는 영역에서 그리드 참조를 새로 만들지 않는다 — 확정(수정 적용)

- **하지 말 것**: 상세 폼 state 를 화면 루트에 두는 것. 그리드 `columns`·`data` 의 deps 에 폼 객체 전체를 두는 것.
- **할 것**: 폼 state 는 **별도 상세 폼 컴포넌트** 안에 둔다. 저장 단추는 화면 루트(`MdmPageLayout buttons`)에 있으므로 루트는 `ref` 핸들로 폼과 대화한다(React 19 이므로 `ref` 를 prop 으로 받는다). 그리드 열 정의는 폼 값이 아니라 안정값(`hasForm` 같은 불리언·고정 콜백)에만 의존시킨다. 일부 칸만 바꾸는 동작(예: 「상세에 적용」)은 핸들에 `apply({ patch, ... })` 를 둔다(columnMng `ColumnDetailHandle`).
- **근거**: 수정 전에는 상세 폼에 한 글자를 칠 때마다(profiling 번들, 재측정 §3.3 수정 전 열. 같은 조건의 §3.2 첫 측정은 7.6ms·5.4ms 로 시간만 흔들렸다) 아래가 다시 그려졌다.
  - columnMng(폼이 루트 state) — 화면 루트 아래 268개 컴포넌트. 한 글자당 1커밋·7.3ms.
  - termMng(추천 그리드 열 `recoColumns` 가 `form` 에 의존) — 루트 171개에 더해 추천 그리드 셀 렌더러가 다시 그려지고, 셀 단독 커밋이 5글자에 100회. 한 글자당 21커밋·6.4ms.

올바른 구조와 잘못된 구조는 이렇게 갈린다.

```tsx
// 올바름: 입력 state 는 상세 폼 컴포넌트에만 있다. 한 글자 입력은 이 컴포넌트만 다시 그린다.
export type TermDetailHandle = { load(form: TermForm | null): void; getForm(): TermForm | null };
export function TermDetailPane({ ref, busy }: { ref: Ref<TermDetailHandle>; busy: boolean }) {
  const [form, setForm] = useState<TermForm | null>(null);
  useImperativeHandle(ref, () => ({ load: setForm, getForm: () => form }), [form]);
  const hasForm = form != null;
  // 그리드 열 정의는 폼 값이 아니라 안정값(hasForm·고정 콜백)에만 의존한다
  const recoColumns = useMemo(() => buildRecoColumns(hasForm, confirm), [hasForm, confirm]);
  ...
}
// 화면 루트: 폼 값을 갖지 않는다. 행 선택·신규·조회 때 load, 저장 때 getForm.
const detailRef = useRef<TermDetailHandle>(null);
const [hasForm, setHasForm] = useState(false); // 저장 단추 disabled 용 불리언만
const handleSave = async () => { const form = detailRef.current?.getForm(); /* ... */ };
<TermDetailPane ref={detailRef} busy={isBusy} />

// 잘못됨(수정 전): 폼 state 가 루트에 있고 열 정의가 form 에 의존한다 → 한 글자마다 루트 전체와 추천 그리드 셀이 다시 그려진다.
const [form, setForm] = useState<TermForm | null>(null);
const recoColumns = useMemo<GridColumn[]>(() => [/* form 을 읽는 셀 */], [form, confirm]);
```

- **함께 할 것**: 상세 폼 안의 그리드(추천·하위 목록)는 `memo` 한 하위 패널로 떼고 rows·columns 만 넘긴다. 그러지 않으면 입력마다 `GridPanel` 이 다시 그려진다(AgDataGrid 자체는 건너뜀). 루트 재렌더는 화면 시험에서 `MdmPageLayout` 호출 수로 막을 수 있다(`m-mdm/tests/dma/columnMng/detail-form.test.ts`).
- **어기면**: 지금 크기로는 한 프레임(16ms) 안이지만 화면 컴포넌트 수·그리드 행 수에 비례해 늘어 큰 화면에서는 입력이 끊긴다. headerMng 사용 전문 그리드처럼 rowData 를 매 렌더 새로 만드는 곳(`HeaderUsagePanel.tsx:25,39`)도 같은 이유로 피한다.
- **표준 골격**: `mantine-aggrid-ui` 스킬의 [list-detail 예제](../../../.claude/skills/mantine-aggrid-ui/references/examples/list-detail/page.tsx)가 이 구조(`EquipDetailPane` + `ref` 핸들)로 되어 있다. 새 화면은 예제를 복사해 시작한다.
- **적용 사례**(profiling 번들 `count-renders` ⑤ 상세 폼 입력, 한 글자당):

  | 화면 | 전 | 후 | 커밋 |
  |---|---|---|---|
  | columnMng | 1커밋·7.3ms, 루트 268개 컴포넌트 재렌더 | 1커밋·3.6~4.0ms, 상세 폼 아래 159개만 재렌더. 화면 루트 0회, 그리드 래퍼·셀 0회 | a416187b·02e36638·0b9ef24b |
  | termMng | 21커밋·6.4ms, 루트 아래 + 추천 그리드 셀 단독 커밋 100회/5글자 | 1커밋·1.7ms, 상세 폼 아래 94개만 재렌더. 화면 루트 0회, 추천 그리드 셀 단독 커밋 0회 | a416187b·02e36638·0b9ef24b |

### R13. 화면·보드 진입 불러오기는 준비 조건을 모아 한 번만 한다 — 확정(수정 적용)

- **하지 말 것**: 진입 불러오기를 마운트 → 사용자 확인(`userId` null→id) → 정의(`widgetDef/list`) 도착 → 등록부 교체마다 다시 실행하는 것. 불러오기마다 상태를 `loading` 으로 돌려 이미 그린 보드를 스켈레톤으로 바꾸는 것.
- **할 것**: 준비 조건(사용자·정의·등록부)을 모아 처음 한 번만 요청한다. 늦게 온 사용자 확인·정의는 다시 조회하지 말고 이미 가진 배치를 다시 정리한다. 이미 그린 보드는 유지하고 스켈레톤으로 되돌리지 않는다.
- **근거**: 홈 진입에서 `secWidget/search` 가 3회 나갔다(+0.07 #1·#2 동시, +0.12 #3). 보드가 2회 구성되고(WidgetFrame 마운트 22 = 11 위젯 × 2, +0.08s 본체 없는 프레임 72마운트 → +0.19s 본체 포함 206마운트) 사용자는 스켈레톤→빈 프레임→해체→완성 보드를 본다. 코드 `WidgetWorkspace.tsx:175-225,413-431`(위 분석 §3 W1).
- **어기면**: 중복 POST 와 보드 전체 재마운트가 진입마다 붙고, 위젯마다 가진 진입 요청(`secFavorite` 등)도 재마운트 수만큼 는다.
- **적용 사례**: 커밋 fc5dbff0·bb672816·dd5dae6f(`shared/src/widget/WidgetWorkspace.tsx` 외, bb672816·dd5dae6f 는 리뷰 수정: 원래 배치에서 다시 정리·조용한 다시 불러오기 경합), 시험 96f48639·4bc837fa. 홈 진입 요청과 보드 구성 전 → 후, 3회 중앙값, profiling 번들, 로컬(위 분석 §6, 수정 전 dev c9b1d439 → 수정 후 fb56fdda):

  | 지표 | 전 | 후 |
  |---|---|---|
  | `secWidget/search` | 3 | **1** |
  | `widgetDef/list`·`noticeBoard/search`·`auth/me` | 각 1 | 각 1 |
  | WidgetFrame 렌더/마운트 | 198 / 22 | 132 / **11**(= 위젯 수) |
  | WidgetBoard 렌더/마운트 | 5 / 2 | 3 / 1 |
  | 보드 계층 커밋 | 21 | 14 |
  | 컴포넌트 렌더 총합 | 4,212 | 3,278(−22%) |

  진입 전체 커밋은 103 → 96(중앙값)으로 크게 안 줄었다. 남은 ≈45~55건은 표 위젯 안 AG Grid 셀 렌더(컴포넌트 1개짜리 커밋, 합 ≈3ms)와 ProgressBar 애니메이션 커밋이라 보드 구조와 무관하다(§8).

### R14. 타이머·자동 새로 고침은 탭 활성·요소 표시와 연동한다 — 확정(코드 수정 없음, 규칙·audit 로만 막음)

- **하지 말 것**: 위젯의 슬라이드 타이머·`refreshSec` 자동 새로 고침·`setInterval` 반복을 탭이 숨었거나 요소가 안 보여도 돌리는 것.
- **할 것**: 타이머는 자기 탭이 활성이고 요소가 보일 때만 돌린다(`document.visibilityState`, 탭 활성 여부, `IntersectionObserver` 등). 숨는 순간 멈추고 다시 보이면 재개한다. 포털은 숨은 탭을 언마운트하지 않으므로(R10) 타이머가 숨은 홈 탭에서 계속 돈다.
- **근거**: 현재 기본 배치는 60초 대기 커밋 0·요청 0이다(위 분석 §0 4, ⑥). 기본 배치에 media 위젯이 없고 어떤 메타도 `refreshSec` 을 쓰지 않아 지금은 비용이 없다. 잠재 위치는 `m-mcm/widget-types/media/renderer.tsx:116-121`(슬라이드 타이머)와 `shared/src/widget/WidgetFrame.tsx` 의 `refreshSec` effect 다. 코드는 고치지 않았고 새 위젯이 이 위치를 쓰기 전에 audit `P-R14`(경고)로 잡는다.
- **적용 사례**: 숨은 위젯의 `refreshSec` 새로 고침·미디어 슬라이드 타이머를 숨김 때 멈추고, 다시 보일 때 밀린 1회만 돈다(커밋 ca8cce09·a831daa0, 시험 beb4312c, 단위 시험 28건). 브라우저로는 확인하지 못했다(홈에 해당 위젯이 없다). §8 후속 W5·W6 은 해소로 본다.

### R15. 같은 목록(같은 엔드포인트)은 컴포넌트·인스턴스끼리 요청을 나눠 쓴다 — 확정(수정 적용)

- **하지 말 것**: 같은 목록을 쓰는 컴포넌트마다(같은 위젯이 여러 번 마운트되는 경우 포함) 같은 엔드포인트를 따로 부르는 것.
- **할 것**: 호스트가 받은 것을 올려 두는 모듈 저장소를 둔다(`portal-menu-store`·`portal-favorites-store` 방식). 호스트(포털 셸)가 받은 목록을 저장소에 올리고, 위젯은 저장소에 있으면 그것을 쓰고 없을 때만 요청한다. 자기 탭이 다시 활성화될 때의 재요청은 R10 방침대로 둔다.
- **근거**: 홈 진입 `secFavorite/search` 가 3회였다. 셸 사이드바 1회(`app/portal/page.tsx:313`) + 바로가기 위젯 마운트 2회(`quickLinks/widget.tsx:19`, W1 재마운트에 끌려 2회). 인스턴스 사이 공유가 없었다(위 분석 §3 W4).
- **적용 사례**: 커밋 dff10752(`m-mcm/lib/portal-favorites-store.ts` 신규, `app/portal/page.tsx`, `widgets/home/quickLinks/widget.tsx`), 시험 569c8aaf. 홈 진입 `secFavorite/search` **3 → 1**, QuickLinksWidget 렌더/마운트 15 / 2 → 9 / **1**. 탭 복귀 때 `secFavorite` 1회는 K5 방침대로 그대로다.

### R16. 외부 스토어(`useSyncExternalStore`)를 통째로 구독하지 않는다 — 확정(수정 적용)

- **하지 말 것**: 스토어 상태 전체를 돌려주는 훅(`useNoticeStore()`)을 구독해 구조 분해로 일부 필드만 쓰는 것. 스토어 갱신이 새 상태 객체를 만들면 쓰지도 않는 필드(`selectedId`)가 바뀔 때마다 구독자가 다시 그려진다.
- **할 것**: 필요한 필드만 필드별 훅(`useNotices()` 등)으로 노출하고 소비자는 그 훅만 쓴다. 스냅샷은 필드 단위로 안정 참조가 되게 한다.
- **근거**: 홈 페이지(`page-components/home/page.tsx:43`)가 공지 스토어를 통째 구독했다. 긴급 공지 띠에 `notices` 만 필요한데 행 선택(`selectedId`)만 바뀌어도 페이지→WidgetWorkspace→WidgetBoard→프레임 11개가 다시 그려졌다(위 분석 §3 W8, `notice-store.ts:21-24,52-54`).
- **적용 사례**: 커밋 dff10752(`m-mcm/page-components/home/notice-store.ts`·`page.tsx`), 시험 569c8aaf. 공지 행 클릭 3회 중앙값, 로컬(위 분석 §6):

  | 지표 | 전 | 후 |
  |---|---|---|
  | 커밋 | 2 | 1 |
  | React 시간 합 | 13.7ms | 12.4ms |
  | 렌더된 컴포넌트 수 | 219 | **46** |
  | WidgetFrame·WidgetBoard·PortalHomePage 렌더 | 11·1·1 | **0·0·0**(NoticeWidget 만 1) |

### 신경 쓰지 않아도 되는 것 — 확정

아래는 재 보니 각 ≤1ms 였다. 이것을 줄이려고 구조를 복잡하게 만들지 않는다.

- AG Grid 가 행마다 `flushSync` 로 따로 커밋하는 연쇄(조회·행 클릭 17~49커밋, 렌더 합 ≤3ms, 앱 코드로 못 줄임).
- 그리드 mount 뒤 gridReady·MDM 메타 도착에 따른 2~3회 재렌더, 행 선택 뒤 커서 effect.
- 메뉴 클릭마다 사이드바 TreeItem 전체 재렌더.
- 입력 경로가 아닌 곳의 인라인 콜백(`onRowClick={(r) => ...}`)으로 인한 `memo` 깨짐. 인라인 화살표를 일괄로 `useCallback` 으로 바꾸는 작업은 하지 않는다. 입력 중 다시 렌더되는 경로(R12)와 shared 공통 컴포넌트 내부는 예외다.

## 3. 공통 계층 — 알려진 결함과 새 화면이 피할 것

포털 셸·shared·홈 위젯에서 생겨 모든 화면에 붙는 낭비다. 2026-10-04 조정자 승인으로 K1~K7 을 모두 고쳤다(`perf/fix-common`, 아래 "상태" 열의 커밋). 위치 열은 고치기 전(f4378bef) 기준이다. 고친 뒤에도 새 화면은 "피할 것" 열을 지킨다 — 셸이 아끼는 것은 셸 쪽 낭비뿐이다. "측정 확인" 열은 재측정(MDM 6화면, 격리 cold 3회·profiling 번들 렌더 횟수)의 수정 전 → 후 값이다.

| # | 결함 | 위치(f4378bef) | 비용 | 새 화면이 피할 것 | 수정 방향 | 상태 | 측정 확인 |
|---|---|---|---|---|---|---|---|
| K1 | snapshot 이 같아도 셸 `setTabs` 가 새 배열을 넣는다 | `use-portal-tabs.ts:246-254`(`prev.map`) | 같은 snapshot 을 다시 보내도 셸 렌더 1회 이상 | 같은 값으로 `onSnapshotChange` 를 다시 부르지 않는다(R8) | 모든 탭이 그대로면 `prev` 를 돌려준다 | **수정됨**(cf79e675) — 렌더된 값·마지막 요청과 같으면 `setTabs` 를 부르지 않고, 갱신 함수도 `prev` 를 돌려준다 | 행 클릭 때 PortalShell 렌더 2 → **1**회(dataMng·codeMng·layoutConfirm, 선택 행 snapshot 값이 바뀜), 나머지 화면 0회 |
| K2 | tabOrder 동기화 effect 가 변화 없이 새 배열 | `use-portal-tabs.ts:429-447` | 탭 상태가 바뀔 때마다 셸 1회 추가, 진입당 ≈2~4ms(추정) | — | 변화가 없으면 `prev` 를 돌려준다 | **수정됨**(cf79e675) — 탭 구성이 그대로면 `setTabOrder` 를 부르지 않는다(같은 값 갱신 함수도 React 가 셸을 한 번 렌더한다) | 진입 때 PortalShell 렌더 4 → **3**회, 탭 복귀 커밋 5 → 4 |
| K3 | `useUserButtonRbac` 인스턴스마다 `/api/auth/me` | `use-user-button-rbac.ts:64-73,141-185` | 진입당 auth/me 4~6건(렌더 ≤0.4ms) | 구독자를 늘리지 않는다(R9) | 사용자 확인을 진행 중 요청 공유·세션 캐시로 한 번만. 재로그인 감지(`:137-139`)는 유지 | **수정됨**(75e84a2b) — `portal-shell/current-user.ts` `getCurrentUser`(진행 중 요청 공유·성공만 세션 캐시). 로그아웃·401·로그인 때 비우고, 다른 탭 재로그인은 화면이 다시 보일 때 재확인한다 | 페이지 전체 13~15 → **1**건(포털 부팅), 그 뒤 메뉴 클릭 진입 4~6 → **0**건(캐시 적중), 숨은 탭 복귀 0건 |
| K4 | resizable `ContentBody` 마다 RBAC 구독자 | `ContentBody.tsx:171` | 패널 하나당 auth/me 1건 | 패널을 필요 이상 나누지 않는다 | K3 과 함께 | **수정됨**(75e84a2b) — `ResizableBody` 는 `useCurrentUserId` 로 사용자 ID 만 받는다(RBAC 구독 없음) | K3 에 포함(ResizableBody 몫 auth/me 0건). 진입 호출 6~9 → **2~3**건 |
| K5 | 홈 바로가기 위젯이 어느 탭 활성화에도 즐겨찾기 재요청 | `quickLinks/widget.tsx:27-31` | 탭 전환마다 요청 1건 | 같은 패턴을 새 위젯·화면에 쓰지 않는다(R10) | 자기 탭(홈)이 활성화될 때만 | **수정됨**(3264529f) — `TabPageContext.tabId` 와 `portal-tab-activated` 의 `detail.tabId` 를 비교한다 | 진입 호출에서 `secFavorite` 사라짐. QuickLinksWidget 렌더 진입 3 → **0**회, 탭 복귀 2 → **0**회 |
| K6 | 숨은 홈 위젯 보드가 폭 0 통지로 다시 렌더 | `widget/WidgetFrame.tsx:96-106`, `WidgetWorkspace.tsx:144`, `WidgetBoard.tsx:60` | 홈을 떠날 때 ≈2.5~3ms | 폭 0 통지를 무시한다(R10) | 폭 0 이면 상태를 바꾸지 않는다 | **수정됨**(3264529f) — `WidgetFrame` 은 폭 0 을 무시, `WidgetWorkspace`·`WidgetBoard` 는 `useVisibleContainerWidth`(폭 0 무시)를 쓴다 | 진입 때 WidgetBoard 렌더 1 → **0**회 |
| K7 | 조회 단추가 RBAC 로딩 동안 비활성 | `use-user-button-rbac.ts:208`, `PageLayout.tsx:132` | 진입 뒤 ≈70ms 동안 조회 불가(1왕복) | — | K3 이 해결되면 함께 줄어든다 | **줄어듦**(75e84a2b) — 세션의 두 번째 진입부터 사용자 확인이 왕복 없이 끝난다. 첫 진입은 me→RBAC 2왕복 그대로 | 미측정(첫 진입은 그대로 2왕복). 조회 단추 대기는 하네스 구조상 재지 않았다 |

### 위젯 계층 적용 사례 — W 번호(K 번호와 별개)

홈 위젯 계층 결함은 K1~K7 과 번호를 섞지 않고 위젯 분석의 W 번호로 적는다. K5·K6 은 위 표대로 수정됐고, 그 뒤 위젯 분석(2026-10-05)이 같은 계층에서 W1~W8 을 판정해 W1·W2·W3·W4·W8 을 고쳤다(`perf/fix-widget`, fc5dbff0 shared·dff10752 m-mcm). 효과는 R13·R15·R16 적용 사례에 있다.

| W | 결함 | 규칙 | 상태 |
|---|---|---|---|
| W1 | 진입 `secWidget/search` 3회·보드 2회 구성 | R13 | **수정됨**(fc5dbff0) — 요청 3 → 1, WidgetFrame 마운트 22 → 11 |
| W2·W3 | registry 병합이 항상 새 entry, 매 load 새 `items` | R7 확장 | **수정됨**(fc5dbff0) |
| W4 | `secFavorite/search` 진입 3회 | R15 | **수정됨**(dff10752) — 3 → 1 |
| W5·W6 | media 슬라이드·`refreshSec` 가 표시 여부와 무관 | R14 | 코드 수정 없음(잠재). §8 |
| W7 | `WidgetFrame` props 객체 매 렌더 신규 | — | 조치 없음(본체가 `memo` 가 아니라 무해). §8 |
| W8 | 공지 행 클릭이 보드 전체 재렌더 | R16 | **수정됨**(dff10752) — 컴포넌트 219 → 46 |

새 위젯·홈 화면은 "하지 말 것" 표의 위젯 행과 R13~R16 을 지킨다.

## 4. 새 화면 성능 확인 절차

새 목록 화면(조회 → 그리드)을 만들면 PR 전에 한 번 잰다. 무거운 작업이므로 다른 측정·빌드와 겹치지 않게 하고, 공용 측정 창 규칙(조정 세션의 「측정 시작」, `heavy.sh` 독점)은 [하네스 README](../../../scripts/perf/render/README.md) 를 따른다.

1. **화면을 등록한다.** `scripts/perf/render/screens.mjs` 의 `SCREENS` 에 한 항목을 더한다.
   - `id`, `label`, `trail`(메뉴 경로 정규식 배열), `breadcrumb`, `listPanelTitle`(목록 `GridPanel` 제목, 없으면 `undefined`), `searchUrlPattern`, `searchUrlExclude`(진입 `optionsOnly` 호출 등 조회가 아닌 같은 URL), `needsSearch`.
   - `trail`·`breadcrumb` 은 **메뉴 시더의 메뉴 이름**으로 적는다. e2e 의 준비 단계 경로를 베끼지 않는다(§6 함정 10).
2. **프로덕션 번들을 만든다.** shared → 형제 패키지 dist(`lib-dev.mjs build ...`) → m-mcm `next build` 순서로, 모두 `heavy.sh` 를 거친다. 서버는 `next start -p 5300` 으로 띄운다(README §사용법 1~4). dev 서버(5100)로 재지 않는다.
3. **cold 3회를 화면마다 새 컨텍스트로 잰다.**
   ```bash
   RENDER_ISOLATE=1 RENDER_SCREENS=<id> bash scripts/perf/render/run-measure.sh 3
   ```
   `RENDER_ISOLATE=1` 을 빼면 앞 화면 탭이 복원돼 cold 가 아니다(§6 함정 3).
4. **`summarize.mjs` 요약으로 판정하고, 이상하면 `results.json` 원자료를 본다.** 요약은 조회 지표를 유효 회차(클릭 뒤 조회 요청 있음, 진입 자동 조회·`row-at-entry` 아님)만으로, 진입·호출 수 지표는 모든 회차로 중앙값을 낸다. 예열 회차(round 0)와 load 초과 회차는 버린다. 볼 값:

   | 필드 | 볼 것 |
   |---|---|
   | `searchAfterClick` / `searchBeforeClick` | `searchAfterClick` 이 1 이고 `searchBeforeClick` 이 0 이어야 그 회차가 유효하다. `invalidSearch` 가 1 이면 버린다 |
   | `inPageSearchToRowMutMs` | 조회 클릭 → 첫 행 DOM 삽입(페이지 안 시계). 화면 비교·예산은 이 값으로 본다. `searchToRowMs` 는 폴링 격자 값이라 순위 확인용이다 |
   | `searchTtfbMs`, `searchEncodedBytes`, `searchRows`·`searchTotalCount` | 조회 서버 시간(BFF 경유), 응답 크기, 응답 행 수와 전체 건수(상한을 걸었으면) |
   | `apiAfterMenuClick`, `authMeAfterMenuClick`, `apiAfterMenuClickNames` | 메뉴 클릭 뒤 진입 호출 수, 그중 `/api/auth/me`, 호출 경로 목록 |
   | `fullView*` | 상한을 걸었으면 `RENDER_FULL_VIEW=1` 로 [전체 보기] 경로도 잰다 |
   | `load1`, `keep` | `keep=0` 회차는 버린다 |

5. **필요하면 동작별 렌더를 센다.** 행 클릭·탭 복귀 비용이 의심되거나 shared 공통 컴포넌트를 새로 만들었으면 `next build --profile --no-mangling` 번들로 서버를 다시 띄워 `count-renders.mjs` 를 돌린다. 측정이 끝나면 일반 `next build` 로 되돌린다.
   ```bash
   RENDER_SCREENS=<id> PERF_OUT=<저장소 밖 폴더> node scripts/perf/render/count-renders.mjs
   ```
   동작 ①진입 ②조회 ③첫 행 클릭 ④탭 복귀 ⑤상세 폼 입력(`screens.mjs` 에 `formInput` 을 적은 화면)마다 커밋 수·렌더 시간 합·다시 렌더된 컴포넌트를 본다. ③에서 `PortalShell` 이 다시 렌더되면 R8·K1 을, ⑤에서 화면 루트나 그리드 셀이 글자마다 렌더되면 R12 를 확인한다.
   행 가공·열 계산이 무거워 보이면 같은 번들로 `cpu-profile-search.mjs` 를 돌려 응답 뒤 CPU 중 화면 청크 몫을 본다(R11).
6. **결과를 PR 에 적는다.** §5 예산 표의 항목별 값, 측정 조건(로컬·프로덕션 빌드·cold 3회 중앙값), 예산을 넘긴 항목과 이유를 남긴다. 원자료는 저장소에 넣지 않는다.

## 5. 성능 예산

이 PC 의 ms 값은 같은 설정에서도 2배 가까이 흔들린다([Local-Rules §20](Local-Rules.md#20-agdatagrid-화면--입력-한-글자셀-편집-한-번이-그리드-전체를-다시-그리지-않게-2026-10-01)). 그래서 **결정적인 개수·크기를 주 기준**으로 삼고, ms 는 로컬 cold 3회 중앙값의 참고 기준으로 둔다. 2026-10-04 수정(R1·K1~K7) 뒤 재측정으로 확정했다(재측정 §2~§4). 화면 종류가 늘어나면 다시 본다.

| 지표 | 기준 | 종류 | 근거 |
|---|---|---|---|
| 첫 조회 응답 크기 | ≤ 500KB | 주 기준 | 상한 적용 뒤 columnMng 347KB·termMng 368KB(1,000건, 행당 ≈350B). 수정 전 2.89·3.07MB. 소형 화면 1.2~4.5KB |
| 첫 조회 건수 | ≤ 1,000건 | 주 기준 | 1,000건 상한으로 조회→첫 행 columnMng 386→126~156ms, termMng 167→64~68ms |
| 메뉴 클릭 뒤 진입 호출(조회 제외) | ≤ 3건. 공통 2건(`secUser/myButtonEndpoints`·`mdmMeta/columns`) + 화면 고유 1건 | 주 기준 | 수정 뒤 6화면 2~3건(수정 전 6~9건). 화면 고유 호출은 콤보 값(`optionsOnly`)·진입 자동 조회 등 |
| 그중 `/api/auth/me` | 0건(페이지 전체 1건, 포털 부팅) | 주 기준 | 수정 뒤 6화면 0건·페이지 전체 1건(수정 전 4~6건·13~15건) |
| 행 클릭 때 포털 셸 재렌더 | 0회. 선택 행 snapshot 이 요구사항이면 1회 | 주 기준 | 수정 뒤 snapshot 화면 1회·나머지 0회(수정 전 2회) |
| 상세 폼 입력 한 글자당 | 화면 루트 렌더 0회, 그리드 셀 재렌더 0회 | 주 기준 | 현재값 columnMng·termMng 루트 0회·그리드 셀 0회(F4 수정 뒤, 재측정 §3.3). 수정 전(재측정 §3.2)에는 columnMng·termMng 이 루트 1회, termMng 은 셀 연쇄 ≈20커밋(R12 위반 사례) |
| 조회 클릭→첫 행(`inPageSearchToRowMutMs`) | ≤ 100ms(로컬) | 참고 | 소형 화면 24~29ms, termMng 64~68ms, columnMng 126~156ms(초과, §8 F1). 값이 ≈2~3ms 크게 잡힌다(§8) |
| 조회 서버 TTFB(`searchTtfbMs`, BFF 기준) | ≤ 50ms(로컬) | 참고 | termMng 46~47ms, columnMng 107~136ms(초과). 소형 화면 3~22ms(측정 시점 부하에 따라 흔들림, 재측정 §4) |
| 홈 진입 목록 요청(위젯 계층) | `secWidget/search`·`secFavorite/search`·`widgetDef/list`·`noticeBoard/search` 각 1회 | 주 기준 | 수정 뒤 각 1회(수정 전 `secWidget`·`secFavorite` 각 3회, 위젯 분석 §6, R13·R15) |
| 보드 구성 | 1회(WidgetFrame 마운트 = 위젯 수) | 주 기준 | 수정 뒤 마운트 11(11 위젯), WidgetBoard 마운트 1(수정 전 22, 2) |
| 위젯 안 행 클릭이 보드를 다시 그림 | 0회(WidgetFrame·WidgetBoard·홈 페이지 렌더 0) | 주 기준 | 수정 뒤 공지 행 클릭 0·0·0, 컴포넌트 46개(수정 전 11·1·1, 219개, R16) |
| 동작당 React 렌더 시간 합(`count-renders`) | 진입 ≤ 20ms, 조회·행 클릭·입력 한 글자 ≤ 16ms(한 프레임) | 참고 | 수정 뒤 진입 8.7~19.7ms, 조회 1.2~16ms, 행 클릭 5.8~13.8ms, 입력 한 글자 수정 전 5.4~7.6ms → F4 수정 뒤 1.7~4.0ms(profiling 번들, 재측정 §3.3) |

## 6. 측정 함정

성능을 잴 때 이번 검증에서 실제로 값을 틀리게 만든 것들이다(검증 §4 결함 13건, §7 다).

1. **Playwright `waitFor` 값은 폴링 격자에 붙는다.** 다시 확인 간격이 0·20·50·100·100·500ms 라 270ms 를 넘으면 해상도가 500ms 다. columnMng 실제 ≈380ms 가 ≈820ms 로 잡혔다. 화면 안 시간은 페이지 안 시계(이벤트 `timeStamp`·MutationObserver)로 잰다.
2. **클릭 호출 전에 찍은 시각에는 Playwright 동작 확인·CDP 왕복(≈30ms)이 깔린다.** 이 바닥값을 화면 비용으로 읽지 않는다.
3. **같은 브라우저 컨텍스트로 여러 화면을 재면 cold 가 아니다.** 포털이 localStorage 로 열린 탭을 복원해 뒤 화면일수록 호출이 는다(진입 API 27→47건, auth/me 13→30회). 화면마다 새 컨텍스트로 잰다.
4. **Node `Date.now()` 와 CDP `wallTime` 은 다른 시계다**(≈123~156ms 어긋남). 클릭 전후 분류는 페이지 시계(Resource Timing) 한 축으로 한다.
5. **long task 0 은 렌더가 가볍다는 뜻이 아니다.** 50ms 미만 작업 여럿이면 0 이다. 구간 분해(trace)로 판정한다. 보정 루프는 `page.evaluate` 최상위가 아니라 `setTimeout` 안에서 돌린다(최상위 동기 루프는 long task 로 잡히지 않는다).
6. **CDP `Performance.getMetrics` 의 `*Duration` 은 초 단위**이고, 구간은 두 스냅샷 사이 전체(메뉴 펼침·포털 홈 포함)다. 응답 뒤 성분을 보려면 trace 구간 값을 쓴다.
7. **`responseReceived.encodedDataLength` 는 헤더까지다.** 본문 크기는 `loadingFinished` 에서 받는다.
8. **진입 자동 조회 화면은 [조회] 클릭 지표가 무효다.** 첫 행 시점까지 끝난 요청만 세면 두 번째 요청을 놓친다. 클릭 뒤 조회 요청 수로 확인한다.
9. **요청 수와 체감 시간은 비례하지 않는다.** 동시에 나가는 중복 GET 은 벽시계로 1왕복이다. 개수는 부하·사슬 기준으로, 시간은 구간 분해로 따로 본다.
10. **e2e 준비 단계의 메뉴 경로를 그대로 베끼지 않는다.** layoutConfirm e2e 는 준비 단계로 「전문 헤더 정의」(headerMng)를 연다. 이를 베껴 headerMng 를 layoutConfirm 으로 잰 적이 있다.
11. **로컬은 전송 시간이 0 에 가깝다.** 3MB 도 본문 수신 ≈13ms 다. 응답 크기를 따로 기록하고 운영 망 영향을 적는다.
12. **TTFB 는 BFF 경유 값이다.** WAS 직접과 견주면 BFF 몫(≈15~25ms)이 나온다. "순수 서버 시간" 으로 적지 않는다.
13. **포털 홈 로딩 중에 메뉴를 누르면** 홈 호출이 진입 구간에 섞인다. 메뉴 트리만 기다리면 부족하다. 하네스는 기본으로 홈이 조용해질 때까지 기다린다(`RENDER_HOME_IDLE`).
14. **렌더 횟수는 profiling 번들로 센다.** dev 서버는 StrictMode 이중 렌더가 섞이고, `--no-mangling` 없이는 컴포넌트 이름이 깨진다.
15. **서버 첫 호출 회차는 느리다**(예열). 하네스는 cold 앞에 예열 회차를 돌려 버린다(`RENDER_WARMUP`). 3회 이상 재고 중앙값을 쓴다. 이 PC 는 같은 설정도 2배 흔들리므로 ms 1회 값으로 결론 내지 않는다.
16. **전후 비교는 같은 하네스 조건으로 한다.** 하네스를 고친 뒤 재면 하네스 수정 효과가 제품 수정 효과에 섞인다. 수정 전 값을 잰 조건(예: `RENDER_HOME_IDLE=0 RENDER_WARMUP=0`)으로 한 번, 새 기본값으로 한 번 재고 표를 나눈다.
17. **수정과 무관한 화면의 값도 함께 본다.** 같은 실행에서 바뀌지 않은 화면의 TTFB 가 2~4배였다(재측정 §4). 그 폭은 환경 차이로 보고 수정 효과에서 뺀다.

## 7. 리뷰 체크리스트 — 새 화면 PR

1. 첫 조회에 조건(필수 키워드·기간·상한·페이징)이 있다. 예상 건수·응답 크기를 적었다(R1).
2. 진입 호출 목록이 화면에 필요한 것뿐이고, 진입 자동 조회가 [조회] 와 겹치지 않는다(R3·R4).
3. 새 코드에 `fetch("/api/auth/me")` 직접 호출이 없고(`getCurrentUser()` 를 쓴다), 팝업·하위 컴포넌트에서 `useUserButtonRbac()` 를 다시 부르지 않는다(R9).
4. `onSnapshotChange` 를 행 클릭·선택·입력마다 부르지 않고, 선택 행(ID·버전)을 snapshot 에 넣지 않는다(R8, 2026-10-05 확정).
5. 화면 루트에 공용 `busy` 하나를 두지 않았고, 목록 `loading` 은 목록 조회 전용이다(R5, Local-Rules §11).
6. 0건이어도 그리드를 언마운트하지 않는다. 3항뿐 아니라 `&&` 조건부 렌더도 같다(R6).
7. effect·갱신 함수가 변화 없을 때 `prev` 를 돌려주고, `columns`·`data` 가 안정 참조다(R7, Local-Rules §20).
8. 전역 이벤트로 다시 조회하는 곳이 없고, 숨은 탭(폭 0)에서 다시 그리지 않는다(R10).
9. 상세 폼 state 가 화면 루트에 있지 않고(별도 상세 폼 컴포넌트 + `ref` 핸들), 그리드 열·행 deps 에 폼 객체 전체가 없다(R12).
10. 하네스에 화면을 등록해 cold 3회(`RENDER_ISOLATE=1`)를 쟀고, §5 예산 주 기준 항목 값을 PR 에 적었다.
11. 바꾼 파일·폴더에 `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바꾼 파일·폴더>` 를 돌렸고, 결과(오탐이면 이유)를 PR 에 적었다. 성능 항목(`P-R1`·`P-R6`·`P-R10`·`P-R12`·`P-R12b`·`P-K`·`P-R14`·`P-R16`·`P-R1b`)은 자동으로 잡히고, 나머지는 위 1~10 을 눈으로 확인한다.
12. shared 공통 컴포넌트를 새로 만들었으면 `count-renders` 로 동작당 렌더를 보고, 기존 shared props·동작을 바꾸는 수정은 사용자 승인을 받았다.
13. 위젯·대시보드에서 슬라이드·`refreshSec`·`setInterval` 타이머가 탭 활성·요소 표시와 연동되고(R14), 진입 불러오기가 준비 조건을 모아 한 번만 나가며 이미 그린 보드를 스켈레톤으로 되돌리지 않고(R13), 등록부 entry·배치 참조가 같은 결과면 그대로다(R7 확장).
14. 같은 목록을 쓰는 위젯·컴포넌트가 요청을 나눠 쓰고(호스트가 올린 저장소를 먼저 본다), 홈 진입 목록 요청이 각 1회다(R15, §5).
15. `useSyncExternalStore` 스토어는 필드별 훅으로만 구독한다. 위젯 안 행 클릭이 보드 프레임을 다시 그리지 않는다(R16, §5).
16. 목록 조회 응답에 본문·첨부 같은 큰 필드(수십 KB 이상)가 없고, 그런 값은 행 선택 때 상세 조회로 받는다(R1).

## 8. 알려진 미해결과 후속

- **R1·K1~K7 효과는 확인했다**(재측정 §4 기대값 모두 충족). R11 은 "행 가공 규칙" 을 기각하고 응답 크기 규칙으로 바꿨으며, R12 는 확정하고 F4 로 columnMng·termMng 에 적용했다(재측정 §3, R12 적용 사례).
- **탭 여러 개를 열어 둔 상태의 비용**은 탭 2개 전환만 쟀다. 숨은 탭 유지 비용은 미판정이다(검증 §4-4).
- **저장·등록 경로**(저장 뒤 목록·상세 연속 왕복)는 공용 DB 때문에 재지 않았다.
- **운영 망·운영 DB(Oracle·PostgreSQL)** 값이 아니다. 상한으로 줄어든 ≈2.5MB 전송은 로컬에서 보이지 않는다.
- **K7(조회 단추가 RBAC 로딩 동안 비활성)** 은 재지 않았다. 첫 진입은 me → RBAC 2왕복이 그대로다.
- **위젯 계층(위젯 분석 §6)**: W5·W6(타이머 표시 연동)은 코드를 고치지 않았고, 현재 기본 배치는 60초 대기 커밋 0·요청 0이라 영향이 없다. W7(`WidgetFrame` props 객체 매 렌더 신규)은 본체가 `memo` 가 아니라 무해해 조치하지 않는다(본체를 `memo` 화할 때만 의미). 홈 진입 커밋 96건 중 ≈45~55건은 표 위젯 안 AG Grid 셀의 컴포넌트 1개짜리 커밋과 ProgressBar 애니메이션 커밋이며 이번 범위 밖이다(합 ≈3ms). 창 폭 변경은 보드 전체 재렌더(WidgetFrame 143회)이며 구조 그대로다(비용 작음).
- **페이지 안 시계의 첫 행 판정**(`getClientRects`)이 ≈2~3ms 를 더한다(재측정 §3.1).

**2회차 결정 대기·한계**:

- **결정 대기(shared·화면 변경 승인 필요)**:
  1. ~~포털 홈 공지 카드가 본문을 포함해 50건을 받는다~~ — **완료**(perf/mcm-list-body): 목록은 `includeContent:false` 로 본문 없이 받고, 카드가 보이는 공지 1건의 본문만 `noticeId` 상세 조회로 받는다(R1 적용 사례).
  2. ~~`commWidgetMng` 목록이 `configJson` 을 실어 200KB 에 이른다~~ — **완료**(perf/mcm-list-body): 목록은 `includeConfig:false` 로 설정 없이 받고, 정의 위젯 행을 고를 때 `widgetId` 상세 조회로 받는다(R1 적용 사례). 위젯 보드는 다른 API(`widgetDef/list`)라 영향이 없다.
  3. ~~`AgDataGrid` 빈 오버레이가 `null` → `[]` 때 문구를 갱신하지 않는다~~ — shared 에서 고침(빈 상태·`emptyMessage` 변경 때 안내 재생성). 화면 쪽 빈 문구 상수는 우회가 필요 없어졌지만 동작이 달라지므로 그대로 둔다.
- **한계**: `ruleConfirm`·`layoutConfirm` 목록 정렬이 ID 뿐이라 한 대상에 DRAFT 가 여럿이면 상한 경계의 순서가 실행마다 달라질 수 있다(실제로는 거의 없다). `headerMng` 의 사용 전문 수(`USED_BY_COUNT`) 계산은 상한과 무관하게 전문 전체를 읽는다.
- **운영 DB 건수 미확인**: domainMng·codeMng·codeItemEdit·dataMng 와 마스터코드 2화면은 로컬 171·17·18·3건과 마스터 성격만으로 오탐 판정했다. 운영 행 수가 1,000건·500KB 를 넘는다면 R1 을 적용한다.

후속 후보(재측정 §6, 아직 고치지 않음):

| # | 대상 | 문제 | 방향 |
|---|---|---|---|
| ~~F1~~ | `ColumnMngService.java:136-144` | **완료**(perf/f1-db-sort). 조건 없는 상한 조회에서도 ID·논리명을 전부 읽어 Java 로 정렬한 뒤 1,000건을 골랐다. TTFB 107~136ms 로 예산 초과(termMng 46ms) | DB `ORDER BY 논리명, ID LIMIT`·`COUNT(*)`, 정렬 키는 기존 유일 인덱스 `UX_TB_MDM_COLUMN_NAME` 이 덮어 마이그레이션 없음. 방언별 순서 차이는 2026-10-05 사용자 결정으로 감수. 구현 완료, C1 조건 TTFB 는 약 10% 줄었지만 아직 예산 초과(남은 몫은 1,000건 상세 조회·직렬화). 결과·수치는 R1 |
| F2 | `TermMngService.java:227` | 저장마다 `search(new TermSearchRequest())` 로 상한 없는 전체 목록(≈8천 건·≈3MB)을 재구성해 돌려준다 | 저장 응답은 저장한 행·경고만, 목록은 화면이 현재 조건(상한 포함)으로 재조회 **완료(커밋 eab62a1c, 시험 b2d107b5)**: 저장 응답에서 `list` 를 뺐다(화면은 이미 저장 뒤 현재 모드로 재조회, 다른 호출자 없음). 적용 사례는 R1 의 noticeMgmt 와 같은 방식 |
| F3 | `shared/src/components/dashboard/DashboardBoard.tsx:148`, `dashboard/layout.tsx:165`, `m-mcm/widget-types/memo/memo-user.ts:24`, `unit-converter/unit-user.ts:18` | 사용자 ID 만 쓰려고 `useUserButtonRbac` 를 구독한다(K4 형태) | `useCurrentUserId()` 로 바꾼다. 요청은 이미 캐시라 늘지 않고, RBAC 인스턴스 상태만 준다. 위젯 수정(`perf/fix-widget`)에서도 손대지 않았다(그대로, memo·unit-converter 는 기본 배치 밖) **완료(커밋 b3383077, 시험 311851ce)**: `useCurrentUserState` 로 교체(R9 적용 사례) |
| ~~W5·W6~~ | `widget-types/media/renderer.tsx`(슬라이드), `shared/src/widget/WidgetFrame.tsx` `refreshSec` effect | **완료**(커밋 `ca8cce09·a831daa0`). 숨은 위젯 타이머 정지, 보일 때 밀린 1회만 | 결과는 R14 적용 사례. audit `P-R14` 는 `WidgetFrame` 에 정보 1건 남음(예외 목록) |
| W7 | `WidgetFrame.tsx:223-231` | props 객체가 매 렌더 새로 만들어진다(무해) | 조치 없음. 본체를 `memo` 화할 때 같이 본다 |
| ~~F4~~ | columnMng·termMng 상세 폼 | **완료**(커밋 `a416187b·02e36638·0b9ef24b`). 입력 한 글자마다 화면 루트 렌더, termMng 은 추천 그리드 셀 연쇄(R12 위반)였다 | 상세 폼 컴포넌트 분리, `recoColumns` 를 `form` 에서 떼기. 결과는 R12 적용 사례 |
| ~~F5~~ | dataMng·codeMng·layoutConfirm(+ codeConfirm·ruleConfirm·ruleSetConfirm) | **완료**(브랜치 `perf/f5-no-row-snapshot`). 행 클릭 셸 1회(선택 행 snapshot) | 사용자 결정 "F5 는 복원 빼"(2026-10-05): 선택 행을 snapshot 에 넣지 않는다. 결과는 R8 적용 사례, audit `P-R8` |
| ~~F7~~ | m-mdm·analog 포털 탭 진입 `mdmMeta/columns` | **완료**(커밋 `e6dd175d`, 시험 `73831d0c`). MDM 서버는 `mdmMeta` 를 켜지 않아(설계상) 세션마다 그 모듈 첫 탭 진입에서 404 를 받았다(mdm-after-fix §F7) | 엔드포인트 없는 모듈(`MDM_META_UNSUPPORTED_MODULES`) 탭은 portal-shell 이 공급자를 미리 꺼 요청 0. 경로는 모듈별 그대로 둔다 |
