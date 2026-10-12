-- ============================================================================
-- IFUSER 컬럼 순서 재배치 — 자동 생성 파일. 직접 고치지 말고 생성기를 다시 돌린다.
--   생성기: node scripts/db-order/gen.mjs relocate --base <기존 DB 기준 ref> --write
--   규칙: PK(PK 제약 순서) → 엔티티 필드 선언 순서 → 버전(VER·AUD_VER·ROW_VERSION) → 감사 8개(scripts/db-order/lib/rule.mjs)
-- 방식: 표마다 앞에 둘 PK 컬럼만 남기고 나머지를 INVISIBLE 로 숨긴 뒤 규칙 순서대로 하나씩 VISIBLE 로 되돌린다.
--   VISIBLE 로 돌아온 컬럼은 맨 끝에 붙으므로 결과 = 규칙 순서. 데이터·타입·NULL·기본값·제약·인덱스는 그대로다.
--   새 DB(V1 부터 적용)·기존 DB 모두 이 파일 뒤 규칙 순서가 된다. 다시 적용해도 결과가 같다(멱등).
-- 운영(Flyway 끔): DBA 가 앞 V 파일 다음 차례로 이 파일을 그대로 적용한다.
-- ============================================================================

-- IF_MMPPMMCMTT01: 앞에 남김 IF_SEQ
alter table IF_MMPPMMCMTT01 modify (TRANSACTION_CODE invisible, INTERFACE_ID invisible, INTERFACE_MSG invisible, KEY_DATA1 invisible, KEY_DATA2 invisible, KEY_DATA3 invisible, IF_FLAG invisible, IF_DATE invisible, IF_TIME invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table IF_MMPPMMCMTT01 modify (TRANSACTION_CODE visible);
alter table IF_MMPPMMCMTT01 modify (INTERFACE_ID visible);
alter table IF_MMPPMMCMTT01 modify (INTERFACE_MSG visible);
alter table IF_MMPPMMCMTT01 modify (KEY_DATA1 visible);
alter table IF_MMPPMMCMTT01 modify (KEY_DATA2 visible);
alter table IF_MMPPMMCMTT01 modify (KEY_DATA3 visible);
alter table IF_MMPPMMCMTT01 modify (IF_FLAG visible);
alter table IF_MMPPMMCMTT01 modify (IF_DATE visible);
alter table IF_MMPPMMCMTT01 modify (IF_TIME visible);
alter table IF_MMPPMMCMTT01 modify (VER visible);
alter table IF_MMPPMMCMTT01 modify (C_USR_ID visible);
alter table IF_MMPPMMCMTT01 modify (C_AT visible);
alter table IF_MMPPMMCMTT01 modify (C_SVC_ID visible);
alter table IF_MMPPMMCMTT01 modify (C_PGM_ID visible);
alter table IF_MMPPMMCMTT01 modify (U_USR_ID visible);
alter table IF_MMPPMMCMTT01 modify (U_AT visible);
alter table IF_MMPPMMCMTT01 modify (U_SVC_ID visible);
alter table IF_MMPPMMCMTT01 modify (U_PGM_ID visible);
