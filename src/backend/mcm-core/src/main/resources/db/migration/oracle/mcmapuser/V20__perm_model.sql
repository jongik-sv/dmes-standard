-- ============================================================
-- V20: 퍼미션 모델 v2 표(역할×오브젝트 퍼미션·작업대 초안·적용 이력) + 오브젝트 허용 값 칼럼
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/perm-bench/decompose.md §0.1, 결정 D9·D10·D19·D20·D22·D23):
--   TB_MCM_SEC_ROLE_PERM: 역할×오브젝트 퍼미션 1건. 옛 TB_MCM_SEC_PERM(묶음) + TB_MCM_SEC_ROLE_MAPPING(역할×오브젝트×묶음)을 대신한다.
--     BTN_PERM·POPUP_PERM·DATA_PERM = 쉼표로 이은 action 코드. 효과 = (BTN_PERM ∩ OBJ.BTN_PERM) ∪ (POPUP_PERM ∩ OBJ.POPUP_PERM).
--     FK 2개(역할·오브젝트)는 ON DELETE 없음. 역할·오브젝트 삭제는 서비스가 쓰는 퍼미션을 먼저 검사한다(D19).
--   TB_MCM_SEC_OBJ: 오브젝트가 허용하는 버튼·팝업·데이터 권한 값(BTN_PERM·POPUP_PERM·DATA_PERM)을 더한다.
--     칼럼 순서 규칙(엔티티 필드 순서: PARAM 뒤)에 맞춰 같은 파일에서 INVISIBLE→VISIBLE 로 재배치한다.
--   TB_MCM_SEC_PERM_DRAFT: 권한 작업대 초안. 관리자마다 1건(변경 목록 JSON + 처음 건드린 범위의 지문 JSON).
--   TB_MCM_SEC_PERM_HIS / TB_MCM_SEC_PERM_HIS_DTL: 작업대 적용 이력 머리·줄.
--   옛 TB_MCM_SEC_PERM·TB_MCM_SEC_ROLE_MAPPING 은 지우지 않는다(D10, 대조·되돌리기용). 데이터 옮기기는 V21.
--   V18·V19 는 다른 브랜치 몫이라 이 번호는 V20 으로 고정한다(D20).

-- ── 1. 역할×오브젝트 퍼미션 ──
create table TB_MCM_SEC_ROLE_PERM (
    ROLE_ID varchar2(30 char) not null,
    OBJECT_ID varchar2(50 char) not null,
    BTN_PERM varchar2(1000 char) not null,
    POPUP_PERM varchar2(1000 char),
    DATA_PERM varchar2(1000 char),
    VER number(19,0) default 0,
    C_USR_ID varchar2(100 char),
    C_AT timestamp(6),
    C_SVC_ID varchar2(100 char),
    C_PGM_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    U_AT timestamp(6),
    U_SVC_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_ROLE_PERM primary key (ROLE_ID, OBJECT_ID),
    constraint FK_TB_MCM_SEC_ROLE_PERM_ROLE foreign key (ROLE_ID) references TB_MCM_SEC_ROLE (ROLE_ID),
    constraint FK_TB_MCM_SEC_ROLE_PERM_OBJ foreign key (OBJECT_ID) references TB_MCM_SEC_OBJ (OBJECT_ID)
);
-- 오브젝트 기준 조회(오브젝트 삭제 검사·이 오브젝트의 퍼미션)와 FK 잠금 회피용.
create index IX_TB_MCM_SEC_ROLE_PERM_OBJ on TB_MCM_SEC_ROLE_PERM (OBJECT_ID, ROLE_ID);

-- ── 2. 오브젝트 허용 값 칼럼 + 재배치(PARAM 뒤) ──
alter table TB_MCM_SEC_OBJ add (
    BTN_PERM varchar2(1000 char),
    POPUP_PERM varchar2(1000 char),
    DATA_PERM varchar2(1000 char)
);
alter table TB_MCM_SEC_OBJ modify (OBJECT_NM invisible, PROGRAM_DESC invisible, SYSTEM_CODE invisible, OBJECT_TYPE invisible, SERVICE invisible, USE_TP invisible, ACCESS_TP invisible, FORM_URL invisible, OUT_ACCESS_IP invisible, PARAM invisible, BTN_PERM invisible, POPUP_PERM invisible, DATA_PERM invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_SEC_OBJ modify (OBJECT_NM visible);
alter table TB_MCM_SEC_OBJ modify (PROGRAM_DESC visible);
alter table TB_MCM_SEC_OBJ modify (SYSTEM_CODE visible);
alter table TB_MCM_SEC_OBJ modify (OBJECT_TYPE visible);
alter table TB_MCM_SEC_OBJ modify (SERVICE visible);
alter table TB_MCM_SEC_OBJ modify (USE_TP visible);
alter table TB_MCM_SEC_OBJ modify (ACCESS_TP visible);
alter table TB_MCM_SEC_OBJ modify (FORM_URL visible);
alter table TB_MCM_SEC_OBJ modify (OUT_ACCESS_IP visible);
alter table TB_MCM_SEC_OBJ modify (PARAM visible);
alter table TB_MCM_SEC_OBJ modify (BTN_PERM visible);
alter table TB_MCM_SEC_OBJ modify (POPUP_PERM visible);
alter table TB_MCM_SEC_OBJ modify (DATA_PERM visible);
alter table TB_MCM_SEC_OBJ modify (START_ACTIVE_DATE visible);
alter table TB_MCM_SEC_OBJ modify (END_ACTIVE_DATE visible);
alter table TB_MCM_SEC_OBJ modify (VER visible);
alter table TB_MCM_SEC_OBJ modify (C_USR_ID visible);
alter table TB_MCM_SEC_OBJ modify (C_AT visible);
alter table TB_MCM_SEC_OBJ modify (C_SVC_ID visible);
alter table TB_MCM_SEC_OBJ modify (C_PGM_ID visible);
alter table TB_MCM_SEC_OBJ modify (U_USR_ID visible);
alter table TB_MCM_SEC_OBJ modify (U_AT visible);
alter table TB_MCM_SEC_OBJ modify (U_SVC_ID visible);
alter table TB_MCM_SEC_OBJ modify (U_PGM_ID visible);

-- ── 3. 작업대 초안(관리자마다 1건) ──
create table TB_MCM_SEC_PERM_DRAFT (
    OWNER_USER_ID varchar2(100 char) not null,
    DRAFT_JSON clob,
    BASE_FP_JSON clob,
    CHANGE_CNT number(10,0) default 0 not null,
    VER number(19,0) default 0,
    C_USR_ID varchar2(100 char),
    C_AT timestamp(6),
    C_SVC_ID varchar2(100 char),
    C_PGM_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    U_AT timestamp(6),
    U_SVC_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_PERM_DRAFT primary key (OWNER_USER_ID)
);

-- ── 4. 작업대 적용 이력 머리 ──
create table TB_MCM_SEC_PERM_HIS (
    APPLY_ID varchar2(40 char) not null,
    APPLY_USER_ID varchar2(100 char) not null,
    APPLY_AT timestamp(6) not null,
    CHANGE_CNT number(10,0) default 0 not null,
    GAIN_USER_CNT number(10,0) default 0 not null,
    LOSE_USER_CNT number(10,0) default 0 not null,
    APPLY_MEMO varchar2(1000 char),
    VER number(19,0) default 0,
    C_USR_ID varchar2(100 char),
    C_AT timestamp(6),
    C_SVC_ID varchar2(100 char),
    C_PGM_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    U_AT timestamp(6),
    U_SVC_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_PERM_HIS primary key (APPLY_ID)
);
-- 이력 조회(기간·적용자) 조건용.
create index IX_TB_MCM_SEC_PERM_HIS_AT on TB_MCM_SEC_PERM_HIS (APPLY_AT, APPLY_USER_ID);

-- ── 5. 작업대 적용 이력 줄 ──
create table TB_MCM_SEC_PERM_HIS_DTL (
    APPLY_ID varchar2(40 char) not null,
    SEQ_NO number(10,0) not null,
    TARGET_TP varchar2(10 char) not null,
    KEY1 varchar2(100 char),
    KEY2 varchar2(100 char),
    OP_TP varchar2(3 char) not null,
    BEFORE_VAL varchar2(2000 char),
    AFTER_VAL varchar2(2000 char),
    VER number(19,0) default 0,
    C_USR_ID varchar2(100 char),
    C_AT timestamp(6),
    C_SVC_ID varchar2(100 char),
    C_PGM_ID varchar2(100 char),
    U_USR_ID varchar2(100 char),
    U_AT timestamp(6),
    U_SVC_ID varchar2(100 char),
    U_PGM_ID varchar2(100 char),
    constraint PK_TB_MCM_SEC_PERM_HIS_DTL primary key (APPLY_ID, SEQ_NO),
    constraint FK_TB_MCM_SEC_PERM_HIS_DTL_HIS foreign key (APPLY_ID) references TB_MCM_SEC_PERM_HIS (APPLY_ID),
    constraint CK_TB_MCM_SEC_PERM_HIS_DTL_TP check (TARGET_TP in ('USER_GRP','GRP_ROLE','ROLE_OBJ')),
    constraint CK_TB_MCM_SEC_PERM_HIS_DTL_OP check (OP_TP in ('ADD','DEL','UPD'))
);

-- ── 6. 주석 ──
COMMENT ON TABLE TB_MCM_SEC_ROLE_PERM IS '직무 퍼미션(직무×오브젝트)';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.ROLE_ID IS '직무 아이디';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.OBJECT_ID IS '오브젝트 아이디';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.BTN_PERM IS '버튼 권한(action 코드, 쉼표 구분)';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.POPUP_PERM IS '팝업 권한(action 코드, 쉼표 구분)';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.DATA_PERM IS '데이터 권한(코드, 쉼표 구분)';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.VER IS '버전';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.C_USR_ID IS '생성자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.C_AT IS '생성일시';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.C_SVC_ID IS '생성 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.C_PGM_ID IS '생성 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.U_USR_ID IS '수정자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.U_AT IS '수정일시';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.U_SVC_ID IS '수정 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_ROLE_PERM.U_PGM_ID IS '수정 프로그램 아이디';

COMMENT ON COLUMN TB_MCM_SEC_OBJ.BTN_PERM IS '허용 버튼 권한(action 코드, 쉼표 구분)';
COMMENT ON COLUMN TB_MCM_SEC_OBJ.POPUP_PERM IS '허용 팝업 권한(action 코드, 쉼표 구분)';
COMMENT ON COLUMN TB_MCM_SEC_OBJ.DATA_PERM IS '허용 데이터 권한(코드, 쉼표 구분)';

COMMENT ON TABLE TB_MCM_SEC_PERM_DRAFT IS '권한 작업대 초안';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.OWNER_USER_ID IS '초안 주인 사용자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.DRAFT_JSON IS '변경 목록(JSON)';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.BASE_FP_JSON IS '처음 건드린 범위의 현재 행 지문(JSON)';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.CHANGE_CNT IS '변경 건수';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.VER IS '버전';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.C_USR_ID IS '생성자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.C_AT IS '생성일시';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.C_SVC_ID IS '생성 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.C_PGM_ID IS '생성 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.U_USR_ID IS '수정자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.U_AT IS '수정일시';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.U_SVC_ID IS '수정 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_DRAFT.U_PGM_ID IS '수정 프로그램 아이디';

COMMENT ON TABLE TB_MCM_SEC_PERM_HIS IS '권한 작업대 적용 이력';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.APPLY_ID IS '적용 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.APPLY_USER_ID IS '적용자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.APPLY_AT IS '적용일시';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.CHANGE_CNT IS '변경 건수';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.GAIN_USER_CNT IS '권한을 얻은 사용자 수';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.LOSE_USER_CNT IS '권한을 잃은 사용자 수';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.APPLY_MEMO IS '적용 메모';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.VER IS '버전';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.C_USR_ID IS '생성자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.C_AT IS '생성일시';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.C_SVC_ID IS '생성 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.C_PGM_ID IS '생성 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.U_USR_ID IS '수정자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.U_AT IS '수정일시';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.U_SVC_ID IS '수정 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS.U_PGM_ID IS '수정 프로그램 아이디';

COMMENT ON TABLE TB_MCM_SEC_PERM_HIS_DTL IS '권한 작업대 적용 이력 상세';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.APPLY_ID IS '적용 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.SEQ_NO IS '순번';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.TARGET_TP IS '대상 구분(USER_GRP·GRP_ROLE·ROLE_OBJ)';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.KEY1 IS '대상 키 1(사용자·직무 그룹·직무)';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.KEY2 IS '대상 키 2(직무 그룹·직무·오브젝트)';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.OP_TP IS '변경 구분(ADD·DEL·UPD)';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.BEFORE_VAL IS '변경 전 값';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.AFTER_VAL IS '변경 후 값';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.VER IS '버전';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.C_USR_ID IS '생성자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.C_AT IS '생성일시';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.C_SVC_ID IS '생성 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.C_PGM_ID IS '생성 프로그램 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.U_USR_ID IS '수정자 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.U_AT IS '수정일시';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.U_SVC_ID IS '수정 서비스 아이디';
COMMENT ON COLUMN TB_MCM_SEC_PERM_HIS_DTL.U_PGM_ID IS '수정 프로그램 아이디';
