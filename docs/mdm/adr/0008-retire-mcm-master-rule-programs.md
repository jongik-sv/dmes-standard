# ADR-0008: mcm 마스터관리·업무기준관리 프로그램과 표를 폐기하고 MDM 을 단일 원장으로 둔다

- **Status**: ACCEPTED
- **Date**: 2026-10-16
- **Decision Date**: 2026-10-16
- **Context Tags**: MDM, MCM, MODULE-BOUNDARY, RETIREMENT

## 쉬운 설명 (현업용 요약)

지금까지 공통관리에는 옛 마스터코드·업무기준 화면이 남아 있었고, 새 표준 원장(마루 MDM) 화면이 따로 있었다.
두 화면 묶음을 한동안 함께 두고, 다른 업무 화면은 당분간 옛 코드를 쓰기로 했었다.

사용자 결정(2026-10-16)으로 옛 마스터관리·업무기준관리 화면, 이 화면들이 쓰던 팝업, 동기화 관리 화면,
그리고 이 화면들이 쓰던 표를 모두 지운다. 이제 마스터코드와 업무기준은 마루 MDM 한 곳에서만 관리한다.
옛 표의 데이터는 새 원장으로 옮기지 않는다. 다른 업무 화면이 코드나 업무기준을 써야 하면 마루 MDM 을 쓴다.

## Context (배경)

- [ADR-0003](0003-module-boundary-screens-roles.md) D4 와 `decisions.md` D-016 은 mcm As-Is 마스터코드·업무기준
  (`cma`·`cme`·`cmb` 화면, `TB_MCM_CODE_*`·`TB_MCA_RULE_*`)과 신규 MDM 의 **병존 6원칙**을 정했다. 그중 3항(기존 메뉴 유지,
  내리는 시점은 이관과 함께 정함)·4항(데이터 이관은 별도 과제)·5항(하위 모듈은 당분간 mcm 코드 사용)은 두 원장이 함께 있는
  상태를 전제로 했다.
- ADR-0003 Consequences 는 두 원장이 함께 있으면 값이 어긋날 수 있고, 어느 쪽을 쓸지는 이관·배포 결정 때 정한다고 적었다.
- 사용자 결정(2026-10-16): mcm 마스터관리·업무기준관리 프로그램을 화면·BPMN·Java·DB 객체·메뉴까지 모두 지운다. 이관은 하지 않는다.

## Decision (결정)

- **D1 폐기 범위 — 화면**: 다음 mcm 프로그램을 지운다(FE 화면·BPMN·Service·DTO·엔티티·리포지토리·테스트·메뉴 시드·화면 설계 문서).
  - `cma` 마스터관리(원장): `masterCategoryMng`, `masterCodeMng`
  - `cme` 마스터관리(가동): `masterCodeMngList`
  - `cmb` 업무기준관리(원장): `masterRuleList`, `masterRuleData`, `masterRuleDataList`, `masterRuleFrame`
  - `cmz` 팝업(FE 경로 기준. 식별자 사전·`docs/mcm/README.md` 는 이 팝업을 `cma`·`cmb` 아래에 적었다): `masterCodeSelPop`, `masterCodeUploadFilePopup`, `masterRuleListPop`, `masterRuleFrameColListPopup`, `masterRuleDataUploadFilePopup`
  - `csa` `commSyncMng`(동기화 관리 — 마스터코드 표만 동기화했다)
- **D2 폐기 범위 — DB 객체**: `MCMAPUSER`·`MCM_SOURCE` 의 `TB_MCM_CODE_MASTER`·`TB_MCM_CODE_DETAIL`·`TB_MCM_CODE_CATEGORY`,
  `MCM_BACKUP` 의 `TB_MCM_CODE_MASTER`·`TB_MCM_CODE_CATEGORY`, `MCMAPUSER.VI_MCM_CODE_ACCESS`,
  `MCAAPUSER.TB_MCA_RULE_MASTER`·`TB_MCA_RULE_COL_LIST` 를 지운다. 지운 화면의 메뉴·OBJECT·권한 매핑·사용자별 즐겨찾기·시작 화면·조회 기본값 행도 지운다.
- **D3 query-route 시범 정리**: `masterCodeSelPop` 을 대상으로 하던 query-route 시범 매퍼(`persistence/query/cma/masterCodeSelPop.xml`)와
  그 테스트(`QueryMapperLintTest`·`McmMybatisConfigWiringTest`·동등성·성능 테스트)를 함께 지운다.
- **D4 단일 원장**: 마스터코드·업무기준의 원장은 MDM 하나다(마루 코드 `dmc/*`, 업무기준 `dme/*`). ADR-0003 D4 의 병존 6원칙 중
  3항·4항·5항을 다음으로 대체한다.
  - 3항 대체: 기존 마스터관리·업무기준관리 메뉴와 화면을 내린다. 메뉴는 MDM 메뉴만 남는다.
  - 4항 대체: 데이터 이관을 하지 않는다. As-Is 표의 데이터는 버린다.
  - 5항 대체: 하위 모듈(mpp·mls 등)이 코드·업무기준을 참조해야 하면 MDM 을 쓴다. 지운 mcm 표·엔티티를 참조하는 새 코드를 만들지 않는다.
  - 1항(독립)·2항(코드 의존 금지)·6항(식별자 충돌 없음)은 상대가 없어져 저절로 지켜진다.
- **D5 그룹 코드 재사용 금지**: 비게 된 mcm 화면 그룹 `cma`·`cme`·`cmb`·`cmz` 는 다른 뜻으로 다시 쓰지 않는다. 식별자 사전에 행이 있는 코드는 "폐기" 로 표시해 남긴다.

## Consequences (결과)

- mcm 공통관리 메뉴에서 마스터관리·업무기준관리 폴더가 빠진다. 화면 목록·식별자 사전·가이드 문서의 예시에서 지운 화면을 뺀다.
  날짜가 붙은 사례 기록(`사례 (2026-05-28)` 등)과 이력 폴더(`docs/oracle-1007/`·`docs/refactor-*`·`docs/superpowers/`·`docs/mdm/tasks/` 등)는
  당시 기록이므로 고치지 않는다.
- As-Is 원장과 MDM 원장의 값이 어긋날 위험이 없어진다. 대신 As-Is 표의 데이터는 버린다. 표는 PURGE 없이 지우므로, 실수였다면 Oracle 휴지통이나 지우기 전 DB 백업에서 되살린다.
- 하위 모듈이 아직 MDM 코드를 받는 경로를 갖지 않았다면, 그 모듈은 코드를 쓰기 전에 MDM 메타 피드([ADR-0007](0007-mdm-meta-hybrid-cache-revision.md))를 붙여야 한다.
- 표와 메뉴 행은 새 마이그레이션이 지운다: `mcm-core` `db/migration/oracle/mcmapuser/V17__retire_legacy_master_programs.sql`,
  `mcm_source/V4__drop_legacy_code_tables.sql`, `mcm_backup/V4__drop_legacy_code_tables.sql`, `mcaapuser/V4__drop_legacy_rule_tables.sql`.
  이미 머지된 V1 기준선은 고치지 않는다(체크섬). 그래서 빈 DB 에는 V1 이 표를 만들고 뒤 V 파일이 지운다.
- `db-snapshot/` 의 해당 CSV 정리는 따로 맞춘다.
- query-route 라우터(`cactus.inbound.query-routes`) 자체는 남는다. 시범 대상이 없어졌으므로, 다시 쓰려면 새 시범 화면을 정해야 한다.

## Alternatives Considered (대안)

- **병존 유지(ADR-0003 D4 그대로)**: 두 원장의 값이 어긋날 수 있고, 쓰지 않는 화면·표를 계속 유지해야 한다. 사용자 결정으로 버렸다.
- **데이터 이관 뒤 폐기**: 옛 데이터를 MDM 에 옮겨 담는다. 사용자가 이관하지 않기로 했다.
- **화면만 내리고 표는 남김**: 표를 남기면 다시 참조하는 코드가 생길 수 있고, 스키마·스냅샷 관리 대상만 늘어난다.

## References

- [ADR-0003](0003-module-boundary-screens-roles.md) D4 — 병존 6원칙(이 ADR 이 3·4·5항을 대체)
- `docs/mdm/decisions.md` D-016(병존), D-157(이 ADR)
- [`docs/mdm/screens/README.md`](../screens/README.md) — MDM 화면 그룹·screenId 정본
- [`docs/mcm/README.md`](../../mcm/README.md) — mcm 남은 화면 목록
- 식별자 사전 [§A.2](../../guide/design/identifier-dictionary/01-modules-and-screens.md)
