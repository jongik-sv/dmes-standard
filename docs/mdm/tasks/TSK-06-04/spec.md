# mdm/TSK-06-04 카테고리 편집 — REGEX·TABLE
> stage: as · category: dev · domain: fullstack · priority: high · model: sonnet
> prd-ref: [04 「카테고리 정의 방식」](design/basic/04-master-code-deploy-full.md) · PRD FR-C4 · 시안: [04 「탭6 카테고리(REGEX)」](design/basic/html/04-master-code.html) · 시안: [04 「탭5 카테고리(TABLE)」](design/basic/html/04-master-code.html)
> entry-point: /portal → mdc/codeCateEdit (메뉴: MDM > 마스터코드 > 카테고리 편집)
> depends: mdm/TSK-06-01, mdm/TSK-01-03, mdm/TSK-03-02

## 요구사항
- 버전별 카테고리 목록·추가·닫기, REGEX 정규식·대상 칸 입력
- 일치·불일치 두 목록 서버 재해석 미리보기
- transfer list(전체 선택·건수·검색·attr 필터·Shift 범위·더블클릭, `>` `>>` `<` `<<`, 추가·제외 표시)
- TABLE 소속 저장(선분), 빈 카테고리·없는 코드 경고

## API 스펙
OASIS 서비스 `codeCateEdit` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 정규식 문법 오류 저장 거부
- [ ] BASE 편집·닫기 불가(화면·서버)
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-codeCateEdit.spec.ts` 가 통과한다
- [ ] 코드 1,000건에서 이동·저장이 1초 이내
- [ ] 소속 코드는 유효 코드여야 저장
