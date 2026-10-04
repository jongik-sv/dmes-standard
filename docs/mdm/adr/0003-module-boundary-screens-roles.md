# ADR-0003: MDM 모듈 경계 — 화면 그룹·산출물 위치·As-Is 병존·권한 역할

- **Status**: PROPOSED
- **Date**: 2026-09-24
- **Decision Date**: —
- **Context Tags**: MDM, MODULE-BOUNDARY, SCREEN-GROUP, RBAC

## 쉬운 설명 (현업용 요약)

새 표준 원장 화면은 기존 마스터코드·업무기준 화면과 따로 운영한다. 두 화면 묶음은 서로의 데이터를
읽거나 고치지 않고, 기존 메뉴는 그대로 둔 채 표준 원장 메뉴를 새로 만든다. 기존 데이터를 새 원장으로
옮기는 일은 이번 범위가 아니다.

용어·도메인·레이아웃은 표준 관리자가, 코드·데이터·업무기준은 담당자가 고친다. 조회는 두 역할 모두
할 수 있다. 새 버전을 확정하는 일은 담당자가 맡는다.

화면은 다섯 묶음으로 나누고 저장소의 이름 규칙에 맞는 묶음 이름을 붙였다. 화면별 설계 문서는
저장소 안의 정해진 폴더에 모아 둔다.

## Context (배경)

- TRD §9 가정 T1 은 "기존 mcm `cma`/`cmb` As-Is 화면과 신규 MDM 은 병존하고 데이터 이관은 범위 밖" 이었고, T2 는 화면 그룹 코드를 `mdt/mdl/mdc/mdd/mdr/mda` 로 가정했다. TRD 스스로 "식별자 사전과 대조해 확정" 이라 적었다.
- 식별자 사전 §A.2.1(사용자 결정 2026-05-28, MUST)은 새 그룹을 `{moduleId 2~3번째 글자}{a~z 순번}` 으로만 등재한다(mdm → `dma, dmb, …`). §A.5.3 은 잠정 채택을 금지한다. 현재 옛 그룹 `mdt` 를 쓰는 코드는 TSK-01-01(미승인)이 만든 샘플 1건뿐이다.
- `docs/mdm/design` 은 외부 mdm 프로젝트로 가는 링크이며 `.gitignore` 로 통째 무시된다. RULE.md 와 Mes-Guide 가 정한 화면 산출물 경로 `docs/{moduleId}/design/{screenId}/` 를 mdm 에 그대로 쓰면 산출물이 커밋되지 않는다. 포털 codegen 이 스캔하는 FE 경로는 `m-mdm/pages/…`(`src/` 없음)인데 TRD 와 wbs 는 `m-mdm/src/pages/…` 로 적었다.
- PRD §3 은 역할 2종(표준 관리자·담당자)과 각자의 일을 정했다. TRD §6 은 역할을 `TB_MCM_SEC_ROLE` 에 시드하고, 버전 확정은 담당자 권한이며, DRAFT 소유권은 `owner_id` 로 판정한다고 정했다. 원천 01 원칙 3 과 06:1001 은 권한(역할)과 작업 잠금(소유자)을 섞지 말라고 한다. 원천 04:1192 는 "담당자를 마루 코드별 칼럼으로 둘지" 를 미결로 남겼다.
- 권한 action 은 PermKey `{objId}/{action}` 로 판정하고, `CoreRbacSeeder.seedCoreRbac()`(2026-10-04 전에는 `DataInitializer.seedMcmSecRbac()`) 의 `allActions` 에 없는 action 은 SYSADMIN 도 403 이다. 현재 역할 ID 는 `SYSADMIN` 하나뿐이다.

## Decision (결정)

- **D1 화면 그룹 코드**: 식별자 사전 §A.2.1 영역 코드를 따른다 — `dma` 용어·도메인·컬럼·단위(02), `dmb` 인터페이스 레이아웃(03), `dmc` 마스터코드(04), `dmd` 마스터데이터(05), `dme` 업무기준·룰 세트(06). 결재 공통 그룹은 보류이며, 결재를 구현할 때 다음 순번 `dmf` 로 등재한다. 식별자 사전 §A.1.1·§A.2.1·§A.2.3 에 mdm 과 다섯 그룹을 등재했다. TRD 가정 T2 의 의미 기호형 코드는 이 결정으로 대체한다.
- **D2 screenId 와 경로 규약**: screenId 목록(24종, 보류 1건 포함)과 경로 규약의 정본은 [`docs/mdm/screens/README.md`](../screens/README.md) 다. screenId 는 wbs entry-point 의 값을 그대로 쓰고 그룹 접두만 바꾼다. 경로는 FE `src/frontend/m-mdm/pages/{group}/{screenId}/page.tsx`(`src/` 없음), BE 패키지 `com.dongkuk.dmes.mdm.{group}.{screenId}.{dto,service}`, BPMN `services/{group}/{screenId}.bpmn`, URL `POST /api/mdm/oasis/{serviceId}/{action}`, componentPath `{group}/{screenId}` 다. `dataCsvUploadPop` 의 팝업·독립 여부는 TSK-07-04 가 화면 설계에서 확정한다.
- **D3 화면 설계 산출물 위치**: `docs/mdm/screens/{screenId}/` 에 둔다. `docs/mdm/design` 은 외부 링크(gitignore)라 쓰지 않는다. RULE.md·Mes-Guide 에 mdm 예외를 적었다.
- **D4 As-Is mcm `cma`/`cmb` 와의 병존 6원칙**(TRD 가정 T1 확정):
  1. **독립**: 신규 MDM(`mdm` 모듈, `TB_MDM_*`, 메뉴 루트 `mdm`)과 mcm 의 As-Is 마스터코드·업무기준(`cma`·`cme`·`cmb` 화면, `TB_MCM_*` 원장, mcm-core `MasterCode`·`MasterCodeCategory`·`RuleMaster` 등)은 서로의 테이블을 읽거나 쓰지 않는다. 모듈 사이 FK·JOIN·뷰가 없다.
  2. **코드 의존 금지**: mdm 코드는 mcm-core 의 As-Is 마스터 엔티티·리포지토리·서비스(`com.dongkuk.dmes.mcm.entity.Master*`·`RuleMaster*`, `com.dongkuk.dmes.mcm.{cma,cmb,cme}..`)를 import 하지 않는다. mcm-core 의존은 보안·RBAC·공통 유틸 용도로만 쓴다. 이 규칙을 ArchUnit 으로 고정하는 일은 TSK-01-02 가 한다.
  3. **메뉴**: 기존 마스터관리·업무기준관리 메뉴는 고치지 않고 MDM 메뉴를 새로 등록한다. 기존 메뉴를 내리는 시점은 이관과 함께 정한다.
  4. **데이터 이관은 범위 밖**(PRD §5, 원천 06:390). 이관은 별도 과제다.
  5. **하위 모듈 참조**: mpp·mls 등 다른 모듈은 당분간 기존 mcm 코드를 계속 쓴다. MDM 원장으로 참조를 바꾸는 일은 배포(보류)와 함께 정한다.
  6. **식별자 충돌 없음**: 그룹 접두 `dm*` 대 `cm*`, screenId 이름 공간 겹침 0.
- **D5 권한 역할 배치**: 전역 역할 2종을 둔다. 원천 04:1192 의 "마루 코드별 담당자" 미결은 PRD 가 역할 2종만 정했으므로 전역 역할로 닫는다.

  | 역할 ID | 이름 | 하는 일 |
  |---|---|---|
  | `MDM_STD_ADMIN` | 표준 관리자 | `dma`·`dmb` 등록·수정·삭제 |
  | `MDM_STEWARD` | 담당자 | `dmc`·`dmd`·`dme` 정의 편집, DRAFT 작성·선점·해제·넘기기·삭제, 04·06 버전 확정 |

  한 사람이 두 역할을 함께 가질 수 있다. 결재자 역할·원천 시스템 역할은 보류한다. DRAFT 작업 잠금은 역할이 아니라 `owner_id` 로 판정한다([ADR-0002](0002-version-confirm-without-approval.md) D3).

  권한 세트(`TB_MCM_SEC_PERM`, `PERMISSION_ACTION` 콤마 목록):

  | PERM ID | action |
  |---|---|
  | `PERM_MDM_READ` | `search`, `view`, `export`, `compare` |
  | `PERM_MDM_EDIT` | READ + `save`, `delete`, `reg`, `import`, `validate`, `execute`, `copy`, `restore` (+ DRAFT 소유권 action — 아래 대조표) |
  | `PERM_MDM_CONFIRM` | EDIT + `confirm` |

  action 과 `allActions`(`CoreRbacSeeder.seedCoreRbac()`) 대조:

  | action | 용도 | allActions |
  |---|---|---|
  | search / view / export / compare | 조회·상세·엑셀·diff | 있음 |
  | save / delete / reg / import / copy / restore | 저장·삭제·새 버전·업로드·복사·복원 | 있음 |
  | validate / execute | 저장 전 검사·값 테스트 | 있음 |
  | confirm | 버전 확정 | 있음 |
  | `lock` / `unlock` / `handover` | DRAFT 선점·해제·넘기기(권장 이름) | **신규** — 화면 Task 가 BPMN 에서 이름을 확정하고, 새 이름이면 같은 Task 에서 `allActions` 와 `PERM_MDM_EDIT` 에 추가한다 |

  매트릭스(역할 × 그룹 → PERM. `SYSADMIN` 은 기존대로 전 OBJECT × `PERM_ALL`):

  | 그룹 | MDM_STD_ADMIN | MDM_STEWARD |
  |---|---|---|
  | dma 용어·도메인·컬럼·단위 | EDIT | READ |
  | dmb 레이아웃 | EDIT | READ |
  | dmc 마스터코드 | READ | CONFIRM |
  | dmd 마스터데이터 | READ | EDIT |
  | dme 업무기준·룰 세트 | READ | CONFIRM |

  조회는 두 역할 모두에게 연다. 원장은 전사 참조 대상이고, 도메인 CODE 참조·룰 MASTER 참조 화면이 다른 그룹을 조회한다. 두 역할 어느 것도 없으면 MDM 메뉴가 보이지 않고 API 는 403 이다. 시드(역할 2 + PERM 3 + 매핑)는 TSK-01-03 이 `DataInitializer` 에 한다.

## Consequences (결과)

- wbs·TRD 의 그룹 토큰(`mdt/mdl/mdc/mdd/mdr/mda`)과 FE 경로(`m-mdm/src/pages/`)를 이 결정에 맞춰 치환했다. 후속 Task 의 spec 은 wbs 에서 만들어지므로, 승인 뒤 D'Flow 에 wbs 를 다시 올려야 한다(agent 태그 유지).
- TSK-01-01 이 만든 샘플 화면 `mdmSample` 은 옛 그룹 `mdt` 경로에 남아 있다. TSK-01-03 이 `dma` 로 옮기거나 지운다(메뉴 시드·tsup entry·pages 폴더·스모크 테스트를 함께 맞춘다). 그때까지 코드와 규칙이 한 곳에서 어긋난다.
- 화면 설계 산출물이 저장소에 커밋되므로 리뷰·이력 추적이 된다. 대신 mdm 만 다른 모듈과 산출물 경로가 다르다.
- As-Is 마스터코드·업무기준과 신규 원장이 한동안 함께 존재한다. 두 원장의 값이 달라질 수 있으며, 어느 쪽을 쓸지는 이관·배포 결정 때 정한다.
- DRAFT 소유권 action 이름(`lock`/`unlock`/`handover`)은 아직 `allActions` 에 없다. 화면 Task 가 이름을 확정하면서 추가하지 않으면 SYSADMIN 도 403 이다.
- 인계: TSK-01-02 는 그룹 코드 상수 `dma~dme` 와 As-Is 마스터 import 금지 ArchUnit 규칙, TSK-01-03 은 역할·PERM·매트릭스 시드와 메뉴 폴더 `dma~dme`, 화면 Task 전부는 식별자 사전 §A.3.2 화면 행 등재·DRAFT 소유권 action 이름 확정·산출물 `docs/mdm/screens/{screenId}/` 를 맡는다.

## Alternatives Considered (대안)

- **그룹 코드 — TRD 가정 `mdt/mdl/mdc/mdd/mdr` 유지(A.2.3 에 예외 등재)**: 의미가 더 잘 읽히지만, A.2.1 MUST 규칙 위반을 새로 등재할 근거가 되지 못한다(`docs/mdm/tasks/TSK-02-01/design.md` D2 b).
- **그룹 코드 — A.2.1 을 개정해 의미 기호형 코드를 모든 모듈에 허용**: 모듈 횡단 규칙 변경이라 이 Task 범위를 넘는다(design D2 c).
- **권한 — 전역 역할 + 마루 코드·룰별 담당자 지정**: PRD 에 없는 기능이고 원천 04:1192 에서도 미결이다(design D6 b).
- **권한 — 역할 1종(담당자가 표준 관리도 겸함)**: PRD §3 이 정한 역할 2종과 어긋난다(design D6 c).
- **권한 — 결론 보류, 협의 이슈 발행**: PRD §3·TRD §6 에 결론을 낼 근거가 충분하다(design D6 d).
- **산출물 위치 — `docs/mdm/design/{screenId}/` 유지**: gitignore 된 외부 링크 안이라 커밋되지 않는다.

## Trigger (PROPOSED 인 경우만)

D'Flow 에서 mdm/TSK-02-01 이 승인(approved)되고, `docs/mdm/tasks/TSK-02-01/design.md` 「담당자 확인 필요 결정」 중 이 ADR 이 근거로 삼은 항목(D2·D6)이 반려되지 않으면 ACCEPTED 로 전환한다. 반려된 항목이 있으면 그 결정을 고친 뒤 다시 판정한다.

## References

- [`docs/mdm/screens/README.md`](../screens/README.md) — 그룹 코드·screenId 목록·경로 규약 정본
- `docs/mdm/PRD.md` §3, §5
- [TRD](../TRD.md) §5, §6, §8, §9 T1·T2
- `docs/mdm/decisions.md` D-015, D-016, D-018
- `docs/mdm/tasks/TSK-02-01/design.md` §6.5·§6.6·§6.9, 담당자 확인 필요 결정 D2·D6
- 식별자 사전 [§A.1.1·§A.2.1·§A.2.3](../../guide/design/identifier-dictionary/01-modules-and-screens.md)
- `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/CoreRbacSeeder.java` `seedCoreRbac()`(`allActions`), `seed/MdmMenuSeeder.java` `seedMdmMenus()` (2026-10-04 전에는 둘 다 `DataInitializer.java`)
- 원천 설계 `/Users/jji/project/mdm/docs/design/basic/01-mdm-overview.md` 원칙 3, `04-master-code-deploy-full.md`, `06-business-rule.md`
