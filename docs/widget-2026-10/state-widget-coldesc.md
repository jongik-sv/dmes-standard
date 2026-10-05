# widget-coldesc 정본 메모

- 지시: widget-coldesc-1 (위젯 관리 칸마다 MDM 컬럼 사전 설명 툴팁)
- 브랜치/워크트리: `feat/widget-coldesc` / `/Users/jji/project/dmes-standard-wt/widget-coldesc`

## 진도 (2026-10-06)

| 단계 | 상태 |
|---|---|
| 1 조사 | 끝 — 키 28곳, 시작 hit 9 / missing 6 |
| 2 설명 작성 | 끝 — `scripts/mdm-meta/columns-widget-2026-10-05.json` (새 컬럼 15·용어 1·기존 4 설명 갱신) |
| 3 화면 meta 키 | 끝 — WidgetListTab·WidgetDetailForm (LayoutTab 은 칸이 「배치」 목록 머리글 하나뿐이라 변경 없음) |
| 4 등록 | dry-run 끝(PLAN 20·FAIL 0), `--apply` 는 조정 허가 대기 |
| 5 확인 | tsc 통과, commWidgetMng vitest 145 통과, 리뷰 1회 지적 반영. 전후 hit 비교는 apply 뒤 |

## 키 정리

위젯 전용 이름으로 새로 만든 표준 컬럼: WIDGET_TITLE · WIDGET_AUX_TITLE(별칭 WIDGET_SUBTITLE) · WIDGET_DESC(별칭 WIDGET_DESCRIPTION) · WIDGET_PRIMARY_SZ/MIN_SZ/MAX_SZ(별칭 WIDGET_DEFAULT_SIZE/MIN_SIZE/MAX_SIZE) · WIDGET_USE_YN · WIDGET_TP(별칭 WIDGET_KIND) · WIDGET_KND_NM(별칭 WIDGET_TYPE_TITLE) · WIDGET_CLSF_CD(별칭 CATEGORY_CD) · WIDGET_PRIVATE_YN(용어 「비공개」 신규) · WIDGET_RE_DEFINE_YN(별칭 WIDGET_OVERRIDDEN) · WIDGET_USER_CNT(별칭 WIDGET_USER_COUNT) · WIDGET_EXE_MODULE(별칭 WIDGET_DATA_SRC) · WIDGET_KND_SET(별칭 WIDGET_TYPE_CONFIG).

기존 위젯 전용 컬럼 설명 갱신: WIDGET_ID · RENEWAL_CYCLE_SS(REFRESH_SEC) · LNK_PAGE_ID(LINK_PAGE_ID) · MLT_YN(MULTIPLE_YN). 범용 TITLE·KIND·USE_YN·CATEGORY 설명은 건드리지 않았다.

## 남은 일

1. 조정 허가 뒤 `register-columns.mjs --file scripts/mdm-meta/columns-widget-2026-10-05.json --user <표준관리자 사번> --apply`.
2. 10초 뒤 `check-meta.sh` 로 전후 hit 비교, 같은 명령을 다시 돌려 SKIP 확인.
3. README §4 형식 머지 요청.
