# 정본 메모 — tooltip-shared 레인

- 지시: tooltip-shared-1 (`/Users/jji/.coord/tooltip-2026-10-05/lanes/tooltip-shared/brief.md`)
- 브랜치·워크트리: `fix/tooltip-shared` / `/Users/jji/project/dmes-standard-wt/tooltip-shared` (기준 dev e00a3c7c)
- 조정 세션: dmes-standard-0f

## 항목 상태 (2026-10-05)

| 항목 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| A1 mdm 탭 → mcm 메타 | 완료·리뷰 clean | c2cf6be8, 68d2bb9e | analog 만 끔 |
| A2 SearchField name·meta | 완료·리뷰 지적 반영 | 562289e1, 5fdb687a | 특성 시험 선행 |
| A3 기본 머리글 툴팁 | 완료·리뷰 clean | 1e6f0393, 892c17dd | 잎 열만, 그룹 머리·No 열 제외 |
| A4 툴팁 지연 500ms | 완료·리뷰 지적 반영 | 8af10d91, 493fe2ed | 셀 툴팁도 빨라짐(문서화) |
| A5 문서 | 완료 | 90aeaf59 | 스킬 문서·색인·FE 가이드 |
| A6 리팩토링 리뷰·전체 시험 | 완료(리뷰 clean, shared 1540 통과) | fa28c5d5 | dev dffe0f95 합침 |
| A7 FE 성능 | 완료(perf-tooltip-shared.md P1, 머지 05bfcbb8) | — | 측정 워크트리 tooltip-perf-base(dffe0f95)·tooltip-perf-head(f36820bd), shared·형제 빌드 완료, 절차는 perf-tooltip-shared.md |

## 머지
- A1~A6: dev 머지 f36820bd(트리 4aafcb6f, 지시 tooltip-shared-2). 메인 체크아웃 shared·형제 tsup 재빌드 완료.

## A7 준비(조정자에 제안 보냄)
- (정정) layout 에 더해진 shared 내부 코드는 축소 약 16.8K. DOMPurify 는 dist 가 외부 import 하므로 한 벌이다(처음 보고한 「사본 10곳」 은 오측). 메타 store 사본은 묶음 6개.
- 제안: dffe0f95 vs f36820bd 를 m-mcm next build 로 화면 청크 비교 → shared tsup splitting:true(사용자 결정) → 그 뒤 HTML 카드 DOMPurify 지연 로드.

## 상태: 완료 (2026-10-05)
- A1~A6 머지 f36820bd, A7 기록 머지 05bfcbb8. 워크트리 `tooltip-shared`·브랜치 `fix/tooltip-shared` 정리(force 없이), 측정 워크트리 tooltip-perf-base·head 정리.
- 남은 일 없음. 사용자 결정 안건: shared tsup `splitting: true`(perf-tooltip-shared.md 「사용자 결정 안건」).

## 알려진 한계
- 리팩토링 리뷰 질문(바꾸지 않음): 화면이 `headerTooltip: ""` 를 주면 머리글뿐 아니라 셀 MDM 카드(tooltipComponent)도 빠진다. 이 레인 전부터의 동작이다.
- 공백만 있는 머리글 이름 판정이 메타 경로(`headerName || physName`)와 기본 경로(`trim()`)에서 다르다. 메타 경로는 이 레인 전 코드라 동작을 바꾸지 않았다.
- `MdmHeaderLabel` 의 지연은 라벨이 만들어질 때 `api.getGridOption("tooltipShowDelay")` 로 읽는다. 화면이 실행 중에 `tooltipShowDelay` 를 바꾸면 이미 그린 HTML 머리글 카드는 예전 지연을 쓴다(드문 경우라 두었다).
