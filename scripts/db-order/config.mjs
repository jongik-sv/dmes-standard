// 대상 스키마(Flyway 위치 폴더)와 엔티티 스캔 범위. 경로 = 저장소 루트 기준.
export const SCHEMAS = [
  { key: "mcmapuser", dir: "src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser" },
  { key: "mcaapuser", dir: "src/backend/mcm-core/src/main/resources/db/migration/oracle/mcaapuser" },
  { key: "mcm_backup", dir: "src/backend/mcm-core/src/main/resources/db/migration/oracle/mcm_backup" },
  { key: "mcm_source", dir: "src/backend/mcm-core/src/main/resources/db/migration/oracle/mcm_source" },
  { key: "mdm", dir: "src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle" },
  { key: "aps-core", dir: "src/backend/aps-core/src/main/resources/db/migration/aps-core" },
  { key: "mls", dir: "src/backend/mls/api/src/main/resources/db/migration/mls" },
  { key: "mpn", dir: "src/backend/mpn/api/src/main/resources/db/migration/mpn" },
  { key: "mpp", dir: "src/backend/mpp/api/src/main/resources/db/migration/mpp" },
  { key: "mqc", dir: "src/backend/mqc/api/src/main/resources/db/migration/mqc" },
  { key: "caravanuser", dir: "src/backend/caravan-hub/src/main/resources/db/migration/caravanuser" },
  { key: "ifuser", dir: "src/backend/caravan-hub/src/main/resources/db/migration/ifuser" },
];

/** 엔티티 스캔 뿌리. 표 ↔ 엔티티 = @Table 이름(스키마 무시). 같은 이름을 여러 엔티티가 쓰면 순서가 같아야 한다. */
export const ENTITY_ROOTS = ["src/backend"];

/** 재배치 V 파일 이름 꼬리. */
export const RELOCATE_SUFFIX = "column_order";
