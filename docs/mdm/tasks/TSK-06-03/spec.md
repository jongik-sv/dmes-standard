# mdm/TSK-06-03 코드 편집 — 그리드·트리·경미 수정
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [04 「구조: 마루 코드 → 버전 · 코드 · 카테고리」](design/basic/04-master-code-deploy-full.md) · [04 「계층과 다목적 분류」](design/basic/04-master-code-deploy-full.md) · [04 「판정 참고 구현(사본 쿼리)」](design/basic/04-master-code-deploy-full.md) · [04 「경미 수정(패치)」](design/basic/04-master-code-deploy-full.md) · PRD FR-C3 · 시안: [04 「탭3·4 코드 편집」](design/basic/html/04-master-code.html) · 시안: [04 「탭4 코드 편집(계층) 트리 보기」](design/basic/html/04-master-code.html) · 시안: [04 「경미 수정 패널」](design/basic/html/04-master-code.html)
> entry-point: /portal → mdc/codeItemEdit (메뉴: MDM > 마스터코드 > 코드 편집)
> depends: mdm/TSK-06-01, mdm/TSK-01-03, mdm/TSK-03-02

## 요구사항
- DRAFT 코드 행 추가·수정·삭제(선분 from_ver–to_ver), 행 되돌리기, 코드 삭제 시 TABLE CATE_ITEM 연쇄 닫기
- 동적 열(lvl_cnt, 라벨 있는 attr), 닫힌 코드 보기, 낙관적 잠금
- 저장 검사(콤마·공백, 계층 3검사, 라벨 없는 attr, 구간 겹침)
- lvl 트리 보기(접기·펴기, 이 노드로 편집, 필터 칩)
- 카테고리 선택 미리보기 패널(콤보/목록·근거 모드)
- RELEASED 코드 행의 이름·약칭·순서·설명 in-place 수정

## API 스펙
OASIS 서비스 `codeItemEdit` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 04 「샘플 데이터」 저장 검사 결과 일치
- [ ] RELEASED·CANCELLED 는 읽기 전용 diff
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-codeItemEdit.spec.ts` 가 통과한다
- [ ] `sql/04-hier-tree-sim.py` 트리 결과와 일치
- [ ] 코드·계층·attr 값은 잠김
- [ ] DRAFT 가 같은 키를 고쳤으면 거부
