# 머리글 툴팁·컬럼 사전 회차 요약 (tooltip-2026-10-05)

2026-10-05 조정 세션 dmes-standard-0f 가 조정자 스킬(`.claude/skills/coordinator`)로 레인 5개를 돌려 끝냈다. 레인 공통 규칙은 [README.md](README.md), 레인별 기록은 같은 폴더의 `state-*`·`structure-*`·`perf-*` 문서다.

## 1. 무엇이 문제였나

- 그리드 머리글·폼 라벨 툴팁은 MDM 컬럼 사전 메타(`/api/{모듈}/mdmMeta/columns`)가 있는 칸에만 붙는다.
- MDM 메뉴 화면은 `/api/mdm/mdmMeta` 가 없어(MDM 서버는 cactus.mdm 을 켜지 않는다) 메타를 아예 받지 않았다(e6dd175d 로 요청도 끔).
- 상세 영역을 맨 `<th>` 글자로 그리는 화면(36파일)과 `SearchField` 는 툴팁 장치가 없었다.
- 사전에 없는 열은 기본 툴팁도 없었고, 그리드 툴팁 지연은 ag-grid 기본 2초였다.
- 화면 키 416개 중 사전 hit 는 61개뿐이었다.

## 2. 무엇을 바꿨나

| 레인 | dev 머지 | 내용 |
|---|---|---|
| tooltip-shared | f36820bd · 05bfcbb8 | mdm 탭은 mcm 메타를 받는다(`MDM_META_TAB_MODULES`, analog 만 끔). `SearchField` `name`·`meta`. 메타 없는 잎 열 기본 `headerTooltip`=표시 이름(`headerTooltip: ""` 로 끔). 그리드 툴팁 지연 기본 500ms(`GRID_TOOLTIP_SHOW_DELAY_MS`). 스킬 문서·Local-Rules §27·Screen-Performance-Guide F7 |
| tooltip-screens | dffe0f95 · 2922c58a | 상세 `<th>` 약 250개를 `MdmFieldLabel` 로, SearchField 31곳에 `name`, 범용·UI 전용 키 `meta: false`, 표시용 키는 표준 물리명으로 연결(OBJ_NM→OBJECT_NM, CODE_VAL→CD_V 등). 공지사항 관리는 MDM 캡션 우선을 제목에만 |
| mdm-column-dict | 0fb516aa | 화면 키 분류표(docs/mdm-column-dict/classification.md). mdm 피드가 `systemCode` 목록(`MES,MDM`)을 받아 표준 → MES 별칭 → MDM 별칭 순으로 찾음, mcm 설정 `system-code: MES,MDM`. 등록 묶음·스크립트(scripts/mdm-meta/), 측정 스크립트(scripts/perf/mdm-meta/) |
| tooltip-refactor | d437a6ea | 리팩토링: 열 반복 `meta: false` 약 90곳을 모듈 안 `uiCols` 로, 위젯 유형 편집기 4개를 `MdmMetaProvider disabled` 로, 라벨 17곳 상수화. 정적 고정 시험으로 동작 보존 |
| kit-fix | 5f703b45 | 이번 회차에서 겪은 도구 결함 수정: spawn-lane(빈 탭+send, 조정자 워크트리 탭), term-send-safe(이름 붙은 가로줄), deps.sh(워크트리 밖 심링크 보호), apply_mdm_self.py 경고 |

조정 세션 작업: MDM → mcm 재기동(13:02·13:03), 컬럼 등록 `register-columns.mjs --apply` 71건(용어 1·신규 컬럼 59·별칭 11) — 작성자 41000132, 등록 전 DB 사본은 조정 세션 scratchpad.

## 3. 결과

- 사전 hit: 화면 키 416개 중 61 → 210(기대 147 전부 + 2, 잃은 것 0).
- 브라우저 확인(로컬 포털): 메뉴 관리 그리드 `MENU_ID`·`MENU_SEQ` 카드, 상세 라벨 카드(트리거 0→5), 검색칸 카드, 메타 없는 열 기본 툴팁(0.5초), 컬럼 사전(MDM 화면)에서 MDM 별칭 경로 카드(`COLUMN_NAME`·`PHYS_NAME`·`SYSTEM_CODE` 등), 공지사항 관리 라벨이 화면 글자 그대로.
- FE 성능(perf-tooltip-shared.md): m-mcm 빌드 JS 청크 −2.0%(gzip −2.5%), SearchField 청크 3개 104KB → 1개 41KB. 화면 청크 증가 없음. audit 의심 0.
- BE 성능(perf-mdm-column-dict.md, 5회차, load1 3.2~3.4): mcm 표준 경로 7.20 → 7.09ms(응답 52% 커짐에도 같음), 화면 416키 4.1~4.9 → 3.7~3.9ms, 피드 `MES,MDM` 은 `MES` 보다 +1.9ms(+14%)에 hit 2배. 튜닝 대상 없음.

## 4. 사고와 교훈

- 12:05 메인 체크아웃 `node_modules/@dk-oasis/*` 링크 9개가 레인 워크트리를 가리켜 포털이 `Can't resolve '@dk-oasis/shared/auth-cookies'` 로 깨졌다. 워크트리에 남은 node_modules 심링크를 pnpm install 이 따라간 것이 원인. 링크를 되돌려 복구했고 deps.sh 를 고쳤다(kit-fix E3).
- 형제 패키지 dist 는 머지만으로 바뀌지 않는다. 화면 머지 뒤 메인에서 형제 tsup 을 다시 돌리기 전까지 옛 동작(공지 라벨이 사전 캡션)이 보였다.
- Spotlight 색인(새 워크트리 node_modules)이 load1 을 25 까지 올려 첫 BE 측정을 버렸다.

## 5. 사용자 결정 안건

1. shared tsup `splitting: true` — 메타 store 를 담은 청크가 41개(4.13MB). 급하지 않음, 효과는 따로 재야 함(perf-tooltip-shared.md).
2. 범용 키 자동 끔 — `resolveMdmPhysName` 이 범용 키 목록을 자동으로 끄면 화면에 남은 `meta: false` 약 160곳이 사라지고, m-mcm·m-mdm 의 `uiCols` 사본 둘도 하나로 합칠 수 있다. shared 동작 변경이라 승인 필요.
3. 화면이 끈 실제 DB 컬럼 `C_USR_ID`·`TARGET_TYPE`(사전 자동 판정은 신규 등록 대상)을 등록하고 켤지.
4. 운영 DB(Oracle·PG) 반영: `scripts/mdm-meta/register-columns.mjs` 를 운영 MDM 에 다시 돌린다(README §1 표준관리자 인증). mcm 은 MDM 먼저 배포 뒤 배포.

## 6. 알려진 한계·후속

- m-mdm 시험 중 고부하에서 흔들리는 것: domainMng page-render, ruleSetEdit debug-mode E6-6, rule-set-edit-page Review Focus 5, sections-render 도메인 칸(변경 전 코드에서도 재현).
- `apply_mdm_self.py` 는 META_REV 를 남기지 않는다(경고만 넣음). 별칭은 columnMng save 경로로 바꿀 것.
- `headerTooltip: ""` 는 셀 MDM 카드도 끈다(이전부터의 동작).
