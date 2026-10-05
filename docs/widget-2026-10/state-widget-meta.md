# widget-meta 레인 정본 메모 (2026-10-05)

레인: widget-meta(설명 여러 줄 7 · 분류 6 · 비공개 10). 지시: `~/.coord/widget-2026-10-05/lanes/widget-meta/brief.md`.

## 진행

| 항목 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| 7 설명 여러 줄 | 커밋됨 | 452c54bd | `__desc` 에 `white-space:normal`+3줄 line-clamp, 전체는 `title` 툴팁. shared `widget-picker`(6) 통과 |
| 6 분류 | 커밋됨 | b6cc2ab6 | 아래 상세. shared `widget-picker`(10)·`widget-registry`(15), m-mcm `form-model`(43)·`api`(12), `mcm-core` widget.admin·widget.def 43건 통과(gradle, workers 2, heavy.sh, JDK21) |
| 10 비공개 | 커밋됨 | 0936aeba | `PRIVATE_YN` 칸·서랍 ID 전체일치 노출·관리 체크칸. shared `widget-picker`(12)·`widget-registry`(17), m-mcm `form-model`(44)·`api`(12), `mcm-core` widget 44건 통과(gradle 대상클래스만, JDK21) · shared/m-mcm `tsc` 내 변경분 0 |

머지 준비 7 6

## 항목 6 상세

- 백엔드: `WidgetDef.CATEGORY_CD`(VARCHAR20) · `WidgetDefSaveRequest.categoryCd` · `CommWidgetMngService.save` 검사(길이 20, 공백→NULL) · `WidgetDefMaps` 키 추가 · 요약 조회 열 추가 · `V18` WIDGET_CTG 시드(COMMON/PROD/QUAL/LOGI/TOOL/INFO).
- shared: `WidgetMeta.category` · `WidgetDefRow.categoryCd` · `toWidgetDefRow`/`applyWidgetOverride`/`defWidgetMeta` 전파 · `WidgetPicker` 새 선택 속성 `categoryTitles`(분류 묶음+칩 필터)·`onPreview`(마우스 올림 콜백, widget-tabs 미리 배치용).
- m-mcm: `commWidgetMng` types·form-model(categoryCd 흐름·검사) · 새 파일 `use-widget-categories.ts`(WIDGET_CTG LoV, 모듈 캐시) · `WidgetDetailForm` 분류 Select · `WidgetListTab` 분류 칸. 코드 위젯 메타 11개(`widgets/home/*`)에 `category` 한 줄.
- 소유 확장 승인(조정): `widgets/home/*/widget.meta.ts` 11개, `commWidgetMng/types.ts`·`page.tsx`. `LayoutTab.tsx` 는 widget-tabs 소유라 안 고침(새 훅 파일로 회피).

## 남은 일

1. 항목 7·6 리뷰(각 sonnet/opus) 반영 후 커밋 2건(7 먼저).
2. 항목 10 비공개: `PRIVATE_YN` 칸·서랍 검색어=위젯 ID 전체 일치 시만 표시·관리 화면 체크칸.
3. 머지 요청 직전 dev 재통합·전체 시험(heavy.sh). 이때 V18 시드로 바뀐 초기화 지문: dev 합친 뒤 mcm/api `DataInitializerSeedFingerprintTest` golden 을 `FINGERPRINT_UPDATE=true` 로 재생성해 함께 커밋(충돌도 재생성으로 해소). `m-mcm/lib/generated/**` 충돌은 생성 스크립트로 재생성.
4. ERD 조각(`erd-widget-meta.md`) 항목 10 칸 추가.

## 조정 세션에 넘길 것

- `WidgetWorkspace.tsx`(금지 파일)가 `WidgetPicker` 를 그리므로 서랍 분류 묶음·onPreview 표시는 Workspace 에서 `categoryTitles`(및 필요 시 `onPreview`) 를 넘겨야 보인다 — widget-tabs 레인·조정이 배선. 이 레인은 계약(props)만 제공.
- 운영 DDL: `TB_MCM_WIDGET_DEF.CATEGORY_CD` ALTER 문(erd 조각 참고) + WIDGET_CTG 코드그룹 운영 등록.

## 시험

- shared: `widget-picker`(10)·`widget-registry`(15) 통과, `tsc --noEmit` 0 오류.
- m-mcm: `form-model`(34)·`api`(21) 통과, tsc 오류 = 형제 패키지 미빌드 기존분(m-mdm·m-analog 페이지 27줄, 내 변경분 0).
- 백엔드: `mcm-core` widget.admin·widget.def 43건 통과(gradle, workers 2, heavy.sh).

머지 준비 10
