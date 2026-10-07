# ora-platform 레인 정본 메모

- 레인: ora-platform / 브랜치 `feat/ora-platform` / 워크트리 `/Users/jji/project/dmes-wt/ora-platform` (기준 dev b7c91cd6e)
- 조정 세션: dmes-standard-d8 (지시 ora-platform-1, 정본 지시문 `/Users/jji/.coord/oracle-1007/lanes/ora-platform/brief.md`)

## 지금 상태 (2026-10-07)

| 항목 | 상태 | 비고 |
|---|---|---|
| p1 caravan 스키마 기준선 | 초안 작성 | `docs/oracle-1007/draft/caravan/{caravanuser,ifuser}/` |
| p3 샘플 모듈 | 초안 작성 | `docs/oracle-1007/draft/{mls,mpp,mqc,mpn,aps-core}/V1__baseline.sql` |
| p2 caravan-hub·console·core 전환 | 대기 | ora-base 머지① 뒤 |
| p5 H2 시험 전환 | 대기 | ora-base b4 뒤 |
| p4 cactus-core SQLite 제거 | 대기 | ora-mdm·mcm 머지②·③ 뒤 |
| p6 전체 시험·머지 요청(④) | 대기 | |

## 결정·가정

- 초안은 classpath 밖(`docs/oracle-1007/draft/`)에 둔다. 머지① 뒤 각 모듈 `db/migration/<모듈>/` 로 옮기고 SQLite 판은 `archive/` 로 `git mv` 한다(삭제 금지).
- mls 는 SQLite V1~V4 를 Oracle 기준선 V1 하나로 합쳤다(시드 포함). CONTENT 는 CLOB.
- caravan Flyway 주인은 caravan-hub 로 가정한다(`schema-owners.md` 가 나오면 따른다). CARAVANUSER 표 4종(TOPICS·TC_ERROR·HUB_CONFIG·APPHOST).
- IFUSER 의 IF_* 표는 운영자가 정의하므로 기준선에 넣지 않고 시험용 예시 1개만 둔다.

- 조정 결정(2026-10-07): CARAVANUSER·EAIUSER·IFUSER 의 Flyway 주인은 caravan-hub. caravan-console 엔티티 표도 이 기준선에 포함한다. mcm-core 는 V1 을 만들지 않고 validate 만 한다. V1 DDL 은 접두 없이 쓰고 스키마 폴더별 Flyway defaultSchema 로 적용한다. EAIUSER 폴더는 만들지 않는다(사용자 생성·권한은 ora-base PDB 도구).

## EAIUSER 가 필요로 하는 권한 (ora-base·운영 DBA 에 전달)

hub 의 `if` 데이터소스 접속 사용자는 EAIUSER 이고, IF_* 표는 IFUSER 소유다(`TB_CARAVAN_HUB_CONFIG.DB_SCHEMA=IFUSER`). `InterfaceMapper.xml` 이 실행하는 SQL 기준으로 필요한 권한은 아래와 같다. DELETE 는 쓰지 않는다.

| 대상(IFUSER 소유) | SELECT | INSERT | UPDATE | DELETE | 근거 |
|---|---|---|---|---|---|
| `IF_*` 중 INBOUND 로 설정된 표(예 `IF_MMPPMMCMTT01`) | O | | O | | `selectPendingMessages`, `updateSuccess`, `updateError` |
| `IF_*` 중 OUTBOUND 로 설정된 표 | | O | | | `insertOutboundData` |

표가 늘 때마다 같은 권한을 부여해야 한다. 한 표를 INBOUND·OUTBOUND 양쪽으로 쓰면 SELECT·INSERT·UPDATE 모두 필요하다. 신규 IF 표 추가 절차에 GRANT 단계를 넣는 것이 안전하다.

## 남은 순서

1. 초안 Oracle 검증(FREEPDB1 `L_PLT_*` 사용자) → 리뷰 → 커밋
2. ora-base 머지① 알림 뒤 p3 실제 전환(yml·`lib/build.gradle` sqlite-jdbc 제거) → p2 → p5
3. 머지②·③ 뒤 p4 → p6

## 검증용 임시 사용자 (FREEPDB1)

`L_PLT_MLSAPUSER`·`L_PLT_MPPAPUSER`·`L_PLT_MQCAPUSER`·`L_PLT_MPNAPUSER`·`L_PLT_APSAPUSER`·`L_PLT_CARAVANUSER`·`L_PLT_IFUSER` — DDL 검증 후 삭제한다.
