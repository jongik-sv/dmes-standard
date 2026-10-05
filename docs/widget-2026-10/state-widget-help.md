# widget-help 레인 정본 메모

- 브랜치: `feat/widget-help` / 워크트리: `/Users/jji/project/dmes-standard-wt/widget-help` / 조정: dmes-standard-90 / 지시: widget-help-1
- 갱신: 2026-10-05

## 진도
- H2 (S) 분류 Select 「없음」 결함: 완료 (a2898570)
  - 원인: 메인 포털 5100 dev 서버 상태(/api/*/lov/** 전체 응답 멈춤, 재기동으로 해소). BFF·BE 코드 결함 아님.
    워크트리 5199 별도 dev 서버 재현(200·0.41초)·forwardToBackend 실 BE 호출(200·29ms)로 코드 정상 확인, 조정 세션이 5100 재기동 뒤 200·64ms 확인.
  - 방어: use-widget-categories 가 빈 결과·실패·8초 시간 초과를 모듈에 보관하지 않고 다음 마운트에서 재조회. 시험 5건.
- H1 (M) 위젯 관리 「도움말」: 완료
  - 화면: 탭 줄 오른쪽 「도움말」 버튼 → 모달 「위젯 만드는 여러 가지 방법」(목차 + 본문). commWidgetMng/help/WidgetHelpModal.tsx(동적 import).
  - 공통 부품: shared `MarkdownDocViewer`(markdown-editor 서브패스, 추가만). 스킬 문서·색인 갱신.
  - 문서: 원문 `docs/guide/FrontEnd/Widget-Authoring-Guide.md`(약 950줄, 10장). 화면 번들은 `scripts/gen-widget-guide.mjs`(`pnpm --filter @dk-oasis/mcm gen:widget-guide`)가 만든 `widget-guide-content.ts` 이고 `widget-guide-sync.test.ts` 가 어긋남을 막는다.
  - 리뷰: sonnet/high 1회(문서 사실 대조 + 화면 코드). 문서 사실 오류 11건·화면 지적 9건 반영.

## 시험
- m-mcm vitest 전체 74 파일 1473건 통과, shared markdown-doc-viewer 7건 통과, m-mcm·shared tsc --noEmit 오류 0.
- 브라우저 확인은 하지 않았다(조정 세션이 머지 뒤 확인). 확인 포인트: 탭 줄 버튼 정렬, 모달 높이·이중 스크롤, 목차 클릭 이동·현재 절 표시.

## 남은 일
1. 머지 뒤 브라우저 확인: 위젯 관리 > 도움말 모달(목차·스크롤·닫기), 분류 Select 에 INFO 「외부 정보」 표시.
2. 문서 미확인 항목: 권한 시드(PERM_ALL)·4개 작업, 메모 임시 보관 7일, 미디어·AI 챗봇 한도 일부, 도구 창 접기·닫기 초점 복귀. 정시 수집 값을 다른 위젯 유형이 읽는 방법은 문서에서 뺐다.
3. 이 레인 밖: shared `useWidgetVisible` 미등재 export(ui_docs.py coverage), 도구 창 서버 저장 방식은 후속 계획.
