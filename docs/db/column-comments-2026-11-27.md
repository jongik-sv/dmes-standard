# 퍼미션 모델 v2 칼럼 주석 (2026-11-27)

- 지시: perm-bench 레인 perm-core, 항목 c6. 대상은 V20 이 만드는 새 테이블 4개와 `TB_MCM_SEC_OBJ` 새 칼럼 3개
- 수단: `V20__perm_model.sql` 의 `COMMENT ON TABLE`·`COMMENT ON COLUMN`. 아래 이름은 V 파일 문구와 글자까지 같다
- 근거: [ADR-0001](../mcm/adr/0001-perm-model-v2.md), `docs/perm-bench/decompose.md` §0.1

## MCMAPUSER (V20, 칼럼 63·테이블 4)

파일: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V20__perm_model.sql`

`TB_MCM_SEC_OBJ` 는 테이블이 이미 있으므로 새 칼럼 3개만 적는다.

### 테이블

| 테이블 | 이름 |
|---|---|
| TB_MCM_SEC_ROLE_PERM | 직무 퍼미션(직무×오브젝트) |
| TB_MCM_SEC_PERM_DRAFT | 권한 작업대 초안 |
| TB_MCM_SEC_PERM_HIS | 권한 작업대 적용 이력 |
| TB_MCM_SEC_PERM_HIS_DTL | 권한 작업대 적용 이력 상세 |

### 칼럼

| 테이블 | 칼럼 | 이름 |
|---|---|---|
| TB_MCM_SEC_ROLE_PERM | ROLE_ID | 직무 아이디 |
| TB_MCM_SEC_ROLE_PERM | OBJECT_ID | 오브젝트 아이디 |
| TB_MCM_SEC_ROLE_PERM | BTN_PERM | 버튼 권한(action 코드, 쉼표 구분) |
| TB_MCM_SEC_ROLE_PERM | POPUP_PERM | 팝업 권한(action 코드, 쉼표 구분) |
| TB_MCM_SEC_ROLE_PERM | DATA_PERM | 데이터 권한(코드, 쉼표 구분) |
| TB_MCM_SEC_ROLE_PERM | VER | 버전 |
| TB_MCM_SEC_ROLE_PERM | C_USR_ID | 생성자 아이디 |
| TB_MCM_SEC_ROLE_PERM | C_AT | 생성일시 |
| TB_MCM_SEC_ROLE_PERM | C_SVC_ID | 생성 서비스 아이디 |
| TB_MCM_SEC_ROLE_PERM | C_PGM_ID | 생성 프로그램 아이디 |
| TB_MCM_SEC_ROLE_PERM | U_USR_ID | 수정자 아이디 |
| TB_MCM_SEC_ROLE_PERM | U_AT | 수정일시 |
| TB_MCM_SEC_ROLE_PERM | U_SVC_ID | 수정 서비스 아이디 |
| TB_MCM_SEC_ROLE_PERM | U_PGM_ID | 수정 프로그램 아이디 |
| TB_MCM_SEC_OBJ | BTN_PERM | 허용 버튼 권한(action 코드, 쉼표 구분) |
| TB_MCM_SEC_OBJ | POPUP_PERM | 허용 팝업 권한(action 코드, 쉼표 구분) |
| TB_MCM_SEC_OBJ | DATA_PERM | 허용 데이터 권한(코드, 쉼표 구분) |
| TB_MCM_SEC_PERM_DRAFT | OWNER_USER_ID | 초안 주인 사용자 아이디 |
| TB_MCM_SEC_PERM_DRAFT | DRAFT_JSON | 변경 목록(JSON) |
| TB_MCM_SEC_PERM_DRAFT | BASE_FP_JSON | 처음 건드린 범위의 현재 행 지문(JSON) |
| TB_MCM_SEC_PERM_DRAFT | CHANGE_CNT | 변경 건수 |
| TB_MCM_SEC_PERM_DRAFT | VER | 버전 |
| TB_MCM_SEC_PERM_DRAFT | C_USR_ID | 생성자 아이디 |
| TB_MCM_SEC_PERM_DRAFT | C_AT | 생성일시 |
| TB_MCM_SEC_PERM_DRAFT | C_SVC_ID | 생성 서비스 아이디 |
| TB_MCM_SEC_PERM_DRAFT | C_PGM_ID | 생성 프로그램 아이디 |
| TB_MCM_SEC_PERM_DRAFT | U_USR_ID | 수정자 아이디 |
| TB_MCM_SEC_PERM_DRAFT | U_AT | 수정일시 |
| TB_MCM_SEC_PERM_DRAFT | U_SVC_ID | 수정 서비스 아이디 |
| TB_MCM_SEC_PERM_DRAFT | U_PGM_ID | 수정 프로그램 아이디 |
| TB_MCM_SEC_PERM_HIS | APPLY_ID | 적용 아이디 |
| TB_MCM_SEC_PERM_HIS | APPLY_USER_ID | 적용자 아이디 |
| TB_MCM_SEC_PERM_HIS | APPLY_AT | 적용일시 |
| TB_MCM_SEC_PERM_HIS | CHANGE_CNT | 변경 건수 |
| TB_MCM_SEC_PERM_HIS | GAIN_USER_CNT | 권한을 얻은 사용자 수 |
| TB_MCM_SEC_PERM_HIS | LOSE_USER_CNT | 권한을 잃은 사용자 수 |
| TB_MCM_SEC_PERM_HIS | APPLY_MEMO | 적용 메모 |
| TB_MCM_SEC_PERM_HIS | VER | 버전 |
| TB_MCM_SEC_PERM_HIS | C_USR_ID | 생성자 아이디 |
| TB_MCM_SEC_PERM_HIS | C_AT | 생성일시 |
| TB_MCM_SEC_PERM_HIS | C_SVC_ID | 생성 서비스 아이디 |
| TB_MCM_SEC_PERM_HIS | C_PGM_ID | 생성 프로그램 아이디 |
| TB_MCM_SEC_PERM_HIS | U_USR_ID | 수정자 아이디 |
| TB_MCM_SEC_PERM_HIS | U_AT | 수정일시 |
| TB_MCM_SEC_PERM_HIS | U_SVC_ID | 수정 서비스 아이디 |
| TB_MCM_SEC_PERM_HIS | U_PGM_ID | 수정 프로그램 아이디 |
| TB_MCM_SEC_PERM_HIS_DTL | APPLY_ID | 적용 아이디 |
| TB_MCM_SEC_PERM_HIS_DTL | SEQ_NO | 순번 |
| TB_MCM_SEC_PERM_HIS_DTL | TARGET_TP | 대상 구분(USER_GRP·GRP_ROLE·ROLE_OBJ) |
| TB_MCM_SEC_PERM_HIS_DTL | KEY1 | 대상 키 1(사용자·직무 그룹·직무) |
| TB_MCM_SEC_PERM_HIS_DTL | KEY2 | 대상 키 2(직무 그룹·직무·오브젝트) |
| TB_MCM_SEC_PERM_HIS_DTL | OP_TP | 변경 구분(ADD·DEL·UPD) |
| TB_MCM_SEC_PERM_HIS_DTL | BEFORE_VAL | 변경 전 값 |
| TB_MCM_SEC_PERM_HIS_DTL | AFTER_VAL | 변경 후 값 |
| TB_MCM_SEC_PERM_HIS_DTL | VER | 버전 |
| TB_MCM_SEC_PERM_HIS_DTL | C_USR_ID | 생성자 아이디 |
| TB_MCM_SEC_PERM_HIS_DTL | C_AT | 생성일시 |
| TB_MCM_SEC_PERM_HIS_DTL | C_SVC_ID | 생성 서비스 아이디 |
| TB_MCM_SEC_PERM_HIS_DTL | C_PGM_ID | 생성 프로그램 아이디 |
| TB_MCM_SEC_PERM_HIS_DTL | U_USR_ID | 수정자 아이디 |
| TB_MCM_SEC_PERM_HIS_DTL | U_AT | 수정일시 |
| TB_MCM_SEC_PERM_HIS_DTL | U_SVC_ID | 수정 서비스 아이디 |
| TB_MCM_SEC_PERM_HIS_DTL | U_PGM_ID | 수정 프로그램 아이디 |
