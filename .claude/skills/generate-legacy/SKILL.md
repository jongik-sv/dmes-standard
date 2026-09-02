---
name: generate-legacy
description: "[V3 부터 deprecated] 별도 산출물을 만들지 않고 /generate-bpa 를 위임 실행한다. V2 까지 생성하던 `_legacy_analysis.md` 의 내용은 `/generate-bpa` 가 생성하는 통합 보고서 `screens/{SCREEN-ID}.md` 의 §A 기술 상세 Appendix 로 흡수되었다. 호환을 위해 alias 로 남겨두며 신규 사용에서는 `/generate-bpa` 직접 호출 권장."
---

# /generate-legacy — Deprecated (V3 alias)

> ⚠️ **V3 부터 본 스킬은 별도 산출물을 만들지 않는다.** 호출 시 `/generate-bpa` 를 위임 실행하고, 그 결과 보고서의 §A 기술 상세 Appendix 가 V2 의 `_legacy_analysis.md` 역할을 한다.
>
> ⭐ **V4 (2026-05-13) — 영역 분리 폴더 구조**: 위임된 `/generate-bpa` 의 V4 경로 규칙이 적용된다 — 산출 위치 `docs/external/SampleErp/orgErpReport/{areaId}/{moduleId}/screens/{SCREEN-ID}_{화면명}.md`. 영역 매핑은 PLUGIN_USAGE.md §1.2.1 참조 (조업/품질/물류).

## 위임 동작

`/generate-legacy [SCREEN-ID]` 호출 시:

1. Skill tool 로 `/generate-bpa [SCREEN-ID]` 를 실행한다
2. 결과 통합 보고서가 `screens/{SCREEN-ID}.md` 에 생성됨을 사용자에게 안내한다
3. §A 기술 상세 Appendix 가 V2 `_legacy_analysis.md` 의 모든 내용을 포함한다고 알린다

## V2 → V3 이전

| V2 산출물 | V3 위치 |
|---|---|
| `{moduleId}/{SCREEN-ID}/{SCREEN-ID}_legacy_analysis.md` | (별도 파일 없음) |
| §1 시스템 개요 ~ §3 비즈니스 로직 | `screens/{SCREEN-ID}.md` §1~5 (비즈니스 본문) |
| §4 데이터 요구사항 (테이블/컬럼) | `screens/{SCREEN-ID}.md` §9 (관련 엔티티) + `DBMS/tables/` 링크 |
| §5 MSSQL procedure 호출 매핑 | `screens/{SCREEN-ID}.md` §A2 (Appendix) + `DBMS/procedures/` 링크 |
| §6 WinForms UI 분석 | `screens/{SCREEN-ID}.md` §8 (화면 구성) + §A5 (Designer 컨트롤 트리) |
| §7 inline SQL | `screens/{SCREEN-ID}.md` §A3 (Appendix) |

## 권장 사용법

```bash
# V3 권장 (직접 호출)
/generate-bpa [SCREEN-ID]

# 호환 (자동 위 명령으로 위임)
/generate-legacy [SCREEN-ID]
```

## 사용자 안내 메시지 (필수 출력)

본 alias 실행 시 사용자에게 다음을 정확히 출력한다:

```
ℹ️  /generate-legacy 는 V3 부터 deprecated 입니다.
   /generate-bpa [SCREEN-ID] 를 자동 실행합니다.

   V2 의 _legacy_analysis.md 내용은 screens/[SCREEN-ID].md 의
   §A 기술 상세 Appendix 에 통합되어 있습니다.

📁 출력 (V3):
  - 통합 보고서: docs/external/SampleErp/orgErpReport/[moduleId]/screens/[SCREEN-ID].md
  - BPMN     : docs/external/SampleErp/orgErpReport/[moduleId]/screens/[SCREEN-ID].bpmn
```

## 실행 정책

- 별도의 분석 / 본문 작성 / 산출 작업을 본 스킬 내부에서 수행하지 않는다 (전부 `/generate-bpa` 가 담당)
- 호출 즉시 위 안내 메시지 + Skill tool 위임만 수행
- 팀원 spawn 절대 금지

## 향후 제거 계획

V4 시점에 본 스킬은 제거된다. `/generate-bpa` 가 정본 PRIMARY 스킬.
