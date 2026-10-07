package com.dongkuk.dmes.mcm.init.seed;

/**
 * MSSQL 계열 전용 schema artifacts(스키마·테이블·뷰·ALTER) 멱등 적재 (2026-10-04 DataInitializer 분할).
 *
 * <p>SQLite(local 단독)에서는 호출하지 않는다 — {@code DataInitializer.run()} 이 방언으로 분기한다.
 * 메서드 본문(T-SQL 문자열 포함)은 분할 전 DataInitializer 와 같다.
 */
public final class SchemaArtifactsMssql extends SeedSupport {

    public SchemaArtifactsMssql(SeedSupport support) {
        super(support);
    }

    /**
     * MCM csa 9 화면 schema artifacts(W1~W8) 멱등 적재 — MSSQL 계열 전용, 호출 순서가 곧 계약이다.
     * 분할 전에는 {@code DataInitializer.run()} 의 {@code if (!sqliteDialect)} 블록에 그대로 있던 호출이다.
     */
    public void initMcmCsaCommArtifacts() {
        // MCM csa commObjMng schema artifacts — 멱등 적재 (2026-06-01 사용자 결정 csa 9 화면 1차 worker W1).
        // 스키마 = MCMAPUSER (cma 정본과 다름 — csa 9 화면 공통 정책 #1).
        //  - TB_MCM_SEC_OBJ        : 본 화면 owner (commObjMng). 본 13 컬럼 + audit 9 컬럼 명시 DDL.
        //  - TB_MCM_SEC_MENU       : read-only 조인 (selectCommObjMng MENU_ID scalar subquery + delete NOT EXISTS).
        //  - TB_MCM_SEC_MENU_FLD   : read-only lov (selectMenuId).
        //  - TB_MCM_SEC_ROLE_MAPPING : read-only EXISTS 검증 (delete 차단).
        // hibernate ddl-auto 가 MCMAPUSER schema 의 TB_MCM_SEC_OBJ 를 SecObj entity 로 자동 생성하지만,
        // 다른 3 테이블은 entity ✗ → 본 메서드가 native DDL 로 명시 생성.
        initMcmCsaCommObjMngArtifacts();

        // MCM csa commMenuMng schema artifacts — 멱등 적재 (2026-06-01 worker W2).
        // 본 화면 owner = TB_MCM_SEC_MENU (W1 stub 2 컬럼 → W2 full 15 본 + audit 9 컬럼으로 ALTER 확장).
        // W1 의 TB_MCM_SEC_OBJ / TB_MCM_SEC_MENU_FLD / TB_MCM_SEC_ROLE_MAPPING 는 본 화면도 사용 (read-only) —
        // 본 메서드는 그것들을 재생성 ✗ (W1 IF NOT EXISTS 가드와 정합).
        initMcmCsaCommMenuMngArtifacts();

        // MCM csa commRoleMng schema artifacts — 멱등 적재 (2026-06-01 worker W3).
        // 본 화면 owner 2 테이블:
        //  - TB_MCM_SEC_ROLE          : 본 7 컬럼 (PK ROLE_ID) + audit 9 — 신규 생성 (entity SecRole 정합)
        //  - TB_MCM_SEC_ROLE_MAPPING  : W1 stub (ROLE_ID, OBJECT_ID 2 컬럼) → W3 full owner (PK 3 복합 + audit 9)
        //                               PERMISSION_ID 컬럼 ADD + PK 재설계 (drop + recreate)
        // 본 화면 read-only stub 2 테이블:
        //  - TB_MCM_SEC_PERM          : searchCmPerm NOT EXISTS 검증 + JOIN (commPermMng 화면 owner)
        //  - TB_MCM_SEC_ROLEGROUP_MAPPING : deleteCommRole NOT EXISTS 검증 (commRoleGrpMng 화면 owner)
        initMcmCsaCommRoleMngArtifacts();

        // MCM csa commRoleGrpMng schema artifacts — 멱등 적재 (2026-06-01 worker W4).
        // 본 화면 owner 2 테이블:
        //  - TB_MCM_SEC_ROLEGROUP        : 본 6 컬럼 (PK ROLE_GROUP_ID) + audit 9 — 신규 생성 (entity SecRoleGroup 정합)
        //  - TB_MCM_SEC_ROLEGROUP_MAPPING : W3 stub (ROLE_GROUP_ID, ROLE_ID 2 컬럼 + PK 2 복합) → W4 full owner
        //                                   PK 는 W3 stub 과 동일 (변경 ✗) — audit 9 컬럼만 ALTER ADD (멱등)
        // 본 화면 read-only stub 1 테이블:
        //  - TB_MCM_SEC_USER_MAPPING     : selectCommRoleGrp scalar subquery + deleteCommRoleGrp NOT EXISTS 검증 (commUserMng 화면 owner)
        //  TB_MCM_SEC_ROLE / TB_MCM_SEC_ROLE_MAPPING / TB_MCM_SEC_MENU / TB_MCM_SEC_MENU_FLD / TB_MCM_SEC_OBJ 는
        //  본 화면도 read-only 사용 (selectCommRole / selectCommRoleGrpMap / selectMenuObjTree CTE) — W1·W2·W3 owner DDL 재사용.
        initMcmCsaCommRoleGrpMngArtifacts();

        // MCM csa commUserMng schema artifacts — 멱등 적재 (2026-06-01 worker W5).
        // 본 화면 owner 6 테이블:
        //  - TB_MCM_SEC_USER             : 본 21 컬럼 (PK USER_ID) + audit 9 — 신규 (entity SecUser)
        //  - TB_MCM_SEC_USER_MAPPING     : W4 stub (USER_ID/ROLE_GROUP_ID 2 컬럼 + PK 2 복합) → W5 full owner
        //                                   PK 동일 (변경 ✗) — audit 9 컬럼만 ALTER ADD (정책 #15)
        //  - TB_MCM_SEC_USER_PWD         : 본 7 컬럼 (PK USER_ID) + audit 9 — 신규 (entity SecUserPwd / mergeCommonPwdInit)
        //  - TB_MCM_SEC_USER_HIS         : 본 7 컬럼 + PK 2 복합 (USER_ID + ACTIVE_DT) + audit 9 — 신규 (정책 #3 (C) 흡수)
        //  - TB_MCM_SEC_USER_ROLL_HIS    : 본 8 컬럼 + PK 5 복합 + audit 9 — 신규 (정책 #3 (C) 흡수)
        //  - TB_MCM_DEPT_INFO            : 본 7 컬럼 (PK DEPT_CD) + audit 9 — 신규 (정책 #2 / Q-002 — EAI 폐기 대체)
        // TB_MCM_SEC_ROLEGROUP 는 W4 owner — read-only JOIN (selectCommUserRoleGrp / selectCommRoleGrpList).
        initMcmCsaCommUserMngArtifacts();

        // MCM csa commPermMng schema artifacts — 멱등 적재 (2026-06-01 worker W6).
        // 본 화면 owner 1 테이블:
        //  - TB_MCM_SEC_PERM : W3 stub (PERMISSION_ID(PK) + 5 컬럼) → W6 full owner
        //                      PK 동일 (변경 ✗) — 본 5 컬럼 ADD (PERMISSION_DESC / PERMISSION_ACTION /
        //                      START_ACTIVE_DATE / END_ACTIVE_DATE + BIZ_SYSTEM_CODE legacy)
        //                      + audit 9 컬럼 ALTER ADD (정책 #15)
        // TB_MCM_SEC_ROLE_MAPPING 은 W3 owner — read-only EXISTS 검증 (deleteCommPermMng NOT EXISTS xml:91~95
        // + selectCommPermMng scalar subquery ROLE_ID xml:19~22). 본 메서드 재생성 ✗.
        initMcmCsaCommPermMngArtifacts();

        // MCM csa commSyncMng schema artifacts — 멱등 적재 (2026-06-01 worker W8).
        // 본 화면 owner 테이블 ✗ — cma 4 화면 (masterCodeMng) entity 재사용 (정책 #6 (A) / Q-007 해소).
        // 본 메서드는 동기화 TARGET schema 의 3 테이블만 보장:
        //  - MCMAPUSER.TB_MCM_CODE_{MASTER|CATEGORY|DETAIL} — 이미 initMcmCmaSyncSchemaArtifacts() 가 적재
        //  - MCM_BACKUP.TB_MCM_CODE_{MASTER|CATEGORY} — 본 worker 가 신규 적재 (MA2 분기 대상 schema)
        //    DETAIL 은 As-Is java:115 백업 제외 정책으로 미적재.
        initMcmCsaCommSyncMngArtifacts();

        // MCM csa commUserRoleCopy schema artifacts — 멱등 보장 (2026-06-01 worker W7).
        // 본 화면은 신규 owner 테이블 ✗ — 모두 W4 (commRoleGrpMng) + W5 (commUserMng) owner 재사용:
        //  - TB_MCM_SEC_USER         (W5 owner) — selectUserList / selectCopyUserMap (read-only)
        //  - TB_MCM_SEC_USER_MAPPING (W5 owner) — selectCopyRoleGroupList / selectRoleMergeObject (read) +
        //                                         mergeCommonCopyRoleGrp (write — SecUserMapping save)
        //  - TB_MCM_SEC_ROLEGROUP    (W4 owner) — ROLE_GROUP_NM scalar subquery (read-only)
        //  - TB_MCM_SEC_USER_ROLL_HIS (W5 owner) — 권한부여 이력 적재 (SecUserRollHis save / 정책 #6 Q-002/Q-006)
        //  - TB_MCM_DEPT_INFO        (W5 owner) — selectUserList JOIN DEPT_NM (정책 #2 Q-004)
        // 본 메서드는 W5 의 owner DDL 멱등성을 신뢰 (IF NOT EXISTS 가드) — 본 worker 는 호환 가드 호출만.
        initMcmCsaCommUserRoleCopyArtifacts();
    }

    /**
     * MCM cma 동기화 schema artifacts 멱등 적재 (2026-05-29 사용자 결정 정정).
     *
     * <p>아키텍처 (사용자 명시):
     * <ul>
     *   <li>{@code MCM_SOURCE} — 원장 (편집/DML 대상). Entity {@code MasterCode / MasterCodeCategory / MasterCodeDetail}
     *       의 @Table(schema="MCM_SOURCE") 기반으로 hibernate ddl-auto=update 가 자동 생성.</li>
     *   <li>{@code MCMAPUSER}  — 운영 read 동기화본 (read-only). 동기화 화면이 MCM_SOURCE → MCMAPUSER 로 row copy.
     *       SELECT 카탈로그 (다른 모듈 GRANT 대상). 본 메서드가 빈 테이블 3 개 + view 1 개 멱등 적재.</li>
     *   <li>{@code MCM_BACKUP} — 백업본. 동기화 화면 사이클 (별도 worker) 위임 — 본 메서드 미적재.</li>
     * </ul>
     *
     * <p>적재 대상 (멱등 — {@code IF NOT EXISTS}):
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_CODE_MASTER}   — {@code SELECT INTO ... WHERE 1=0} 빈 구조 복제</li>
     *   <li>{@code MCMAPUSER.TB_MCM_CODE_CATEGORY} — 동</li>
     *   <li>{@code MCMAPUSER.TB_MCM_CODE_DETAIL}   — 동</li>
     *   <li>{@code MCMAPUSER.VI_MCM_CODE_ACCESS}   — view (사용자 제공 정본 DDL 의 MSSQL 변환).
     *       JOIN 대상 = MCMAPUSER 자기 schema (동기화본). MASTER.USE_TP='Y' 필터.</li>
     * </ol>
     *
     * <p>MSSQL 변환 메모 — Oracle PUBLIC SYNONYM 은 MSSQL 미지원 → schema 명시 (a 안). 본 메서드는 schema 명시 view 만 생성하고,
     * 호출측 (Service.java FROM 절) 도 {@code MCMAPUSER.VI_MCM_CODE_ACCESS} 로 schema 를 명시한다.
     */
    public void initMcmCmaSyncSchemaArtifacts() {
        copyEmptyTableIfAbsent("MCMAPUSER", "TB_MCM_CODE_MASTER",   "MCM_SOURCE");
        copyEmptyTableIfAbsent("MCMAPUSER", "TB_MCM_CODE_CATEGORY", "MCM_SOURCE");
        copyEmptyTableIfAbsent("MCMAPUSER", "TB_MCM_CODE_DETAIL",   "MCM_SOURCE");
        createOrReplaceMcmCodeAccessView();
        log.info("[DataInitializer] MCM cma 동기화 schema artifacts 멱등 적재 완료 (MCMAPUSER 빈 3 테이블 + VI_MCM_CODE_ACCESS)");
    }

    /** {@code target} schema 에 {@code table} 이 없으면 {@code source} schema 의 동명 테이블 구조를 빈 복제. */
    private void copyEmptyTableIfAbsent(String target, String table, String source) {
        Number exists = (Number) nq(
                "SELECT COUNT(*) FROM sys.objects " +
                "WHERE object_id = OBJECT_ID(:fqn) AND type = 'U'")
                .setParameter("fqn", target + "." + table)
                .getSingleResult();
        if (exists.intValue() > 0) {
            return;
        }
        // MSSQL: SELECT INTO 는 컬럼 타입을 복제하지만 PK / 인덱스 / DEFAULT 는 복제하지 않는다 (운영 동기화본은 read 중심이라 충분).
        nq(
                "SELECT * INTO " + target + "." + table +
                " FROM " + source + "." + table + " WHERE 1=0")
                .executeUpdate();
        log.info("[DataInitializer] 빈 테이블 복제: {}.{} ← {}.{}", target, table, source, table);
    }

    /**
     * {@code MCMAPUSER.VI_MCM_CODE_ACCESS} 를 사용자 제공 정본 DDL 의 MSSQL 변환으로 멱등 생성.
     * <p>JOIN 대상 = MCMAPUSER 자기 schema 의 동기화본 3 테이블. 원장 (MCM_SOURCE) 직접 JOIN ✗ — 동기화 시차 의도.
     */
    private void createOrReplaceMcmCodeAccessView() {
        // CREATE VIEW 는 batch 의 first statement 여야 한다. IF 블록 안에서는 EXEC dynamic SQL 로 우회.
        nq(
                "IF OBJECT_ID('MCMAPUSER.VI_MCM_CODE_ACCESS', 'V') IS NULL " +
                "EXEC('CREATE VIEW MCMAPUSER.VI_MCM_CODE_ACCESS (" +
                "  CODE_ID, CODE_NM, CATEGORY_ID, CATEGORY_NM, CODE_VAL, CODE_VAL_MEAN," +
                "  CODE_VAL_REF1, CODE_VAL_REF2, CODE_VAL_REF3, CODE_VAL_REF4, CODE_VAL_REF5," +
                "  CODE_VAL_DESC, CODE_VAL_REMARK, CODE_VER, SORT_SEQ" +
                ") AS " +
                "SELECT MASTER.CODE_ID, MASTER.CODE_NM, CATEGORY.CATEGORY_ID, CATEGORY.CATEGORY_NM," +
                "       DETAIL.CODE_VAL, DETAIL.CODE_VAL_MEAN," +
                "       DETAIL.CODE_VAL_REF1, DETAIL.CODE_VAL_REF2, DETAIL.CODE_VAL_REF3, DETAIL.CODE_VAL_REF4, DETAIL.CODE_VAL_REF5," +
                "       DETAIL.CODE_VAL_DESC, DETAIL.CODE_VAL_REMARK, DETAIL.CODE_VER, DETAIL.SORT_SEQ " +
                "  FROM MCMAPUSER.TB_MCM_CODE_MASTER MASTER, MCMAPUSER.TB_MCM_CODE_CATEGORY CATEGORY, MCMAPUSER.TB_MCM_CODE_DETAIL DETAIL " +
                " WHERE MASTER.USE_TP = ''Y''" +
                "   AND MASTER.MASTER_CODE = CATEGORY.MASTER_CODE" +
                "   AND MASTER.MASTER_CODE = DETAIL.MASTER_CODE" +
                "   AND CATEGORY.CATEGORY_ID = DETAIL.CATEGORY_ID')")
                .executeUpdate();
    }

    /**
     * MCM csa commObjMng schema artifacts 멱등 적재 (2026-06-01 worker W1).
     *
     * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 — cma 의 MCM_SOURCE 와 다름. 분석리포트 §11.1).
     *
     * <p>적재 대상:
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_OBJ} — 본 화면 owner. 본 13 컬럼 (To-Be 정책 #1 — BIZ_SYSTEM_CODE 폐기)
     *       + audit 9 컬럼 (McmAuditEntity 정합 C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT /
     *       U_SVC_ID / U_PGM_ID / VER). hibernate ddl-auto=update 가 SecObj entity 로 자동 생성 가능하나,
     *       schema 미존재 시 자동 생성 실패 위험 → 본 메서드가 명시 DDL 로 보장.</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_MENU} — read-only 조인 (selectCommObjMng MENU_ID scalar subquery +
     *       delete NOT EXISTS). 본 화면 owner ✗ — 본 화면이 native query 로 OBJECT_ID / MENU_ID 2 컬럼만 사용.
     *       commMenuMng 화면 owner 가 정본 DDL 등록 시 본 stub 은 hibernate skip.</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_MENU_FLD} — read-only lov (selectMenuId). MENU_ID / BIZ_SYSTEM_CODE /
     *       MENU_NM / PARENT_MENU_ID 4 컬럼만 사용.</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} — read-only EXISTS 검증 (delete 차단). OBJECT_ID 1 컬럼만 사용.</li>
     * </ol>
     *
     * <p>모든 DDL 은 MSSQL {@code IF NOT EXISTS} 멱등. 본 화면 owner 인 {@code TB_MCM_SEC_OBJ} 만 컬럼 카탈로그
     * 1:1 정의 (분석 §9.6.1 인용). 나머지 3 read-only 테이블은 본 화면이 사용하는 최소 컬럼만 포함.
     */
    private void initMcmCsaCommObjMngArtifacts() {
        ensureSchemaMcmapuser();
        createTbMcmSecObjIfAbsent();
        alterTbMcmSecObjAccessTpColumnWidth();
        normalizeTbMcmSecObjAccessTpValues();
        createTbMcmSecMenuStubIfAbsent();
        normalizeTbMcmSecObjFormUrlValues();
        createTbMcmSecMenuFldStubIfAbsent();
        createTbMcmSecRoleMappingStubIfAbsent();
        log.info("[DataInitializer] MCM csa commObjMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_OBJ + TB_MCM_SEC_MENU / _FLD / TB_MCM_SEC_ROLE_MAPPING stub)");
    }

    /**
     * 2026-06-03 사용자 명시 변경 — TB_MCM_SEC_OBJ.ACCESS_TP 컬럼 사이즈 VARCHAR(1) → VARCHAR(10) 확장
     * (한글 "내부"/"외부" 저장 위함). 이미 적재된 DB 에 대해 멱등 ALTER COLUMN.
     * sys.columns 에서 max_length 가 1 (VARCHAR(1) — char_max_length 1 byte) 이면 ALTER.
     */
    private void alterTbMcmSecObjAccessTpColumnWidth() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_OBJ")) return;
        Object curLen = nq(
                "SELECT c.max_length FROM sys.columns c " +
                "JOIN sys.tables t ON t.object_id = c.object_id " +
                "JOIN sys.schemas s ON s.schema_id = t.schema_id " +
                "WHERE s.name = 'MCMAPUSER' AND t.name = 'TB_MCM_SEC_OBJ' AND c.name = 'ACCESS_TP'")
                .getSingleResult();
        if (curLen == null) return;
        int len = ((Number) curLen).intValue();
        if (len >= 10) return;
        nq(
                "ALTER TABLE MCMAPUSER.TB_MCM_SEC_OBJ ALTER COLUMN ACCESS_TP VARCHAR(10) NULL")
                .executeUpdate();
        log.info("[DataInitializer] ALTER COLUMN: MCMAPUSER.TB_MCM_SEC_OBJ.ACCESS_TP VARCHAR(1) -> VARCHAR(10)");
    }

    /**
     * 2026-06-03 사용자 명시 변경 — TB_MCM_SEC_OBJ.ACCESS_TP 잔존 값 멱등 정규화.
     * <p>As-Is 3 enum ("1 내부 neXacro" / "2 외부 neXacro" / "3 외부 url") + 가능한 옛 시드 값
     * ('1' / '2' / '3' / '내부 neXacro' / '외부 neXacro' / '외부 url' / 'I' / 'E' 등) → To-Be 2 enum ("내부" / "외부") 로 일괄 정정.
     * <p>매핑 정책: AsIs "1 내부 neXacro" 계열 → "내부". AsIs "2 외부 neXacro" / "3 외부 url" 계열 → "외부".
     * <p>이미 "내부" / "외부" 인 row 는 WHERE 절로 skip (멱등).
     */
    private void normalizeTbMcmSecObjAccessTpValues() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_OBJ")) return;
        int toInner = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_OBJ SET ACCESS_TP = N'내부' " +
                "WHERE ACCESS_TP IN ('1', N'1', 'I', 'INNER', N'내부 neXacro', N'내부_neXacro', N'내부neXacro') " +
                "  AND ACCESS_TP <> N'내부'")
                .executeUpdate();
        int toOuter = nq(
                "UPDATE MCMAPUSER.TB_MCM_SEC_OBJ SET ACCESS_TP = N'외부' " +
                "WHERE ACCESS_TP IN ('2', '3', N'2', N'3', 'E', 'OUTER', N'외부 neXacro', N'외부 url', N'외부_neXacro', N'외부url', N'외부neXacro') " +
                "  AND ACCESS_TP <> N'외부'")
                .executeUpdate();
        if (toInner > 0 || toOuter > 0) {
            log.info("[DataInitializer] TB_MCM_SEC_OBJ.ACCESS_TP 정규화 — 내부={} / 외부={}", toInner, toOuter);
        }
    }

    /**
     * 2026-06-03 사용자 명시 — As-Is nexacro `${OBJECT_ID}.xfdl` 형식 폐기,
     * ToBe portal shell 실제 라우팅 형식 `{group}/{OBJECT_ID}` 적용 (page-components/{group}/{leaf}/page.tsx).
     * SEC_MENU.PARENT_MENU_ID (cma/csa/cme) 와 JOIN 해서 group 결정 후 멱등 UPDATE.
     */
    private void normalizeTbMcmSecObjFormUrlValues() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_OBJ")) return;
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_MENU")) return;
        int n = nq(
                "UPDATE o " +
                "   SET o.FORM_URL = m.PARENT_MENU_ID + '/' + o.OBJECT_ID " +
                "  FROM MCMAPUSER.TB_MCM_SEC_OBJ o " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_MENU m ON m.OBJECT_ID = o.OBJECT_ID " +
                " WHERE m.PARENT_MENU_ID IS NOT NULL " +
                "   AND (o.FORM_URL IS NULL " +
                "        OR o.FORM_URL = '' " +
                "        OR o.FORM_URL LIKE '%.xfdl' " +
                "        OR o.FORM_URL = o.OBJECT_ID) " +
                "   AND (o.FORM_URL IS NULL OR o.FORM_URL <> (m.PARENT_MENU_ID + '/' + o.OBJECT_ID))")
                .executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] TB_MCM_SEC_OBJ.FORM_URL 정규화 (group/OBJECT_ID) - {} row", n);
        }
    }

    /** {@code MCMAPUSER} schema 가 없으면 생성 (MSSQL). */
    private void ensureSchemaMcmapuser() {
        nq(
                "IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'MCMAPUSER') "
                + "EXEC('CREATE SCHEMA MCMAPUSER')")
                .executeUpdate();
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_OBJ} — 본 화면 owner (commObjMng). 본 13 컬럼 (To-Be 정책 #1) +
     * audit 9 컬럼. 분석리포트 §9.6.1 / §11.1 인용.
     */
    private void createTbMcmSecObjIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_OBJ")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_OBJ (" +
                "  OBJECT_ID         VARCHAR(50)   NOT NULL," +
                "  OBJECT_NM         VARCHAR(100)  NULL," +
                "  PROGRAM_DESC      VARCHAR(300)  NULL," +
                "  SYSTEM_CODE       VARCHAR(10)   NULL," +
                "  OBJECT_TYPE       VARCHAR(10)   NULL," +
                "  SERVICE           VARCHAR(100)  NULL," +
                "  USE_TP            VARCHAR(1)    NULL," +
                "  ACCESS_TP         VARCHAR(10)   NULL," +
                "  FORM_URL          VARCHAR(100)  NULL," +
                "  OUT_ACCESS_IP     VARCHAR(150)  NULL," +
                "  PARAM             VARCHAR(150)  NULL," +
                "  START_ACTIVE_DATE DATETIME2     NULL," +
                "  END_ACTIVE_DATE   DATETIME2     NULL," +
                // audit 9 — McmAuditEntity 정합
                "  C_USR_ID          VARCHAR(100)  NULL," +
                "  C_AT              DATETIME2     NULL," +
                "  C_SVC_ID          VARCHAR(100)  NULL," +
                "  C_PGM_ID          VARCHAR(100)  NULL," +
                "  U_USR_ID          VARCHAR(100)  NULL," +
                "  U_AT              DATETIME2     NULL," +
                "  U_SVC_ID          VARCHAR(100)  NULL," +
                "  U_PGM_ID          VARCHAR(100)  NULL," +
                "  VER               BIGINT        NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_OBJ PRIMARY KEY (OBJECT_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_OBJ");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_MENU} — read-only 조인 stub (본 화면 미 owner — commMenuMng 화면 owner).
     * 본 화면이 사용하는 컬럼 (MENU_ID / OBJECT_ID) 만 포함. 후속 worker (commMenuMng) 가 컬럼 추가 시
     * {@code IF NOT EXISTS} 가드로 본 stub 보존.
     */
    private void createTbMcmSecMenuStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_MENU")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_MENU (" +
                "  MENU_ID    VARCHAR(30)  NOT NULL," +
                "  OBJECT_ID  VARCHAR(100) NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_MENU PRIMARY KEY (MENU_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_MENU (stub)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_MENU_FLD} — read-only lov stub (As-Is 1:1 컬럼 정합).
     *
     * <p>분석리포트 commMenuMng §9.3 정합 — 본 4 컬럼:
     * <ul>
     *   <li>{@code MENU_ID}        — PK (xml:127)</li>
     *   <li>{@code MENU_SEQ}       — 정렬 키 (xml:128 / SYS_CONNECT_BY_PATH 의 TO_CHAR(MENU_SEQ,'00000000'))</li>
     *   <li>{@code MENU_NM}        — 트리 표시 텍스트 (xml:129)</li>
     *   <li>{@code PARENT_MENU_ID} — 부모-자식 관계 (xml:130)</li>
     * </ul>
     *
     * <p>SecMenuNativeRepository.searchMenuFld 의 CTE 쿼리가 MENU_SEQ 를 SELECT/ORDER BY 사용 — 본 컬럼이
     * 없으면 SQL 실행 시 "열 이름 'MENU_SEQ'이(가) 유효하지 않습니다" 에러 발생 (2026-06-01 cycle 2 결함).
     *
     * <p>BIZ_SYSTEM_CODE 컬럼은 commMenuMng 분석 §9.3 #5 정책 #1 (BIZ_SYSTEM_CODE 도메인 전면 폐기) 에
     * 따라 미적재. 본 환경에서 W1 시점에 적재된 BIZ_SYSTEM_CODE 컬럼은 ALTER DROP 하지 않고 잔존 보존
     * (DDL 카탈로그 의미만 — entity ✗ + read SQL 미사용).
     */
    private void createTbMcmSecMenuFldStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_MENU_FLD")) {
            // 이미 존재 → W1 stub (MENU_SEQ 누락) 가능성 → ALTER ADD 로 누락 컬럼 보강 (멱등).
            upgradeTbMcmSecMenuFldToFullOwner();
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_MENU_FLD (" +
                "  MENU_ID         VARCHAR(30)  NOT NULL," +
                "  MENU_SEQ        VARCHAR(30)  NULL," +
                "  MENU_NM         VARCHAR(100) NULL," +
                "  PARENT_MENU_ID  VARCHAR(30)  NULL," +
                "  BIZ_SYSTEM_CODE VARCHAR(10)  NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_MENU_FLD PRIMARY KEY (MENU_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_MENU_FLD (stub + MENU_SEQ)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_MENU_FLD} 누락 컬럼 ADD — W1 stub 4 컬럼 → As-Is 정합 (MENU_SEQ ADD).
     *
     * <p>2026-06-01 cycle 2 결함 fix — W1 (commObjMng) 가 적재한 4 컬럼 stub 에 MENU_SEQ 누락 →
     * SecMenuNativeRepository.searchMenuFld 의 CTE 가 MENU_SEQ SELECT/ORDER BY 시 에러. 본 메서드가
     * IF NOT EXISTS 가드로 MENU_SEQ 만 ALTER ADD (멱등).
     *
     * <p>PK 는 단일 MENU_ID 유지 (As-Is 정책 — MENU_SEQ 는 정렬 키만, PK 후보 ✗).
     */
    private void upgradeTbMcmSecMenuFldToFullOwner() {
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "MENU_SEQ", "VARCHAR(30)");
        // Round 3 (2026-06-02): 폴더에도 FULL_SEQ 인코딩 적용 (모듈=백만 / 그룹=만).
        // USE_TP / MENU_TP / MENU_VIEW_YN — SEC_MENU 와 동일 형식 (sidebar 트리 응답에 필요).
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "FULL_SEQ", "NUMERIC(10,0)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "USE_TP", "VARCHAR(1)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "MENU_TP", "VARCHAR(20)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU_FLD", "MENU_VIEW_YN", "VARCHAR(1)");
        // R3 시드 보정 — 4 폴더 row 의 FULL_SEQ / USE_TP / MENU_VIEW_YN 멱등 UPDATE.
        Object[][] fldR3 = new Object[][]{
                {"mcm", 1000000L},
                {"cma", 1010000L},
                {"csa", 1020000L},
                {"cme", 1030000L},
        };
        for (Object[] r : fldR3) {
            nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                    "   SET FULL_SEQ = :fs, USE_TP = COALESCE(USE_TP, 'Y'), " +
                    "       MENU_VIEW_YN = COALESCE(MENU_VIEW_YN, 'Y') " +
                    " WHERE MENU_ID = :id")
                    .setParameter("fs", r[1])
                    .setParameter("id", r[0])
                    .executeUpdate();
        }
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} — read-only EXISTS 검증 stub (본 화면 미 owner —
     * commRoleMng / commPermMng 화면 owner). delete 차단용 OBJECT_ID 컬럼만 포함.
     */
    private void createTbMcmSecRoleMappingStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (" +
                "  ROLE_ID    VARCHAR(30)  NOT NULL," +
                "  OBJECT_ID  VARCHAR(50)  NOT NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_ROLE_MAPPING PRIMARY KEY (ROLE_ID, OBJECT_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (stub)");
    }

    /**
     * MCM csa commMenuMng schema artifacts 멱등 적재 (2026-06-01 worker W2).
     *
     * <p>본 화면 owner = {@code TB_MCM_SEC_MENU} (메뉴 항목 마스터).
     * <p>스키마 = {@code MCMAPUSER} (csa 9 화면 공통 정책 #1 — W1 commObjMng 와 동일).
     *
     * <p>적재 대상:
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_MENU} — 본 화면 owner. 본 15 컬럼 (PK 복합 MENU_ID+MENU_SEQ) +
     *       audit 9 컬럼 (McmAuditEntity 정합). 분석리포트 §9.1 / §11.1 인용.
     *       <ul>
     *         <li>W1 stub (MENU_ID/OBJECT_ID 2 컬럼) 이 이미 존재할 수 있음 → 본 메서드가 ALTER 로
     *             누락 컬럼을 individual 추가 (멱등). 컬럼별 존재 검증 후 IF NOT EXISTS 등가 ALTER.</li>
     *         <li>W1 stub 미존재 시 (= 빈 환경) → full DDL 로 신규 생성.</li>
     *       </ul></li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_MENU_FLD} — read-only lov stub. W1 에서 이미 4 컬럼 stub 생성됨
     *       → 본 화면도 동일 컬럼만 사용 (selectMenuFldList CTE). 본 메서드는 W1 stub 재사용 — 추가 컬럼 ✗.</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_OBJ} — W1 owner. 본 화면은 read-only LEFT JOIN — 추가 컬럼 ✗.</li>
     * </ol>
     *
     * <p>모든 DDL 은 MSSQL 멱등 (tableExists / columnExists 가드). hibernate ddl-auto=update 가 SecMenu
     * entity 로 자동 ALTER 시 본 메서드와 동일 결과 — 본 메서드는 ddl-auto 무관 보장.
     */
    private void initMcmCsaCommMenuMngArtifacts() {
        ensureSchemaMcmapuser();
        upgradeTbMcmSecMenuToFullOwner();
        // 2026-06-05 사용자 결정 — PK (MENU_ID, MENU_SEQ) → (MENU_ID) 마이그레이션 (기존 DB) +
        //   MENU_SEQ '0' LPAD 8자리 일괄 정규화 ("001" → "00000001"). 멱등.
        migrateSecMenuPkToMenuIdOnly();
        normalizeMenuSeqLpad8();
        log.info("[DataInitializer] MCM csa commMenuMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_MENU = full 15 본 + audit 9 컬럼 owner / PK=MENU_ID / MENU_SEQ 8자리)");
    }

    /**
     * 2026-06-05 사용자 결정 — {@code TB_MCM_SEC_MENU} PK 를 (MENU_ID, MENU_SEQ) 복합 → (MENU_ID) 단독으로 변경.
     *
     * <p>멱등: 현재 PK 에 MENU_SEQ 가 포함되어 있을 때만 DROP + 재생성. 이미 MENU_ID 단독이면 skip.
     * MENU_ID 중복 존재 시(단독 PK 불가) 마이그레이션 SKIP + 경고 (DROP 후 ADD 실패로 PK 소실 방지).
     */
    private void migrateSecMenuPkToMenuIdOnly() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_MENU")) return;
        Number seqInPk = (Number) nq(
                "SELECT COUNT(*) FROM sys.index_columns ic " +
                "JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id " +
                "JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id " +
                "WHERE i.is_primary_key = 1 AND i.object_id = OBJECT_ID('MCMAPUSER.TB_MCM_SEC_MENU') " +
                "  AND c.name = 'MENU_SEQ'")
                .getSingleResult();
        if (seqInPk == null || seqInPk.intValue() == 0) return; // 이미 MENU_ID 단독 PK (또는 PK에 MENU_SEQ 없음)

        Number dup = (Number) nq(
                "SELECT COUNT(*) FROM (SELECT MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU " +
                "GROUP BY MENU_ID HAVING COUNT(*) > 1) d")
                .getSingleResult();
        if (dup != null && dup.intValue() > 0) {
            log.warn("[DataInitializer] SEC_MENU PK 마이그레이션 SKIP — MENU_ID 중복 {} 건 존재 "
                   + "(MENU_ID 단독 PK 불가). 중복 행 정리 후 재기동 필요.", dup.intValue());
            return;
        }
        String pkName = (String) nq(
                "SELECT name FROM sys.key_constraints " +
                "WHERE parent_object_id = OBJECT_ID('MCMAPUSER.TB_MCM_SEC_MENU') AND type = 'PK'")
                .getSingleResult();
        nq("ALTER TABLE MCMAPUSER.TB_MCM_SEC_MENU DROP CONSTRAINT " + pkName).executeUpdate();
        // PK 컬럼 NOT NULL 보장 (방어) — MENU_SEQ 는 이제 NULL 허용 컬럼으로 완화.
        nq("ALTER TABLE MCMAPUSER.TB_MCM_SEC_MENU ALTER COLUMN MENU_ID VARCHAR(30) NOT NULL").executeUpdate();
        nq("ALTER TABLE MCMAPUSER.TB_MCM_SEC_MENU ALTER COLUMN MENU_SEQ VARCHAR(30) NULL").executeUpdate();
        nq("ALTER TABLE MCMAPUSER.TB_MCM_SEC_MENU ADD CONSTRAINT PK_TB_MCM_SEC_MENU PRIMARY KEY (MENU_ID)").executeUpdate();
        log.info("[DataInitializer] SEC_MENU PK 마이그레이션 완료 — (MENU_ID, MENU_SEQ) → (MENU_ID). 기존 PK 제약={}", pkName);
    }

    /**
     * 2026-06-05 사용자 지시 — 기존 MENU_SEQ 값을 '0' LPAD 8자리로 일괄 정규화 ("001" → "00000001").
     *
     * <p>대상: 숫자로만 구성된 8자 미만 MENU_SEQ (8자 이상 / 비숫자 / NULL 은 변경 ✗ = 멱등).
     * SEC_MENU(화면) · SEC_MENU_FLD(폴더) 양쪽. {@link #migrateSecMenuPkToMenuIdOnly()} 직후 호출되어
     * (MENU_SEQ 가 PK 에서 분리된 뒤) 안전하게 UPDATE.
     */
    private void normalizeMenuSeqLpad8() {
        final String upd =
                "SET MENU_SEQ = RIGHT('00000000' + MENU_SEQ, 8) " +
                "WHERE MENU_SEQ IS NOT NULL AND LEN(MENU_SEQ) < 8 AND MENU_SEQ NOT LIKE '%[^0-9]%'";
        int nMenu = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU " + upd).executeUpdate();
        int nFld = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD " + upd).executeUpdate();
        if (nMenu > 0 || nFld > 0) {
            log.info("[DataInitializer] MENU_SEQ 8자리 LPAD 일괄 정규화 — SEC_MENU={} / SEC_MENU_FLD={}", nMenu, nFld);
        }
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_MENU} 를 W2 owner (full 15 본 + audit 9) 로 보장.
     * <p>W1 stub (MENU_ID/OBJECT_ID 2 컬럼) 이 이미 있으면 누락 컬럼만 ALTER 로 추가.
     * <p>테이블 자체가 없으면 full DDL 로 신규 생성 (PK 복합 MENU_ID + MENU_SEQ).
     */
    private void upgradeTbMcmSecMenuToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_MENU")) {
            // 신규 생성 — full DDL
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_MENU (" +
                    "  MENU_ID           VARCHAR(30)   NOT NULL," +
                    "  MENU_SEQ          VARCHAR(30)   NOT NULL," +
                    "  FULL_SEQ          VARCHAR(30)   NULL," +
                    "  MENU_NM           VARCHAR(300)  NULL," +
                    "  MENU_DESC         VARCHAR(1000) NULL," +
                    "  MENU_TP           VARCHAR(10)   NULL," +
                    "  OBJECT_ID         VARCHAR(50)   NULL," +
                    "  USE_TP            VARCHAR(1)    NULL," +
                    "  START_ACTIVE_DATE DATETIME2     NULL," +
                    "  END_ACTIVE_DATE   DATETIME2     NULL," +
                    "  MENU_VIEW_YN      VARCHAR(1)    NULL," +
                    "  PARENT_MENU_ID    VARCHAR(30)   NULL," +
                    "  MENU_PARAM1       VARCHAR(300)  NULL," +
                    "  MENU_PARAM2       VARCHAR(300)  NULL," +
                    "  MENU_PARAM3       VARCHAR(300)  NULL," +
                    // audit 9 — McmAuditEntity 정합
                    "  C_USR_ID          VARCHAR(100)  NULL," +
                    "  C_AT              DATETIME2     NULL," +
                    "  C_SVC_ID          VARCHAR(100)  NULL," +
                    "  C_PGM_ID          VARCHAR(100)  NULL," +
                    "  U_USR_ID          VARCHAR(100)  NULL," +
                    "  U_AT              DATETIME2     NULL," +
                    "  U_SVC_ID          VARCHAR(100)  NULL," +
                    "  U_PGM_ID          VARCHAR(100)  NULL," +
                    "  VER               BIGINT        NULL," +
                    // 2026-06-05 사용자 결정 — PK = MENU_ID 단독 (MENU_SEQ 는 순수 순서 컬럼).
                    "  CONSTRAINT PK_TB_MCM_SEC_MENU PRIMARY KEY (MENU_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_MENU (full owner / 15 본 + audit 9 / PK=MENU_ID)");
            return;
        }
        // 이미 존재 → W1 stub 일 가능성. 누락 컬럼만 ALTER 로 추가.
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_SEQ",          "VARCHAR(30)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "FULL_SEQ",          "VARCHAR(30)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_NM",           "VARCHAR(300)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_DESC",         "VARCHAR(1000)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_TP",           "VARCHAR(10)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "USE_TP",            "VARCHAR(1)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "START_ACTIVE_DATE", "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "END_ACTIVE_DATE",   "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_VIEW_YN",      "VARCHAR(1)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "PARENT_MENU_ID",    "VARCHAR(30)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_PARAM1",       "VARCHAR(300)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_PARAM2",       "VARCHAR(300)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "MENU_PARAM3",       "VARCHAR(300)");
        // audit 9
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "C_USR_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "C_AT",              "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "C_SVC_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "C_PGM_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "U_USR_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "U_AT",              "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "U_SVC_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "U_PGM_ID",          "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_MENU", "VER",               "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_MENU (W1 stub → W2 owner / 누락 컬럼 ADD)");
    }

    /**
     * MSSQL — 컬럼이 없으면 ALTER TABLE ADD (멱등). hibernate ddl-auto=update 와 동일 효과.
     * 컬럼 타입은 호출자가 책임 (변경 시 ALTER COLUMN 별도 필요).
     */
    private void addColumnIfAbsent(String schema, String table, String column, String columnType) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.columns "
                + "WHERE object_id = OBJECT_ID(:fqn) AND name = :col")
                .setParameter("fqn", schema + "." + table)
                .setParameter("col", column)
                .getSingleResult();
        if (cnt != null && cnt.intValue() > 0) return;
        nq(
                "ALTER TABLE " + schema + "." + table + " ADD " + column + " " + columnType + " NULL")
                .executeUpdate();
        log.info("[DataInitializer] ALTER ADD COLUMN: {}.{}.{} {}", schema, table, column, columnType);
    }

    /** MSSQL {@code sys.objects} 으로 schema + table 존재 여부 확인. */
    private boolean tableExists(String schema, String table) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.objects "
                + "WHERE object_id = OBJECT_ID(:fqn) AND type = 'U'")
                .setParameter("fqn", schema + "." + table)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }

    /**
     * MCM csa commRoleMng schema artifacts 멱등 적재 (2026-06-01 worker W3).
     *
     * <p>본 화면 owner 2 테이블:
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLE} — entity {@code SecRole} 정합. 본 7 컬럼 (PK ROLE_ID + ROLE_NM /
     *       ROLE_DESC / PARENT_ROLE_ID / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE) + audit 9.
     *       To-Be 정책 #1 — BIZ_SYSTEM_CODE 컬럼은 entity 미반영 (DDL 자체에는 잔존 보존 의도 — DMES 카탈로그).</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} — entity {@code SecRoleMapping} 정합 (PK 복합
     *       ROLE_ID + OBJECT_ID + PERMISSION_ID).
     *       <ul>
     *         <li>W1 stub (ROLE_ID/OBJECT_ID 2 컬럼 + PK 2 복합) 이 존재 → PERMISSION_ID 컬럼 ADD +
     *             PK 재설계 (DROP CONSTRAINT + ADD CONSTRAINT) + audit 9 ADD.</li>
     *         <li>W1 stub 미존재 시 → full DDL 신규 생성.</li>
     *       </ul></li>
     * </ol>
     *
     * <p>본 화면 read-only stub 2 테이블 (다른 화면 owner — IF NOT EXISTS 가드):
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_PERM} — commPermMng 화면 owner. 본 화면 사용 컬럼만 (PERMISSION_ID(PK) /
     *       PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN / USE_TP).</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} — commRoleGrpMng 화면 owner. 본 화면 사용 컬럼만
     *       (ROLE_GROUP_ID(PK) / ROLE_ID(PK)).</li>
     * </ul>
     *
     * <p>모든 DDL 은 MSSQL {@code IF NOT EXISTS} 멱등. hibernate ddl-auto=update 가 SecRole/SecRoleMapping
     * entity 로 자동 ALTER 시 본 메서드와 동일 결과 — 본 메서드는 ddl-auto 무관 보장.
     */
    private void initMcmCsaCommRoleMngArtifacts() {
        ensureSchemaMcmapuser();
        createTbMcmSecRoleIfAbsent();
        upgradeTbMcmSecRoleMappingToFullOwner();
        createTbMcmSecPermStubIfAbsent();
        createTbMcmSecRoleGroupMappingStubIfAbsent();
        log.info("[DataInitializer] MCM csa commRoleMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_ROLE owner + TB_MCM_SEC_ROLE_MAPPING owner upgrade + "
               + "TB_MCM_SEC_PERM / TB_MCM_SEC_ROLEGROUP_MAPPING stub)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLE} — 본 화면 owner (commRoleMng). 본 7 컬럼 + audit 9 컬럼.
     * 분석리포트 §9.4.1 (DMES 시트 26 컬럼) 중 To-Be 채택 7 컬럼만. BIZ_SYSTEM_CODE 는 DDL 잔존 (다른 화면 사용).
     */
    private void createTbMcmSecRoleIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_ROLE")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLE (" +
                "  ROLE_ID           VARCHAR(30)   NOT NULL," +
                "  ROLE_NM           VARCHAR(100)  NULL," +
                "  ROLE_DESC         VARCHAR(300)  NULL," +
                "  PARENT_ROLE_ID    VARCHAR(30)   NULL," +
                "  MENU_ID           VARCHAR(30)   NULL," +
                "  BIZ_SYSTEM_CODE   VARCHAR(10)   NULL," + // To-Be 정책 #1 — entity 미반영 / DDL 잔존 (다른 화면)
                "  USE_TP            VARCHAR(1)    NULL," +
                "  START_ACTIVE_DATE DATETIME2     NULL," +
                "  END_ACTIVE_DATE   DATETIME2     NULL," +
                // audit 9 — McmAuditEntity 정합 (W1·W2 동일)
                "  C_USR_ID          VARCHAR(100)  NULL," +
                "  C_AT              DATETIME2     NULL," +
                "  C_SVC_ID          VARCHAR(100)  NULL," +
                "  C_PGM_ID          VARCHAR(100)  NULL," +
                "  U_USR_ID          VARCHAR(100)  NULL," +
                "  U_AT              DATETIME2     NULL," +
                "  U_SVC_ID          VARCHAR(100)  NULL," +
                "  U_PGM_ID          VARCHAR(100)  NULL," +
                "  VER               BIGINT        NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_ROLE PRIMARY KEY (ROLE_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLE (owner / 본 7 + BIZ_SYSTEM_CODE + audit 9)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} 를 W3 owner (PK 3 복합 + audit 9) 로 보장.
     * <p>W1 stub (ROLE_ID/OBJECT_ID 2 컬럼 + PK 2 복합) 이 존재하면:
     *   <ol>
     *     <li>PERMISSION_ID 컬럼 ADD (NOT NULL DEFAULT '' — PK 추가 가능하도록)</li>
     *     <li>기존 PK 제약 DROP (PK_TB_MCM_SEC_ROLE_MAPPING)</li>
     *     <li>새 PK 복합 (ROLE_ID + OBJECT_ID + PERMISSION_ID) ADD CONSTRAINT</li>
     *     <li>audit 9 컬럼 ADD (멱등)</li>
     *   </ol>
     * <p>테이블 자체가 없으면 full DDL 로 신규 생성.
     */
    private void upgradeTbMcmSecRoleMappingToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING")) {
            // 신규 생성 — full DDL (PK 3 복합)
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (" +
                    "  ROLE_ID       VARCHAR(30)   NOT NULL," +
                    "  OBJECT_ID     VARCHAR(50)   NOT NULL," +
                    "  PERMISSION_ID VARCHAR(100)  NOT NULL," +
                    // audit 9 — McmAuditEntity 정합
                    "  C_USR_ID      VARCHAR(100)  NULL," +
                    "  C_AT          DATETIME2     NULL," +
                    "  C_SVC_ID      VARCHAR(100)  NULL," +
                    "  C_PGM_ID      VARCHAR(100)  NULL," +
                    "  U_USR_ID      VARCHAR(100)  NULL," +
                    "  U_AT          DATETIME2     NULL," +
                    "  U_SVC_ID      VARCHAR(100)  NULL," +
                    "  U_PGM_ID      VARCHAR(100)  NULL," +
                    "  VER           BIGINT        NULL," +
                    "  CONSTRAINT PK_TB_MCM_SEC_ROLE_MAPPING PRIMARY KEY (ROLE_ID, OBJECT_ID, PERMISSION_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (full owner / PK 3 + audit 9)");
            return;
        }
        // W1 stub 호환 — 컬럼 ADD + PK 재설계 + audit 9 ADD (멱등)
        // PERMISSION_ID 컬럼 추가 (없으면) — NOT NULL DEFAULT '' (PK 추가 가능)
        if (!columnExists("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "PERMISSION_ID")) {
            nq(
                    "ALTER TABLE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING "
                  + "ADD PERMISSION_ID VARCHAR(100) NOT NULL CONSTRAINT DF_TB_MCM_SEC_ROLE_MAPPING_PERMID DEFAULT ''")
                    .executeUpdate();
            log.info("[DataInitializer] ALTER ADD COLUMN: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING.PERMISSION_ID VARCHAR(100) NOT NULL DEFAULT ''");
            // PK 재설계 — 기존 PK 가 (ROLE_ID, OBJECT_ID) 였으므로 DROP + 새 PK ADD (ROLE_ID, OBJECT_ID, PERMISSION_ID)
            dropPkIfExists("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "PK_TB_MCM_SEC_ROLE_MAPPING");
            nq(
                    "ALTER TABLE MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING "
                  + "ADD CONSTRAINT PK_TB_MCM_SEC_ROLE_MAPPING PRIMARY KEY (ROLE_ID, OBJECT_ID, PERMISSION_ID)")
                    .executeUpdate();
            log.info("[DataInitializer] PK 재설계: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID)");
        }
        // audit 9 ADD (멱등)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "C_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "C_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "C_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "C_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "U_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "U_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "U_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "U_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLE_MAPPING", "VER",       "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (W1 stub → W3 owner / PK 3 복합 + audit 9)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_PERM} — read-only stub (commPermMng 화면 owner).
     * 본 화면이 사용하는 컬럼만 (PERMISSION_ID(PK) / PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM /
     * POPUP_BTN / USE_TP). 후속 worker (commPermMng) 가 컬럼 추가 시 IF NOT EXISTS 가드로 본 stub 보존.
     */
    private void createTbMcmSecPermStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_PERM")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_PERM (" +
                "  PERMISSION_ID     VARCHAR(100)  NOT NULL," +
                "  PERMISSION_NM     VARCHAR(100)  NULL," +
                "  PERMISSION_COMMON VARCHAR(500)  NULL," +
                "  PERMISSION_CUSTOM VARCHAR(500)  NULL," +
                "  POPUP_BTN         VARCHAR(1000) NULL," +
                "  USE_TP            VARCHAR(1)    NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_PERM PRIMARY KEY (PERMISSION_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_PERM (stub)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} — read-only stub (commRoleGrpMng 화면 owner).
     * 본 화면 deleteCommRole NOT EXISTS 검증용 (V-003 서버 재검증). PK 복합 (ROLE_GROUP_ID, ROLE_ID).
     */
    private void createTbMcmSecRoleGroupMappingStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (" +
                "  ROLE_GROUP_ID VARCHAR(30) NOT NULL," +
                "  ROLE_ID       VARCHAR(30) NOT NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_ROLEGROUP_MAPPING PRIMARY KEY (ROLE_GROUP_ID, ROLE_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (stub)");
    }

    /**
     * MCM csa commRoleGrpMng schema artifacts 멱등 적재 (2026-06-01 worker W4).
     *
     * <p>본 화면 owner 2 테이블:
     * <ol>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP} — entity {@code SecRoleGroup} 정합.
     *       본 6 컬럼 (PK ROLE_GROUP_ID + ROLE_GROUP_NM / ROLE_GROUP_DESC / USE_TP / START_ACTIVE_DATE /
     *       END_ACTIVE_DATE) + audit 9. To-Be 정책 #1 — BIZ_SYSTEM_CODE 컬럼은 entity 미반영
     *       (DDL 자체에는 잔존 보존 — DMES 카탈로그 §9.9.1 24 컬럼 정합).</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} — entity {@code SecRoleGroupMapping} 정합
     *       (PK 복합 ROLE_GROUP_ID + ROLE_ID).
     *       <ul>
     *         <li>W3 stub (ROLE_GROUP_ID/ROLE_ID 2 컬럼 + PK 2 복합) 이 존재 → PK 그대로 보존 (W4 entity PK 와 동일).
     *             audit 9 컬럼만 ALTER ADD 로 추가 (멱등).</li>
     *         <li>W3 stub 미존재 시 → full DDL 신규 생성.</li>
     *       </ul></li>
     * </ol>
     *
     * <p>본 화면 read-only stub 1 테이블 (다른 화면 owner — IF NOT EXISTS 가드):
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_USER_MAPPING} — commUserMng 화면 owner.
     *       본 화면 사용 컬럼만 (USER_ID / ROLE_GROUP_ID(PK 2 복합)).
     *       selectCommRoleGrp scalar subquery (xml:14~18) + deleteCommRoleGrp NOT EXISTS (xml:77~80) 검증용.</li>
     * </ul>
     *
     * <p>본 화면이 사용하지만 다른 화면이 owner 인 테이블 (재생성 ✗, 기존 owner DDL 재사용):
     * <ul>
     *   <li>{@code TB_MCM_SEC_ROLE} (W3 owner) — selectCommRoleGrpMap JOIN + selectCommRole 본 테이블 + PARENT_ROLE_ID</li>
     *   <li>{@code TB_MCM_SEC_ROLE_MAPPING} (W3 owner) — selectMenuObjTree WITH MROLE 의 RM</li>
     *   <li>{@code TB_MCM_SEC_MENU} (W2 owner) — selectMenuObjTree WITH MROLE 의 MNU</li>
     *   <li>{@code TB_MCM_SEC_MENU_FLD} (W1 stub) — selectMenuObjTree MENU CTE (CONNECT BY 등가 WITH RECURSIVE)</li>
     *   <li>{@code TB_MCM_SEC_OBJ} (W1 owner) — selectMenuObjTree 최종 LEFT JOIN</li>
     * </ul>
     *
     * <p>모든 DDL 은 MSSQL {@code IF NOT EXISTS} 멱등. hibernate ddl-auto=update 가 SecRoleGroup/SecRoleGroupMapping
     * entity 로 자동 ALTER 시 본 메서드와 동일 결과 — 본 메서드는 ddl-auto 무관 보장.
     */
    private void initMcmCsaCommRoleGrpMngArtifacts() {
        ensureSchemaMcmapuser();
        createTbMcmSecRoleGroupIfAbsent();
        upgradeTbMcmSecRoleGroupMappingToFullOwner();
        createTbMcmSecUserMappingStubIfAbsent();
        log.info("[DataInitializer] MCM csa commRoleGrpMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_ROLEGROUP owner + TB_MCM_SEC_ROLEGROUP_MAPPING owner upgrade + "
               + "TB_MCM_SEC_USER_MAPPING stub)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP} — 본 화면 owner (commRoleGrpMng). 본 6 컬럼 + audit 9.
     * 분석리포트 §9.9.1 (DMES 시트 24 컬럼) 중 To-Be 채택 6 컬럼만. BIZ_SYSTEM_CODE 는 DDL 잔존 (다른 화면 사용 가능성).
     */
    private void createTbMcmSecRoleGroupIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLEGROUP (" +
                "  ROLE_GROUP_ID     VARCHAR(30)   NOT NULL," +
                "  ROLE_GROUP_NM     VARCHAR(100)  NULL," +
                "  ROLE_GROUP_DESC   VARCHAR(300)  NULL," +
                "  BIZ_SYSTEM_CODE   VARCHAR(10)   NULL," + // To-Be 정책 #1 — entity 미반영 / DDL 잔존
                "  USE_TP            VARCHAR(1)    NULL," +
                "  START_ACTIVE_DATE DATETIME2     NULL," +
                "  END_ACTIVE_DATE   DATETIME2     NULL," +
                // audit 9 — McmAuditEntity 정합 (W1·W2·W3 동일)
                "  C_USR_ID          VARCHAR(100)  NULL," +
                "  C_AT              DATETIME2     NULL," +
                "  C_SVC_ID          VARCHAR(100)  NULL," +
                "  C_PGM_ID          VARCHAR(100)  NULL," +
                "  U_USR_ID          VARCHAR(100)  NULL," +
                "  U_AT              DATETIME2     NULL," +
                "  U_SVC_ID          VARCHAR(100)  NULL," +
                "  U_PGM_ID          VARCHAR(100)  NULL," +
                "  VER               BIGINT        NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_ROLEGROUP PRIMARY KEY (ROLE_GROUP_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLEGROUP (owner / 본 6 + BIZ_SYSTEM_CODE + audit 9)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} 를 W4 owner (PK 2 복합 + audit 9) 로 보장.
     * <p>W3 stub (ROLE_GROUP_ID/ROLE_ID 2 컬럼 + PK 2 복합) 이 존재하면:
     *   <ol>
     *     <li>PK 는 W3 stub 과 동일 (변경 ✗ — W4 entity SecRoleGroupMapping PK 도 (ROLE_GROUP_ID, ROLE_ID) 2 복합)</li>
     *     <li>audit 9 컬럼 ADD (멱등)</li>
     *   </ol>
     * <p>테이블 자체가 없으면 full DDL 로 신규 생성.
     */
    private void upgradeTbMcmSecRoleGroupMappingToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING")) {
            // 신규 생성 — full DDL (PK 2 복합)
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (" +
                    "  ROLE_GROUP_ID VARCHAR(30)  NOT NULL," +
                    "  ROLE_ID       VARCHAR(30)  NOT NULL," +
                    // audit 9 — McmAuditEntity 정합
                    "  C_USR_ID      VARCHAR(100) NULL," +
                    "  C_AT          DATETIME2    NULL," +
                    "  C_SVC_ID      VARCHAR(100) NULL," +
                    "  C_PGM_ID      VARCHAR(100) NULL," +
                    "  U_USR_ID      VARCHAR(100) NULL," +
                    "  U_AT          DATETIME2    NULL," +
                    "  U_SVC_ID      VARCHAR(100) NULL," +
                    "  U_PGM_ID      VARCHAR(100) NULL," +
                    "  VER           BIGINT       NULL," +
                    "  CONSTRAINT PK_TB_MCM_SEC_ROLEGROUP_MAPPING PRIMARY KEY (ROLE_GROUP_ID, ROLE_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (full owner / PK 2 + audit 9)");
            return;
        }
        // W3 stub 호환 — PK 동일 (변경 ✗) / audit 9 ADD (멱등)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "C_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "C_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "C_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "C_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "U_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "U_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "U_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "U_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_ROLEGROUP_MAPPING", "VER",       "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (W3 stub → W4 owner / PK 2 보존 + audit 9 ADD)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_USER_MAPPING} — read-only stub (commUserMng 화면 owner).
     * 본 화면 selectCommRoleGrp scalar subquery (xml:14~18) + deleteCommRoleGrp NOT EXISTS (xml:77~80) 검증용.
     * PK 복합 (USER_ID, ROLE_GROUP_ID).
     */
    private void createTbMcmSecUserMappingStubIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_MAPPING (" +
                "  USER_ID       VARCHAR(100) NOT NULL," +
                "  ROLE_GROUP_ID VARCHAR(30)  NOT NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER_MAPPING PRIMARY KEY (USER_ID, ROLE_GROUP_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_MAPPING (stub)");
    }

    // ────────────────────────────────────────────────────────────────
    // W5 commUserMng — schema artifacts (owner 6 테이블)
    // ────────────────────────────────────────────────────────────────

    /**
     * commUserMng (W5) schema artifacts — 멱등 적재.
     *
     * <p>본 화면 owner 6 테이블:
     * <ul>
     *   <li>{@code TB_MCM_SEC_USER}          — 본 21 컬럼 + audit 9 (entity SecUser)</li>
     *   <li>{@code TB_MCM_SEC_USER_MAPPING}  — W4 stub (PK 2 복합) → W5 full owner: audit 9 ADD (정책 #15)</li>
     *   <li>{@code TB_MCM_SEC_USER_PWD}      — 본 7 컬럼 + audit 9 (entity SecUserPwd / mergeCommonPwdInit)</li>
     *   <li>{@code TB_MCM_SEC_USER_HIS}      — 본 7 컬럼 + PK 2 복합 + audit 9 (정책 #3 (C) 흡수)</li>
     *   <li>{@code TB_MCM_SEC_USER_ROLL_HIS} — 본 8 컬럼 + PK 5 복합 + audit 9 (정책 #3 (C) 흡수)</li>
     *   <li>{@code TB_MCM_DEPT_INFO}         — 본 7 컬럼 + audit 9 (정책 #2 / Q-002 — EAI 폐기 대체)</li>
     * </ul>
     */
    private void initMcmCsaCommUserMngArtifacts() {
        ensureSchemaMcmapuser();
        createTbMcmSecUserIfAbsent();
        upgradeTbMcmSecUserMappingToFullOwner();
        createTbMcmSecUserPwdIfAbsent();
        createTbMcmSecUserHisIfAbsent();
        createTbMcmSecUserRollHisIfAbsent();
        createTbMcmDeptInfoIfAbsent();
        log.info("[DataInitializer] MCM csa commUserMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_USER owner + TB_MCM_SEC_USER_MAPPING W4 stub → W5 owner upgrade + "
               + "TB_MCM_SEC_USER_PWD owner + TB_MCM_SEC_USER_HIS owner + TB_MCM_SEC_USER_ROLL_HIS owner + "
               + "TB_MCM_DEPT_INFO owner)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_USER} — 본 화면 owner (commUserMng). 본 21 컬럼 + audit 9.
     * 분석 §9.1.1 (DMES 38 컬럼) 중 audit 17 폐기 + 본 21.
     */
    private void createTbMcmSecUserIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER (" +
                "  USER_ID            VARCHAR(30)   NOT NULL," +
                "  USER_EMP_NO        VARCHAR(10)   NULL," +
                "  SSO_ID             VARCHAR(30)   NULL," +
                "  USER_NM            VARCHAR(30)   NULL," +
                "  START_ACTIVE_DATE  DATETIME2     NULL," +
                "  END_ACTIVE_DATE    DATETIME2     NULL," +
                "  DEPT_CD            VARCHAR(10)   NULL," +
                "  USER_CATEGORY_CD   VARCHAR(10)   NULL," +
                "  USE_TP             VARCHAR(1)    NULL," +
                "  EMAIL              VARCHAR(30)   NULL," +
                "  TEL_NO             VARCHAR(15)   NULL," +
                "  MOBILE_TEL_NO      VARCHAR(15)   NULL," +
                "  IN_OUT_EMP_TP      VARCHAR(1)    NULL," +
                "  GROUP_ID1          VARCHAR(50)   NULL," +
                "  GROUP_ID2          VARCHAR(50)   NULL," +
                "  GROUP_ID3          VARCHAR(50)   NULL," +
                "  THEME_TP           VARCHAR(20)   NULL," +
                "  MENU_TP            VARCHAR(1)    NULL," +
                "  BOTTOM_MSG_YN      VARCHAR(1)    NULL," +
                "  EXCEL_TP           VARCHAR(1)    NULL," +
                "  PWD_FAIL_COUNT     BIGINT        NULL," +
                // audit 9 — McmAuditEntity 정합
                "  C_USR_ID           VARCHAR(100)  NULL," +
                "  C_AT               DATETIME2     NULL," +
                "  C_SVC_ID           VARCHAR(100)  NULL," +
                "  C_PGM_ID           VARCHAR(100)  NULL," +
                "  U_USR_ID           VARCHAR(100)  NULL," +
                "  U_AT               DATETIME2     NULL," +
                "  U_SVC_ID           VARCHAR(100)  NULL," +
                "  U_PGM_ID           VARCHAR(100)  NULL," +
                "  VER                BIGINT        NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER PRIMARY KEY (USER_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER (owner / 본 21 + audit 9)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_USER_MAPPING} 을 W5 owner 로 upgrade.
     * W4 stub (USER_ID/ROLE_GROUP_ID 2 컬럼 + PK 2 복합) 이 존재하면 audit 9 ADD 만 (PK 변경 ✗ / 정책 #15).
     * 테이블 자체가 없으면 full DDL 신규.
     */
    private void upgradeTbMcmSecUserMappingToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING")) {
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_MAPPING (" +
                    "  USER_ID       VARCHAR(100) NOT NULL," +
                    "  ROLE_GROUP_ID VARCHAR(30)  NOT NULL," +
                    "  C_USR_ID      VARCHAR(100) NULL," +
                    "  C_AT          DATETIME2    NULL," +
                    "  C_SVC_ID      VARCHAR(100) NULL," +
                    "  C_PGM_ID      VARCHAR(100) NULL," +
                    "  U_USR_ID      VARCHAR(100) NULL," +
                    "  U_AT          DATETIME2    NULL," +
                    "  U_SVC_ID      VARCHAR(100) NULL," +
                    "  U_PGM_ID      VARCHAR(100) NULL," +
                    "  VER           BIGINT       NULL," +
                    "  CONSTRAINT PK_TB_MCM_SEC_USER_MAPPING PRIMARY KEY (USER_ID, ROLE_GROUP_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_MAPPING (full owner / PK 2 + audit 9)");
            return;
        }
        // W4 stub 호환 — PK 동일 (변경 ✗) + audit 9 ADD (멱등 / 정책 #15)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "C_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "C_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "C_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "C_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "U_USR_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "U_AT",      "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "U_SVC_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "U_PGM_ID",  "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_USER_MAPPING", "VER",       "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_USER_MAPPING (W4 stub → W5 owner / PK 2 보존 + audit 9 ADD)");
    }

    /** {@code MCMAPUSER.TB_MCM_SEC_USER_PWD} — 본 7 컬럼 + audit 9 (mergeCommonPwdInit / updateCommonSSOPwdInit). */
    private void createTbMcmSecUserPwdIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER_PWD")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_PWD (" +
                "  USER_ID                  VARCHAR(30)  NOT NULL," +
                "  USER_ENC_PWD             VARCHAR(100) NULL," +
                "  SALT                     VARCHAR(100) NULL," +
                "  LAST_PWD_CHNG_DATE       DATETIME2    NULL," +
                "  USER_SSO_PWD             VARCHAR(100) NULL," +
                "  USER_ENC_TEMP_PWD        VARCHAR(100) NULL," +
                "  TEMP_PWD_EXPIRATION_DATE DATETIME2    NULL," +
                "  C_USR_ID                 VARCHAR(100) NULL," +
                "  C_AT                     DATETIME2    NULL," +
                "  C_SVC_ID                 VARCHAR(100) NULL," +
                "  C_PGM_ID                 VARCHAR(100) NULL," +
                "  U_USR_ID                 VARCHAR(100) NULL," +
                "  U_AT                     DATETIME2    NULL," +
                "  U_SVC_ID                 VARCHAR(100) NULL," +
                "  U_PGM_ID                 VARCHAR(100) NULL," +
                "  VER                      BIGINT       NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER_PWD PRIMARY KEY (USER_ID)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_PWD (owner / 본 7 + audit 9)");
    }

    /** {@code MCMAPUSER.TB_MCM_SEC_USER_HIS} — 본 7 + PK 2 복합 (USER_ID, ACTIVE_DT) + audit 9. 정책 #3 (C) 흡수. */
    private void createTbMcmSecUserHisIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER_HIS")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_HIS (" +
                "  USER_ID     VARCHAR(30)  NOT NULL," +
                "  ACTIVE_DT   VARCHAR(8)   NOT NULL," +
                "  PROC_TYPE   VARCHAR(1)   NULL," +
                "  PROC_CASE   VARCHAR(1)   NULL," +
                "  USER_NM     VARCHAR(30)  NULL," +
                "  INF_REQ_NO  VARCHAR(100) NULL," +
                "  DESCRIPTION VARCHAR(300) NULL," +
                "  C_USR_ID    VARCHAR(100) NULL," +
                "  C_AT        DATETIME2    NULL," +
                "  C_SVC_ID    VARCHAR(100) NULL," +
                "  C_PGM_ID    VARCHAR(100) NULL," +
                "  U_USR_ID    VARCHAR(100) NULL," +
                "  U_AT        DATETIME2    NULL," +
                "  U_SVC_ID    VARCHAR(100) NULL," +
                "  U_PGM_ID    VARCHAR(100) NULL," +
                "  VER         BIGINT       NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER_HIS PRIMARY KEY (USER_ID, ACTIVE_DT)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_HIS (owner / 본 7 + PK 2 + audit 9)");
    }

    /** {@code MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS} — 본 8 + PK 5 복합 + audit 9. 정책 #3 (C) 흡수. */
    private void createTbMcmSecUserRollHisIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_SEC_USER_ROLL_HIS")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS (" +
                "  OP_SUMUP_DT   VARCHAR(8)   NOT NULL," +
                "  WORKS_CODE    VARCHAR(1)   NOT NULL," +
                "  USER_ID       VARCHAR(30)  NOT NULL," +
                "  ROLE_GROUP_ID VARCHAR(30)  NOT NULL," +
                "  RESP_GBN      VARCHAR(1)   NOT NULL," +
                "  ROLE_GROUP_NM VARCHAR(100) NULL," +
                "  INF_REQ_NO    VARCHAR(100) NULL," +
                "  DESCRIPTION   VARCHAR(300) NULL," +
                "  C_USR_ID      VARCHAR(100) NULL," +
                "  C_AT          DATETIME2    NULL," +
                "  C_SVC_ID      VARCHAR(100) NULL," +
                "  C_PGM_ID      VARCHAR(100) NULL," +
                "  U_USR_ID      VARCHAR(100) NULL," +
                "  U_AT          DATETIME2    NULL," +
                "  U_SVC_ID      VARCHAR(100) NULL," +
                "  U_PGM_ID      VARCHAR(100) NULL," +
                "  VER           BIGINT       NULL," +
                "  CONSTRAINT PK_TB_MCM_SEC_USER_ROLL_HIS PRIMARY KEY " +
                "    (OP_SUMUP_DT, WORKS_CODE, USER_ID, ROLE_GROUP_ID, RESP_GBN)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS (owner / 본 8 + PK 5 + audit 9)");
    }

    /** {@code MCMAPUSER.TB_MCM_DEPT_INFO} — 본 7 + audit 9. 정책 #2 / Q-002 — EAI 폐기 + DMES 자체 부서 마스터 신설. */
    private void createTbMcmDeptInfoIfAbsent() {
        if (tableExists("MCMAPUSER", "TB_MCM_DEPT_INFO")) {
            return;
        }
        nq(
                "CREATE TABLE MCMAPUSER.TB_MCM_DEPT_INFO (" +
                "  DEPT_CD           VARCHAR(10)  NOT NULL," +
                "  DEPT_NM           VARCHAR(100) NULL," +
                "  DEPT_NM_EN        VARCHAR(100) NULL," +
                "  UPPER_DEPT_CD     VARCHAR(10)  NULL," +
                "  USE_TP            VARCHAR(1)   NULL," +
                "  START_ACTIVE_DATE DATETIME2    NULL," +
                "  END_ACTIVE_DATE   DATETIME2    NULL," +
                "  C_USR_ID          VARCHAR(100) NULL," +
                "  C_AT              DATETIME2    NULL," +
                "  C_SVC_ID          VARCHAR(100) NULL," +
                "  C_PGM_ID          VARCHAR(100) NULL," +
                "  U_USR_ID          VARCHAR(100) NULL," +
                "  U_AT              DATETIME2    NULL," +
                "  U_SVC_ID          VARCHAR(100) NULL," +
                "  U_PGM_ID          VARCHAR(100) NULL," +
                "  VER               BIGINT       NULL," +
                "  CONSTRAINT PK_TB_MCM_DEPT_INFO PRIMARY KEY (DEPT_CD)" +
                ")")
                .executeUpdate();
        log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_DEPT_INFO (owner / 본 7 + audit 9)");
    }

    /** MSSQL {@code sys.columns} 로 schema + table + column 존재 여부 확인. */
    private boolean columnExists(String schema, String table, String column) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.columns "
                + "WHERE object_id = OBJECT_ID(:fqn) AND name = :col")
                .setParameter("fqn", schema + "." + table)
                .setParameter("col", column)
                .getSingleResult();
        return cnt != null && cnt.intValue() > 0;
    }

    /** MSSQL — PK 제약이 있으면 DROP (멱등). 이름 기반 매칭. */
    private void dropPkIfExists(String schema, String table, String pkName) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM sys.objects "
                + "WHERE name = :pk AND type = 'PK' "
                + "  AND parent_object_id = OBJECT_ID(:fqn)")
                .setParameter("pk", pkName)
                .setParameter("fqn", schema + "." + table)
                .getSingleResult();
        if (cnt == null || cnt.intValue() == 0) return;
        nq(
                "ALTER TABLE " + schema + "." + table + " DROP CONSTRAINT " + pkName)
                .executeUpdate();
        log.info("[DataInitializer] DROP CONSTRAINT: {}.{}.{}", schema, table, pkName);
    }

    // ────────────────────────────────────────────────────────────────
    // W6 commPermMng — schema artifacts (owner 1 테이블 / W3 stub → full owner)
    // ────────────────────────────────────────────────────────────────

    /**
     * MCM csa commPermMng schema artifacts — 멱등 적재 (2026-06-01 worker W6).
     *
     * <p>본 화면 owner 1 테이블:
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_PERM} — entity {@link com.dongkuk.dmes.mcm.entity.SecPerm} 정합.
     *       <ul>
     *         <li>W3 stub (PERMISSION_ID(PK) + PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM /
     *             POPUP_BTN / USE_TP — 6 컬럼 + PK 1) 이 존재 → PK 그대로 보존 (W6 entity PK 와 동일).
     *             누락 본 4 컬럼 (PERMISSION_DESC / PERMISSION_ACTION / START_ACTIVE_DATE / END_ACTIVE_DATE)
     *             + BIZ_SYSTEM_CODE (legacy 보존 — cross-cutting 정책 #1 entity 미반영 / DDL 잔존) + audit 9 컬럼
     *             ALTER ADD (멱등).</li>
     *         <li>W3 stub 미존재 시 → full DDL 신규 생성 (본 10 + BIZ_SYSTEM_CODE legacy + audit 9 = 20 컬럼).</li>
     *       </ul></li>
     * </ul>
     *
     * <p>본 화면이 사용하지만 다른 화면이 owner 인 테이블 (재생성 ✗, 기존 owner DDL 재사용):
     * <ul>
     *   <li>{@code TB_MCM_SEC_ROLE_MAPPING} (W3 owner) — read-only EXISTS 검증
     *       (deleteCommPermMng NOT EXISTS xml:91~95 + selectCommPermMng scalar subquery ROLE_ID xml:19~22)</li>
     * </ul>
     *
     * <p>모든 DDL 은 MSSQL {@code IF NOT EXISTS} 멱등. hibernate ddl-auto=update 가 SecPerm entity 로
     * 자동 ALTER 시 본 메서드와 동일 결과 — 본 메서드는 ddl-auto 무관 보장.
     */
    private void initMcmCsaCommPermMngArtifacts() {
        ensureSchemaMcmapuser();
        upgradeTbMcmSecPermToFullOwner();
        log.info("[DataInitializer] MCM csa commPermMng schema artifacts 멱등 적재 완료 "
               + "(MCMAPUSER.TB_MCM_SEC_PERM W3 stub → W6 full owner / PK 보존 + 본 4 + BIZ_SYSTEM_CODE legacy + audit 9 ADD)");
    }

    /**
     * {@code MCMAPUSER.TB_MCM_SEC_PERM} 를 W6 owner (본 10 컬럼 + BIZ_SYSTEM_CODE legacy + audit 9) 로 보장.
     * <p>W3 stub (PERMISSION_ID(PK) + 5 컬럼) 이 존재하면 PK 동일 (변경 ✗) — 누락 컬럼만 ALTER ADD.
     * <p>테이블 자체가 없으면 full DDL 로 신규 생성.
     *
     * <p>분석리포트 §9.3.1 (DMES SEC_PERM 시트 29 컬럼) 중 To-Be 채택 10 컬럼 + BIZ_SYSTEM_CODE legacy
     * (cross-cutting 정책 #1 — entity 미반영 / DDL 잔존) + audit 9. PERMISSION_GROUP 은 As-Is mui Mapper
     * 미사용 → DDL 미반영.
     */
    private void upgradeTbMcmSecPermToFullOwner() {
        if (!tableExists("MCMAPUSER", "TB_MCM_SEC_PERM")) {
            // 신규 생성 — full DDL (본 10 + BIZ_SYSTEM_CODE legacy + audit 9)
            nq(
                    "CREATE TABLE MCMAPUSER.TB_MCM_SEC_PERM (" +
                    "  PERMISSION_ID     VARCHAR(100)  NOT NULL," +
                    "  PERMISSION_NM     VARCHAR(100)  NULL," +
                    "  PERMISSION_DESC   VARCHAR(300)  NULL," +
                    "  PERMISSION_COMMON VARCHAR(500)  NULL," +
                    "  PERMISSION_CUSTOM VARCHAR(500)  NULL," +
                    "  POPUP_BTN         VARCHAR(1000) NULL," +
                    "  PERMISSION_ACTION VARCHAR(2000) NULL," + // 2026-07-30 500→2000 확장 (entity SecPerm length=2000 정합 — 액션 토큰 포화 해소)
                    "  BIZ_SYSTEM_CODE   VARCHAR(10)   NULL," + // To-Be 정책 #1 — entity 미반영 / DDL 잔존
                    "  USE_TP            VARCHAR(1)    NULL," +
                    "  START_ACTIVE_DATE DATETIME2     NULL," +
                    "  END_ACTIVE_DATE   DATETIME2     NULL," +
                    // audit 9 — McmAuditEntity 정합 (W1~W5 동일)
                    "  C_USR_ID          VARCHAR(100)  NULL," +
                    "  C_AT              DATETIME2     NULL," +
                    "  C_SVC_ID          VARCHAR(100)  NULL," +
                    "  C_PGM_ID          VARCHAR(100)  NULL," +
                    "  U_USR_ID          VARCHAR(100)  NULL," +
                    "  U_AT              DATETIME2     NULL," +
                    "  U_SVC_ID          VARCHAR(100)  NULL," +
                    "  U_PGM_ID          VARCHAR(100)  NULL," +
                    "  VER               BIGINT        NULL," +
                    "  CONSTRAINT PK_TB_MCM_SEC_PERM PRIMARY KEY (PERMISSION_ID)" +
                    ")")
                    .executeUpdate();
            log.info("[DataInitializer] CREATE TABLE: MCMAPUSER.TB_MCM_SEC_PERM (full owner / 본 10 + BIZ_SYSTEM_CODE legacy + audit 9)");
            return;
        }
        // W3 stub 호환 — PK 동일 (변경 ✗) / 누락 본 4 컬럼 + BIZ_SYSTEM_CODE legacy + audit 9 ADD (멱등)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "PERMISSION_DESC",   "VARCHAR(300)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "PERMISSION_ACTION", "VARCHAR(500)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "BIZ_SYSTEM_CODE",   "VARCHAR(10)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "START_ACTIVE_DATE", "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "END_ACTIVE_DATE",   "DATETIME2");
        // audit 9 ADD (멱등)
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "C_USR_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "C_AT",     "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "C_SVC_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "C_PGM_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "U_USR_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "U_AT",     "DATETIME2");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "U_SVC_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "U_PGM_ID", "VARCHAR(100)");
        addColumnIfAbsent("MCMAPUSER", "TB_MCM_SEC_PERM", "VER",      "BIGINT");
        log.info("[DataInitializer] ALTER TABLE: MCMAPUSER.TB_MCM_SEC_PERM (W3 stub → W6 owner / PK 보존 + 본 4 + BIZ_SYSTEM_CODE legacy + audit 9 ADD)");
    }

    // ────────────────────────────────────────────────────────────────
    // W7 commUserRoleCopy — schema artifacts (신규 owner 없음 — W4/W5 owner 재사용 가드)
    // ────────────────────────────────────────────────────────────────

    /**
     * MCM csa commUserRoleCopy schema artifacts — 멱등 보장 (2026-06-01 worker W7).
     *
     * <p>본 화면은 자체 owner 테이블 ✗ — 모두 기존 W4/W5 owner 재사용 (정책 #11):
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_USER}          — W5 owner (commUserMng) / read-only</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_USER_MAPPING}  — W5 owner / read + write (SecUserMapping save)</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP}     — W4 owner (commRoleGrpMng) / read-only scalar subquery</li>
     *   <li>{@code MCMAPUSER.TB_MCM_SEC_USER_ROLL_HIS} — W5 owner / write (SecUserRollHis save / 정책 #6)</li>
     *   <li>{@code MCMAPUSER.TB_MCM_DEPT_INFO}         — W5 owner / read-only JOIN (정책 #2 Q-004)</li>
     * </ul>
     *
     * <p>W5 의 {@link #initMcmCsaCommUserMngArtifacts()} 가 run() 체인의 앞단에서 IF NOT EXISTS 멱등으로
     * 5 owner 테이블 모두 보장 → 본 메서드는 명시적 DDL ✗ + 진입 로그만 남긴다.
     *
     * <p>본 worker 가 W5 보다 먼저 호출되거나 W5 가 제거된 경우 (이론적 — 본 cycle 미발생) 본 메서드가
     * W5 보장을 우회 호출할 책임이 있다. 현 cycle 에서는 run() 순서 (W1 → W2 → W3 → W4 → W5 → W6 → W7)
     * 가 명시 보장되므로 skeleton 로그로 충분.
     */
    private void initMcmCsaCommUserRoleCopyArtifacts() {
        log.info("[DataInitializer] MCM csa commUserRoleCopy schema artifacts — 자체 owner ✗ "
               + "(W4 TB_MCM_SEC_ROLEGROUP + W5 TB_MCM_SEC_USER / TB_MCM_SEC_USER_MAPPING / "
               + "TB_MCM_SEC_USER_ROLL_HIS / TB_MCM_DEPT_INFO 재사용 — 정책 #11)");
    }

    // ────────────────────────────────────────────────────────────────
    // W8 commSyncMng — schema artifacts (MCM_BACKUP TARGET schema 빈 복제)
    // ────────────────────────────────────────────────────────────────

    /**
     * MCM csa commSyncMng schema artifacts — 멱등 적재 (2026-06-01 worker W8).
     *
     * <p>본 화면은 자체 owner 테이블 ✗ — cma 4 화면 (masterCodeMng) entity 재사용
     * (com.dongkuk.dmes.mcm.entity.TbMcmCode{Master|Category|Detail} — 정책 #6 (A) / Q-007 해소).
     *
     * <p>적재 대상 (멱등 — schema 별 SELECT INTO ... WHERE 1=0 빈 구조 복제):
     * <ul>
     *   <li>{@code MCMAPUSER.TB_MCM_CODE_MASTER / _CATEGORY / _DETAIL} — 이미 cma 의
     *       {@link #initMcmCmaSyncSchemaArtifacts()} 가 적재 (멱등 skip)</li>
     *   <li>{@code MCM_BACKUP.TB_MCM_CODE_MASTER} — 본 worker 가 신규 적재 (MA2 분기 대상 schema)</li>
     *   <li>{@code MCM_BACKUP.TB_MCM_CODE_CATEGORY} — 본 worker 가 신규 적재</li>
     *   <li>{@code MCM_BACKUP.TB_MCM_CODE_DETAIL} — 미적재 (As-Is java:115 백업 제외 정책 — Q-001 해소)</li>
     * </ul>
     *
     * <p>MCM_BACKUP schema 가 없으면 신규 생성. MSSQL 은 SELECT INTO 가 PK / index / DEFAULT 를
     * 복제하지 않으므로 audit 컬럼만 따라가는 read-only 백업 구조. 동기화 운영상 read 만 필요.
     *
     * <p>To-Be 정책 (분석 §11.0 / Q-001~Q-010 해소 2026-05-31):
     * <ul>
     *   <li>Q-001 — 본 화면 책임 = MASTER 3 테이블만 (RULE/RULE_JUDGE/INTERFACE/FORMAT/OBJECT 후속 위임)</li>
     *   <li>Q-002 — Oracle DB Link 폐기 → 단일 MSSQL 단일 업무 DB</li>
     *   <li>Q-005 — LOC 분기 유일화 (PRD No-op)</li>
     *   <li>Q-008 — INSERT INTO ... SELECT * 직후 audit UPDATE</li>
     * </ul>
     */
    private void initMcmCsaCommSyncMngArtifacts() {
        ensureSchemaMcmBackup();
        // MA2 분기 대상 — MCM_BACKUP.TB_MCM_CODE_MASTER + _CATEGORY 빈 복제
        // (DETAIL 은 As-Is java:115 백업 제외 정책으로 미적재 — Q-001 해소)
        copyEmptyTableIfAbsent("MCM_BACKUP", "TB_MCM_CODE_MASTER",   "MCM_SOURCE");
        copyEmptyTableIfAbsent("MCM_BACKUP", "TB_MCM_CODE_CATEGORY", "MCM_SOURCE");
        log.info("[DataInitializer] MCM csa commSyncMng schema artifacts 멱등 적재 완료 "
               + "(MCM_BACKUP.TB_MCM_CODE_MASTER + _CATEGORY 빈 복제 / DETAIL 백업 제외 — Q-001)");
    }

    /** {@code MCM_BACKUP} schema 가 없으면 생성 (MSSQL — ensureSchemaMcmapuser 동일 패턴). */
    private void ensureSchemaMcmBackup() {
        nq(
                "IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'MCM_BACKUP') "
                + "EXEC('CREATE SCHEMA MCM_BACKUP')")
                .executeUpdate();
    }
}
