# mdm/TSK-01-03 권한 가드·공통 셸 + 버전 상태 서비스(담당자 확정)
> stage: as · category: infra · domain: fullstack · priority: high · model: opus
> prd-ref: [04 「버전 상태와 적용시점」](design/basic/04-master-code-deploy-full.md) · [04 「상신 시 검사」](design/basic/04-master-code-deploy-full.md) · [06 「테이블 설계」](design/basic/06-business-rule.md) · PRD §2 규칙 7 · PRD §3, TRD §6 · PRD FR-F1
> entry-point: /portal → MDM 메뉴 그룹 (메뉴: MDM)
> depends: mdm/TSK-01-02

## 요구사항
- MDM 메뉴 그룹 트리(용어·도메인 / 레이아웃 / 마스터코드 / 마스터데이터 / 업무기준) 시드
- 역할 2종(표준 관리자·담당자) 시드와 화면·액션별 권한 매핑 기본값
- m-mdm 공통 화면 셸(PageLayout, 상태 배지, 잠금 배지)
- 이번 범위의 전이 2종(담당자 확정 DRAFT→RELEASED, DRAFT 삭제), 미적용 버전 하나 규칙
- 확정 시 apply_to 열기 + 직전 RELEASED 버전 닫기(한 트랜잭션)
- DRAFT 선점·해제·넘기기(소유자만), 관리자 강제 해제 없음
- 확정 시 apply_from 순서 검사(직전 RELEASED apply_from 보다 뒤, 최초 버전 면제)
- 대상별 확정 검사 SPI 호출(04 검사 8항, 06 저장 시 검사·테스트 케이스는 각 영역이 구현)
- 상신·반려·승인·승인 취소·철회와 결재 화면은 만들지 않는다(PRD §2 규칙 7)

## 테스트 기준
- 04 「버전 상태와 적용시점」 예시를 테스트 케이스로 옮긴다

## 수용 기준
- [ ] 권한 없는 사용자는 MDM 메뉴가 보이지 않고 API 가 403
- [ ] 셸 컴포넌트가 Vitest 로 렌더 테스트된다
- [ ] 확정·DRAFT 삭제와 거부 경로(미적용 버전 둘, 비소유자, apply_from 역순, 확정 검사 실패) 단위 테스트
- [ ] 동시 확정 충돌 시 row_version 409
- [ ] 담당자 역할만 확정 가능
- [ ] 확정 검사 실패 시 DRAFT 가 그대로 남는다
