package com.dongkuk.dmes.mcm.init.seed;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 시드·스키마 단계가 함께 쓰는 SQL 헬퍼와 실행 문맥 (2026-10-04 DataInitializer 분할).
 *
 * <p>스프링 빈이 아니다. {@code DataInitializer.run()} 이 방언을 판정한 뒤 한 번 만들어 각 단계 클래스에 넘긴다.
 * 단계 클래스는 이 클래스를 상속해 {@code nq}·{@code insertIfAbsent} 같은 헬퍼를 원래 이름 그대로 부른다.
 * 트랜잭션 경계는 {@code DataInitializer.run()} 의 {@code @Transactional} 하나뿐이다.
 */
public class SeedSupport {

    /** 로그 범주는 분할 전과 같은 {@code DataInitializer} 로 둔다 (로그 설정·검색 호환). */
    protected static final Logger log = LoggerFactory.getLogger("com.dongkuk.dmes.mcm.init.DataInitializer");

    // ── 공통 audit 9 컬럼 fragment (모든 seed INSERT 동일 — McmAuditEntity 정합) ──
    // 사용 패턴: 컬럼 list 에 AUDIT_COLS 추가 + VALUES 에 AUDIT_VALS 추가.
    // C_USR_ID='admin' / C_AT=SYSDATETIME() / C_SVC_ID='DataInitializer' / C_PGM_ID='DataInitializer' /
    // U_USR_ID='admin' / U_AT=SYSDATETIME() / U_SVC_ID='DataInitializer' / U_PGM_ID='DataInitializer' / VER=0
    // 분할 전에는 같은 값을 메서드마다 지역 상수로 25번 반복했다.
    protected static final String AUDIT_COLS = ", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";
    protected static final String AUDIT_VALS = ", 'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', "
                                             + "'admin', SYSDATETIME(), 'DataInitializer', 'DataInitializer', 0";

    // mcm default EMF 의 EntityManager — DataInitializer 가 @PersistenceContext(unitName="default") 로 받은 것.
    protected final EntityManager entityManager;

    // 런타임 DB 방언 — SQLite(개발자 Mac local 단독 부팅) 여부. DataInitializer.run() 초입에서 1회 감지한 값.
    protected final boolean sqliteDialect;

    public SeedSupport(EntityManager entityManager, boolean sqliteDialect) {
        this.entityManager = entityManager;
        this.sqliteDialect = sqliteDialect;
    }

    /** 단계 클래스가 같은 문맥을 물려받을 때 쓴다. */
    protected SeedSupport(SeedSupport support) {
        this(support.entityManager, support.sqliteDialect);
    }

    /**
     * 모듈 무관 범용 폴더 INSERT 헬퍼(이름의 Mpn 은 legacy).
     *
     * <p>TB_MCM_SEC_MENU_FLD 폴더 1행 멱등 INSERT — FULL_SEQ/USE_TP/MENU_VIEW_YN 명시 (첫 부팅 트리 표시 보장).
     *
     * <p>MENU_VIEW_YN 은 'Y'(사이드바 표시). 숨김 폴더가 필요하면
     * {@link #insertMpnFld(String, String, String, String, long, String)} 오버로드를 쓴다.
     */
    protected void insertMpnFld(String menuId, String menuSeq, String menuNm, String parent, long fullSeq) {
        insertMpnFld(menuId, menuSeq, menuNm, parent, fullSeq, "Y");
    }

    /**
     * 모듈 무관 범용 폴더 INSERT 헬퍼(이름의 Mpn 은 legacy).
     *
     * <p>TB_MCM_SEC_MENU_FLD 폴더 1행 멱등 INSERT — 사이드바 표시 여부까지 지정하는 오버로드 (2026-08-12).
     *
     * <p>팝업 전용 그룹(예: mpp {@code ppz})처럼 "메뉴관리 화면에는 보이되 사이드바에는 뜨지 않아야 하는"
     * 폴더를 시드하려면 {@code viewYn='N'} 을 넘긴다. 기존 호출부(수십 곳)를 건드리지 않도록 5-인자
     * 시그니처는 그대로 두고 'Y' 로 위임한다.
     *
     * @param viewYn MENU_VIEW_YN — 'Y'(표시) / 'N'(숨김). 그 외 값은 {@link #normalizeViewYn(String)} 이
     *               'Y' 로 폴백한다(시드 오타로 트리가 통째로 사라지는 것보다 표시 쪽이 안전하다).
     */
    protected void insertMpnFld(String menuId, String menuSeq, String menuNm, String parent, long fullSeq, String viewYn) {
        String parentLit = (parent == null) ? "NULL" : "'" + escapeSql(parent) + "'";
        String viewLit = normalizeViewYn(viewYn);
        insertIfAbsent(
                "TB_MCM_SEC_MENU_FLD", "MENU_ID", menuId,
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, FULL_SEQ, USE_TP, MENU_VIEW_YN) " +
                "VALUES ('" + escapeSql(menuId) + "', '" + escapeSql(menuSeq) + "', N'" + escapeSql(menuNm) + "', " +
                parentLit + ", " + fullSeq + ", 'Y', '" + viewLit + "')");
    }

    /**
     * MENU_VIEW_YN 값 정규화 — 'Y'/'N' 만 허용하고 그 외(null·공백·오타)는 'Y' 로 폴백한다 (2026-08-12).
     *
     * <p><b>예외가 아니라 폴백인 이유</b>: 본 컬럼은 VARCHAR(1) 이고 Hibernate 6 가 length=1 VARCHAR 를
     * {@code Character} 로 추론하므로 잘못된 값이 들어가면 {@code normalizeSecMenuCharColumns()} 의
     * 자가치유 대상이 되거나 commMenuMng 조회가 통째로 실패한다. 반대로 시드 오타 하나로 부팅이 죽으면
     * (IllegalStateException) 그 DB 는 아예 못 쓰게 된다. "잘못 숨겨서 메뉴가 사라지는" 쪽보다
     * "표시되는" 쪽이 복구 가능하므로 표시('Y')로 폴백한다. 대소문자는 허용해 대문자로 승격한다.
     */
    protected static String normalizeViewYn(String viewYn) {
        if (viewYn == null) return "Y";
        String v = viewYn.trim().toUpperCase(java.util.Locale.ROOT);
        return ("Y".equals(v) || "N".equals(v)) ? v : "Y";
    }

    /**
     * TB_MCM_SEC_MENU 멱등 INSERT — 복합 PK (MENU_ID, MENU_SEQ) 기준 존재 시 skip.
     *
     * <p>모든 행 공통값:
     * <ul>
     *   <li>MENU_TP = 'WEB'</li>
     *   <li>USE_TP = 'Y'</li>
     *   <li>MENU_VIEW_YN = 'Y' (숨김 leaf 는 7-인자 오버로드로 'N' 지정)</li>
     *   <li>START_ACTIVE_DATE = SYSDATETIME()</li>
     *   <li>END_ACTIVE_DATE = '9999-12-31 23:59:59'</li>
     *   <li>audit 9 컬럼 = 'admin' / SYSDATETIME() / 'DataInitializer' / 'DataInitializer' / ... / 0</li>
     * </ul>
     *
     * @param menuId       MENU_ID (PK#1) — VARCHAR(30)
     * @param menuSeq      MENU_SEQ (PK#2) — VARCHAR(30). 모든 seed = "001".
     * @param fullSeq      FULL_SEQ — VARCHAR 사전순 정렬 (예: 100/110/120 ... 200/210/220 ... 300/310)
     * @param menuNm       MENU_NM (한글) — N'...' literal 로 래핑
     * @param parentMenuId PARENT_MENU_ID — root 그룹은 null
     * @param objectId     OBJECT_ID — 화면식별자 (TB_MCM_SEC_OBJ FK). root 그룹은 null
     */
    protected void insertMcmSecMenuIfAbsent(String menuId, String menuSeq, String fullSeq,
                                          String menuNm, String parentMenuId, String objectId) {
        insertMcmSecMenuIfAbsent(menuId, menuSeq, fullSeq, menuNm, parentMenuId, objectId, "Y");
    }

    /**
     * TB_MCM_SEC_MENU 멱등 INSERT — 사이드바 표시 여부까지 지정하는 오버로드 (2026-08-12).
     *
     * <p><b>왜 필요한가</b> — 팝업(모달)도 메뉴 leaf 로 등재하는 정책으로 바뀌었다. leaf 가 있어야
     * ① 팝업 단위 RBAC 를 메뉴/역할 화면에서 화면과 똑같이 다룰 수 있고 ② commMenuMng 에서 순서·명칭을
     * 관리할 수 있다. 다만 팝업은 부모 화면에서 열리므로 <b>사이드바에는 뜨면 안 된다</b> →
     * {@code MENU_VIEW_YN='N'}. 6-인자 시그니처는 기존 호출부(수십 곳) 보존용으로 'Y' 에 위임한다.
     *
     * @param viewYn MENU_VIEW_YN — 'Y'(사이드바 표시) / 'N'(숨김, 팝업 leaf).
     *               그 외 값은 {@link #normalizeViewYn(String)} 이 'Y' 로 폴백한다.
     */
    protected void insertMcmSecMenuIfAbsent(String menuId, String menuSeq, String fullSeq,
                                          String menuNm, String parentMenuId, String objectId,
                                          String viewYn) {
        // 2026-06-05 Phase 1 — OBJECT_ID camelCase 룰 강제 (reference_naming_standards §A.3.1).
        //   FE 의 page-components/{group}/{OBJECT_ID}/page.tsx 폴더명과 1:1 일치해야 동적 import 가 성공한다.
        //   PascalCase / snake_case / 빈 문자열 / 하이픈 포함 등은 모두 시드 단계에서 차단 (런타임 fail 회피).
        //   null 은 허용 (root 그룹 폴더 — TB_MCM_SEC_MENU_FLD 가 owner 라 본 메서드 호출 시 null 입력 가능).
        if (objectId != null && !objectId.matches("^[a-z][a-zA-Z0-9]*$")) {
            throw new IllegalStateException(
                    "OBJECT_ID camelCase 룰 위반 — menuId=" + menuId + " objectId='" + objectId +
                    "'. 허용 패턴: ^[a-z][a-zA-Z0-9]*$ (소문자 시작 + 영숫자만)");
        }

        String parentLit = (parentMenuId == null) ? "NULL" : "'" + escapeSql(parentMenuId) + "'";
        String objectLit = (objectId == null)     ? "NULL" : "'" + escapeSql(objectId) + "'";
        String viewLit = normalizeViewYn(viewYn);
        // 2026-06-05 — MENU_SEQ '0' LPAD 8자리 ("001" → "00000001"). 비숫자는 그대로.
        String seq8 = (menuSeq != null && menuSeq.matches("\\d{1,8}"))
                ? String.format("%08d", Long.parseLong(menuSeq)) : menuSeq;

        // 2026-06-05 — PK = MENU_ID 단독. 존재 체크도 MENU_ID 기준 (멱등).
        insertIfAbsent(
                "TB_MCM_SEC_MENU", "MENU_ID", menuId,
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU " +
                "(MENU_ID, MENU_SEQ, FULL_SEQ, MENU_NM, MENU_TP, OBJECT_ID, USE_TP, " +
                " START_ACTIVE_DATE, END_ACTIVE_DATE, MENU_VIEW_YN, PARENT_MENU_ID" + AUDIT_COLS + ") " +
                "VALUES ('" + escapeSql(menuId) + "', '" + escapeSql(seq8) + "', '" + escapeSql(fullSeq) + "', " +
                "N'" + escapeSql(menuNm) + "', 'WEB', " + objectLit + ", 'Y', " +
                "SYSDATETIME(), '9999-12-31 23:59:59', '" + viewLit + "', " + parentLit + AUDIT_VALS + ")");
    }

    /**
     * 이미 존재하는 메뉴 leaf 행의 {@code MENU_VIEW_YN} 을 목표값으로 강제 정정한다 (2026-08-12).
     *
     * <p><b>왜 필요한가</b> — {@link #insertIfAbsent}/{@link #insertMcmSecMenuIfAbsent} 는 대상 행이
     * 이미 있으면 skip 하고 <b>갱신하지 않는다</b>. 그래서 시드 리터럴만 'N' 으로 바꿔봐야 이미 시드된
     * 개발 MSSQL·동료 SQLite 에서는 값이 영원히 'Y' 로 남는다({@link #fixModuleRootMenuSeqOrder} ·
     * {@link #ensurePermAllActions} 와 같은 계열의 백필 보정).
     *
     * <p>값이 이미 목표와 같으면 UPDATE 영향 0 (멱등 · 신규 클린 DB 무영향). 사용자가 commMenuMng 에서
     * 표시 여부를 편집할 수 있는 값이므로 <b>대상 menuId 를 명시한 것만</b> 정정한다 — 일괄 정정 금지.
     *
     * <p>SQLite 에서는 McmAuditStatementInspector 가 {@code MCMAPUSER.} schema 접두를 제거하므로 동일 SQL 로 동작.
     *
     * @param menuId TB_MCM_SEC_MENU.MENU_ID (leaf). 없는 행이면 0 행 (무해).
     * @param viewYn 목표 MENU_VIEW_YN — 'Y'/'N'. 그 외는 {@link #normalizeViewYn} 이 'Y' 로 폴백.
     * @return UPDATE 영향 행 수 (0 또는 1)
     */
    protected int ensureMenuViewYn(String menuId, String viewYn) {
        return ensureMenuViewYnOn("TB_MCM_SEC_MENU", menuId, viewYn);
    }

    /**
     * 이미 존재하는 <b>폴더</b>({@code TB_MCM_SEC_MENU_FLD}) 행의 {@code MENU_VIEW_YN} 을 정정한다 (2026-08-12).
     *
     * <p>leaf 판은 {@link #ensureMenuViewYn(String, String)}. 팝업 전용 그룹 폴더(예: mpp {@code ppz})를
     * 사이드바에서 숨길 때 쓴다 — 폴더가 'Y' 로 남아 있으면 자식이 전부 숨겨져도 빈 그룹이 노출된다.
     *
     * @see #ensureMenuViewYn(String, String)
     */
    protected int ensureMenuFldViewYn(String menuId, String viewYn) {
        return ensureMenuViewYnOn("TB_MCM_SEC_MENU_FLD", menuId, viewYn);
    }

    /**
     * 이미 존재하는 메뉴 leaf 행의 {@code PARENT_MENU_ID} 를 목표 그룹으로 강제 정정한다 (2026-08-13).
     *
     * <p><b>왜 필요한가</b> — {@link #ensureMenuViewYn(String, String)} 과 같은 계열의 백필이다.
     * {@link #insertMcmSecMenuIfAbsent}는 대상 행이 이미 있으면 skip 하고 <b>갱신하지 않는다</b>. 그래서
     * 화면/팝업의 소속 그룹을 바꿔도 시드 리터럴만 고쳐서는 이미 시드된 개발 MSSQL·동료 SQLite 에서
     * 부모가 옛 그룹으로 영원히 남는다. 최초 사용처 = mcm 팝업 5종의 {@code cma}/{@code cmb} → {@code cmz}
     * (팝업 전용 그룹) 이관.
     *
     * <p>값이 이미 목표와 같으면 {@code WHERE ... <> :p} 가드로 UPDATE 영향 0 (멱등 · 신규 클린 DB 무영향
     * — {@link #fixModuleRootMenuSeqOrder()} 와 동일한 가드 방식). 메뉴 트리 소속은 제품 구조 정책이므로
     * <b>대상 menuId 를 명시한 것만</b> 정정한다.
     *
     * <p><b>주의</b> — {@link #applyR3FullSeqEncoding()} 도 자기 배열의 행에 대해 PARENT_MENU_ID 를
     * 무조건 덮어쓴다. 두 곳의 목표 부모가 어긋나면 부팅마다 값이 왕복하므로 반드시 함께 고쳐야 한다.
     *
     * <p>SQLite 에서는 McmAuditStatementInspector 가 {@code MCMAPUSER.} schema 접두를 제거하므로 동일 SQL 로 동작.
     *
     * @param menuId       TB_MCM_SEC_MENU.MENU_ID (leaf). 없는 행이면 0 행 (무해).
     * @param parentMenuId 목표 PARENT_MENU_ID — TB_MCM_SEC_MENU_FLD.MENU_ID (그룹 폴더).
     * @return UPDATE 영향 행 수 (0 또는 1)
     */
    protected int ensureMenuParent(String menuId, String parentMenuId) {
        int n = nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET PARENT_MENU_ID = :p " +
                   "WHERE MENU_ID = :m AND (PARENT_MENU_ID IS NULL OR PARENT_MENU_ID <> :p)")
                .setParameter("p", parentMenuId)
                .setParameter("m", menuId)
                .executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] PARENT_MENU_ID 보정 — TB_MCM_SEC_MENU.{} → {} ({}행)", menuId, parentMenuId, n);
        }
        return n;
    }

    /**
     * {@code MENU_VIEW_YN} 백필 UPDATE 본체 — leaf/폴더 두 테이블 공용 (테이블명 인자는
     * {@link #insertIfAbsent(String, String, String, String)} 관례와 동일하게 시드 하드코딩 값만 받는다).
     */
    protected int ensureMenuViewYnOn(String table, String menuId, String viewYn) {
        String target = normalizeViewYn(viewYn);
        int n = nq("UPDATE MCMAPUSER." + table + " SET MENU_VIEW_YN = :v " +
                   "WHERE MENU_ID = :m AND (MENU_VIEW_YN IS NULL OR MENU_VIEW_YN <> :v)")
                .setParameter("v", target)
                .setParameter("m", menuId)
                .executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] MENU_VIEW_YN 보정 — {}.{} = {} ({}행)", table, menuId, target, n);
        }
        return n;
    }

    /** 단일 PK 기준 멱등 INSERT — 존재하면 skip. */
    protected void insertIfAbsent(String table, String pkCol, String pkVal, String insertSql) {
        Number cnt = (Number) nq(
                "SELECT COUNT(*) FROM MCMAPUSER." + table + " WHERE " + pkCol + " = :v")
                .setParameter("v", pkVal)
                .getSingleResult();
        if (cnt != null && cnt.intValue() > 0) return;
        nq(insertSql).executeUpdate();
        log.info("[DataInitializer] SEED INSERT: {}.{} = {}", table, pkCol, pkVal);
    }

    /** 복합 PK 기준 멱등 INSERT — 모든 PK 컬럼이 일치하면 skip. */
    protected void insertIfAbsentComposite(String table, String[] pkCols, String[] pkVals, String insertSql) {
        if (pkCols.length != pkVals.length || pkCols.length == 0) return;
        StringBuilder where = new StringBuilder();
        for (int i = 0; i < pkCols.length; i++) {
            if (i > 0) where.append(" AND ");
            where.append(pkCols[i]).append(" = :v").append(i);
        }
        var q = nq(
                "SELECT COUNT(*) FROM MCMAPUSER." + table + " WHERE " + where);
        for (int i = 0; i < pkVals.length; i++) {
            q.setParameter("v" + i, pkVals[i]);
        }
        Number cnt = (Number) q.getSingleResult();
        if (cnt != null && cnt.intValue() > 0) return;
        nq(insertSql).executeUpdate();
        log.info("[DataInitializer] SEED INSERT: {} composite PK={}", table, String.join("/", pkVals));
    }

    /** TB_MCM_SEC_OBJ 멱등 INSERT — SecObj entity 컬럼 정합 + audit 9 컬럼 명시 (McmAuditEntity 정합). */
    protected void insertMcmSecObjIfAbsent(String objectId, String objectNm, String systemCode) {
        insertIfAbsent("TB_MCM_SEC_OBJ", "OBJECT_ID", objectId,
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ " +
                "(OBJECT_ID, OBJECT_NM, SYSTEM_CODE, OBJECT_TYPE, USE_TP, ACCESS_TP, START_ACTIVE_DATE, END_ACTIVE_DATE" + AUDIT_COLS + ") " +
                "VALUES ('" + escapeSql(objectId) + "', N'" + escapeSql(objectNm) + "', " +
                "'" + escapeSql(systemCode) + "', 'web', 'Y', N'내부', SYSDATETIME(), '9999-12-31 23:59:59'" + AUDIT_VALS + ")");
    }

    /**
     * 기존 DB 보정 — {@code insertIfAbsent(PERM_ALL)} 은 이미 존재하는 PERM_ALL 을 갱신하지 않는다.
     * PageLayout button RBAC 는 {@code PERMISSION_ACTION} 콤마 토큰을 그대로 펼치므로, 표준 액션이
     * 뒤늦게 추가된 경우 부팅 시 누락분만 append 한다.
     */
    protected void ensurePermAllActions(String desiredActionsCsv) {
        ensurePermActions("PERM_ALL", desiredActionsCsv);
    }

    /**
     * 이미 있는 권한 세트의 PERMISSION_ACTION 에 빠진 action 만 끝에 덧붙인다(멱등). 없는 권한 세트는 건너뛴다.
     * TSK-08-02 — PERM_ALL 전용이던 보정을 PERM_MDM_EDIT·PERM_MDM_CONFIRM 에도 쓰려고 권한 ID 를 받게 했다.
     */
    protected void ensurePermActions(String permissionId, String desiredActionsCsv) {
        @SuppressWarnings("unchecked")
        List<Object> rows = nq(
                "SELECT PERMISSION_ACTION FROM MCMAPUSER.TB_MCM_SEC_PERM WHERE PERMISSION_ID = :permissionId")
                .setParameter("permissionId", permissionId)
                .getResultList();
        if (rows.isEmpty()) {
            return;
        }

        Set<String> actions = new LinkedHashSet<>();
        appendCsv(actions, String.valueOf(rows.get(0) == null ? "" : rows.get(0)));
        appendCsv(actions, desiredActionsCsv);
        String normalized = String.join(",", actions);
        if (!normalized.equals(String.valueOf(rows.get(0) == null ? "" : rows.get(0)))) {
            int updated = nq(
                    "UPDATE MCMAPUSER.TB_MCM_SEC_PERM "
                            + "SET PERMISSION_ACTION = :actions, U_USR_ID = 'admin', U_AT = SYSDATETIME() "
                            + "WHERE PERMISSION_ID = :permissionId")
                    .setParameter("actions", normalized)
                    .setParameter("permissionId", permissionId)
                    .executeUpdate();
            log.info("[DataInitializer] {} action 보정 — rows={} actions={}", permissionId, updated, normalized);
        }
    }

    protected static void appendCsv(Set<String> sink, String csv) {
        if (csv == null || csv.isBlank()) {
            return;
        }
        for (String raw : csv.split(",")) {
            if (raw == null) {
                continue;
            }
            String token = raw.trim();
            if (!token.isEmpty()) {
                sink.add(token);
            }
        }
    }

    /** Simple SQL literal escape (single-quote -> double single-quote). 시드 hard-coded 값에만 사용. */
    protected static String escapeSql(String s) {
        if (s == null) return "";
        return s.replace("'", "''");
    }

    /**
     * SQLite 일 때만 시드 native SQL 의 MSSQL 전용 토큰을 SQLite 호환으로 치환. MSSQL/dev/prod 는 원문 그대로 (no-op).
     * <ul>
     *   <li>{@code MCMAPUSER.} schema 접두 제거 — SQLite 는 schema 미지원(ddl-auto 도 schema 무시하고 단일 테이블 생성)</li>
     *   <li>{@code SYSDATETIME()} → {@code CURRENT_TIMESTAMP}</li>
     *   <li>{@code N'...'} 유니코드 리터럴 prefix 제거 — SQLite 는 N prefix 미지원.
     *       {@link McmAuditStatementInspector#stripUnicodeLiteralPrefix} 재사용(2026-08-07).
     *       구 정규식 {@code replaceAll("(?<![A-Za-z0-9_])N'", "'")} 은 <b>값 {@code 'N'} 자체를
     *       {@code ''} 로 바꿔버려</b> {@code SET USE_TP = 'N'} 시드가 빈 문자열을 적재했고,
     *       그 빈 값이 commMenuMng 조회·저장 전체를 죽이는 원인이 됐다.</li>
     * </ul>
     */
    protected String sanitize(String sql) {
        if (!sqliteDialect) {
            return sql;
        }
        return McmAuditStatementInspector.stripUnicodeLiteralPrefix(
                sql.replace("MCMAPUSER.", "")
                   .replace("SYSDATETIME()", "CURRENT_TIMESTAMP"));
    }

    /** native query 생성 공통 진입점 — SQLite 면 sanitize 후 실행, MSSQL 은 원문(no-op). */
    protected jakarta.persistence.Query nq(String sql) {
        return entityManager.createNativeQuery(sanitize(sql));
    }
}
