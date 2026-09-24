# mdm/TSK-06-02 마루 코드 조회·등록·수정·버전
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [04 「화면」](design/basic/04-master-code-deploy-full.md) · [04 「추가 컬럼」](design/basic/04-master-code-deploy-full.md) · [04 「코드 삭제와 마루 코드 폐기」](design/basic/04-master-code-deploy-full.md) · [04 「버전 상태와 적용시점」](design/basic/04-master-code-deploy-full.md) · PRD FR-C1 · PRD FR-C2 · 시안: [04 「탭1 조회·등록」](design/basic/html/04-master-code.html) · 시안: [04 「탭2 수정 — 카드 ①~③」](design/basic/html/04-master-code.html) · 시안: [04 「탭2 수정 — 버전 목록·새버전 대화상자」](design/basic/html/04-master-code.html)
> entry-point: /portal → mdc/codeMng (메뉴: MDM > 마스터코드 > 마루 코드); /portal → mdc/codeEdit (메뉴: MDM > 마스터코드 > 마루 코드 수정)
> depends: mdm/TSK-06-01, mdm/TSK-01-03

## 요구사항
- 조회(마루 코드·상태), 현재 버전은 구간에서 조회(없으면 미확정 표시)
- 등록(MDM 원천만): TB_MDM_CODE(CREATED)·VER 1.000 DRAFT·CATE BASE 를 한 트랜잭션
- 헤더 경미 수정
- 추가 컬럼 라벨 attr01–10, DEPRECATED 전이(미적용 버전 없을 때)
- 버전 목록(종류·상태·적용 구간·소유자), 상태별 버튼 활성 매트릭스(확정 이동 포함)
- 새 버전 대화상자: major=floor(max)+1, minor=max+0.001(999 상한), 빈 버전/복원(restored_from)
- DRAFT 선점·해제·넘기기, DRAFT 삭제 시 선분 복구

## API 스펙
OASIS 서비스 `codeMng` — `/api/mdm/oasis/{serviceId}/{action}`
OASIS 서비스 `codeEdit` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] ID 문자 제약·TB_MDM_DATA ID 중복 거부
- [ ] 등록자가 DRAFT 를 자동 선점
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-codeMng.spec.ts` 가 통과한다
- [ ] 등록은 MDM 원천만 받는다
- [ ] 폐기 후 CODE_LIST 에서 숨고 MASTER 판정은 유지
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-codeEdit.spec.ts` 가 통과한다
- [ ] 미적용 버전이 있으면 새 버전 거부, 2개면 DRAFT 삭제만 허용
- [ ] 복원 diff 가 코드·카테고리·CATE_ITEM 모두 채운다
