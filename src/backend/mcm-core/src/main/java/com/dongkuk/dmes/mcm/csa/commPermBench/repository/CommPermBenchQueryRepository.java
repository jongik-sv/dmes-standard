/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 1단계 조회용 native query 어댑터 — 사람(앞 200명)·그룹·역할·연결·메뉴 트리·오브젝트 이름
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.repository;

import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchGroupRolesRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchGroupsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchRolesRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchUserGroupsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchUsersRow;
import com.dongkuk.dmes.mcm.repository.CommPermQueryRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * commPermBench 1단계 조회 SQL(읽기 전용). 공용 {@code repository/**} 는 perm-core 소유라 화면 패키지 안에 둔다.
 *
 * <p>권한 계산(보임·버튼)은 여기서 하지 않는다 — {@code PermResolver} 가 맡는다(D24). 여기는 표시용 목록·이름·건수만 읽는다.
 * 1글자 칸(USE_TP 등)은 드라이버에 따라 Character 로 올 수 있어 {@link #str(Object)} 로 문자열로 바꾼다.
 */
@Repository
public class CommPermBenchQueryRepository {

    private static final String S = "MCMAPUSER.";

    /** SYSADMIN 역할의 PERM_CNT — 퍼미션 없이 모든 값(commRoleMng {@code CommRoleMngService} 와 같은 값). */
    static final long SYSADMIN_PERM_CNT = -1L;

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /** 사람 목록 조건. 빈 값은 조건 없음. q 는 이미 대문자·LIKE 이스케이프·앞뒤 % 를 붙인 값. */
    public record UserFilter(String likeQ, String roleGroupId, String roleId) {
    }

    /** 메뉴 트리 한 줄. folder = TB_MCM_SEC_MENU_FLD 행, 아니면 TB_MCM_SEC_MENU 행. */
    public record MenuRow(String menuId, String parentMenuId, String menuNm, String objectId,
                          String sortSeq, String showTp, String useTp, boolean folder) {
    }

    /**
     * 사용자 한 명의 사용 여부·유효 기간(TB_MCM_SEC_USER USE_TP·START_ACTIVE_DATE·END_ACTIVE_DATE).
     * PermGraph 에 사용자 메타가 없어 작업대가 따로 읽는다(Q-022: 사용 안 함 사용자 = NO_ROLE).
     */
    public record UserStatus(String useTp, LocalDateTime startActiveDate, LocalDateTime endActiveDate) {

        /**
         * 쓰는 사용자인가. 역할·그룹·오브젝트의 사용 판정({@code security.perm.impl.PermEvaluator#active})과 같은 규칙 —
         * 그 클래스는 impl 패키지 전용이라 여기 그대로 옮겨 둔다. 규칙이 바뀌면 함께 바꾼다.
         * USE_TP='Y' · 시작 시각 이후 · 끝 시각이 자정(날짜만 저장)이면 그날 끝까지, 아니면 그 시각까지(포함).
         */
        public boolean activeAt(LocalDateTime now) {
            if (!"Y".equals(useTp)) {
                return false;
            }
            if (startActiveDate != null && now.isBefore(startActiveDate)) {
                return false;
            }
            if (endActiveDate == null) {
                return true;
            }
            if (endActiveDate.toLocalTime().equals(LocalTime.MIDNIGHT)) {
                return now.isBefore(endActiveDate.plusDays(1));
            }
            return !now.isAfter(endActiveDate);
        }
    }

    /** 사용자 상태. 없는 사용자면 empty. */
    @SuppressWarnings("unchecked")
    public Optional<UserStatus> findUserStatus(String userId) {
        String sql = "SELECT U.USE_TP, U.START_ACTIVE_DATE, U.END_ACTIVE_DATE FROM " + S + "TB_MCM_SEC_USER U "
                + " WHERE U.USER_ID = :userId";
        List<Object[]> rows = entityManager.createNativeQuery(sql).setParameter("userId", userId).getResultList();
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Object[] r = rows.get(0);
        return Optional.of(new UserStatus(str(r[0]), toLocalDateTime(r[1]), toLocalDateTime(r[2])));
    }

    /** 조건에 맞는 사람 앞 limit 명(USER_ID 순). */
    @SuppressWarnings("unchecked")
    public List<PermBenchUsersRow> searchUsers(UserFilter f, int limit) {
        StringBuilder sql = new StringBuilder("SELECT U.USER_ID, U.USER_NM, D.DEPT_NM, U.USE_TP ");
        appendUserFrom(sql, f);
        sql.append(" ORDER BY U.USER_ID FETCH FIRST :maxRows ROWS ONLY");
        Query q = entityManager.createNativeQuery(sql.toString());
        bindUserFilter(q, f);
        q.setParameter("maxRows", limit);
        List<Object[]> rows = q.getResultList();
        List<PermBenchUsersRow> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            out.add(new PermBenchUsersRow(str(r[0]), str(r[1]), str(r[2]), str(r[3])));
        }
        return out;
    }

    private static void appendUserFrom(StringBuilder sql, UserFilter f) {
        sql.append("FROM ").append(S).append("TB_MCM_SEC_USER U ")
           .append("LEFT JOIN ").append(S).append("TB_MCM_DEPT_INFO D ON D.DEPT_CD = U.DEPT_CD ")
           .append("WHERE 1 = 1 ");
        if (f.likeQ() != null) {
            sql.append("AND (UPPER(U.USER_ID) LIKE :q ESCAPE '\\' OR UPPER(U.USER_NM) LIKE :q ESCAPE '\\' ")
               .append("OR UPPER(D.DEPT_NM) LIKE :q ESCAPE '\\') ");
        }
        if (f.roleGroupId() != null) {
            sql.append("AND EXISTS (SELECT 1 FROM ").append(S).append("TB_MCM_SEC_USER_MAPPING UM ")
               .append("WHERE UM.USER_ID = U.USER_ID AND UM.ROLE_GROUP_ID = :roleGroupId) ");
        }
        if (f.roleId() != null) {
            sql.append("AND EXISTS (SELECT 1 FROM ").append(S).append("TB_MCM_SEC_USER_MAPPING UM ")
               .append("JOIN ").append(S).append("TB_MCM_SEC_ROLEGROUP_MAPPING GM ON GM.ROLE_GROUP_ID = UM.ROLE_GROUP_ID ")
               .append("WHERE UM.USER_ID = U.USER_ID AND GM.ROLE_ID = :roleId) ");
        }
    }

    private static void bindUserFilter(Query q, UserFilter f) {
        if (f.likeQ() != null) {
            q.setParameter("q", f.likeQ());
        }
        if (f.roleGroupId() != null) {
            q.setParameter("roleGroupId", f.roleGroupId());
        }
        if (f.roleId() != null) {
            q.setParameter("roleId", f.roleId());
        }
    }

    /** 역할 그룹 전체 + 그룹을 받은 사람 수. */
    @SuppressWarnings("unchecked")
    public List<PermBenchGroupsRow> searchGroups() {
        String sql = "SELECT G.ROLE_GROUP_ID, G.ROLE_GROUP_NM, G.USE_TP, "
                + "       (SELECT COUNT(1) FROM " + S + "TB_MCM_SEC_USER_MAPPING UM WHERE UM.ROLE_GROUP_ID = G.ROLE_GROUP_ID) "
                + "  FROM " + S + "TB_MCM_SEC_ROLEGROUP G "
                + " ORDER BY G.ROLE_GROUP_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        List<PermBenchGroupsRow> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            out.add(new PermBenchGroupsRow(str(r[0]), str(r[1]), str(r[2]), toLong(r[3])));
        }
        return out;
    }

    /** 역할 전체 + 그룹 수·사람 수(그룹 경유, 중복 제거)·퍼미션 행 수(TB_MCM_SEC_ROLE_PERM, SYSADMIN = -1). */
    @SuppressWarnings("unchecked")
    public List<PermBenchRolesRow> searchRoles() {
        String sql = "SELECT R.ROLE_ID, R.ROLE_NM, R.MENU_ID, R.USE_TP, "
                + "       (SELECT COUNT(1) FROM " + S + "TB_MCM_SEC_ROLEGROUP_MAPPING GM WHERE GM.ROLE_ID = R.ROLE_ID), "
                + "       (SELECT COUNT(DISTINCT UM.USER_ID) FROM " + S + "TB_MCM_SEC_ROLEGROUP_MAPPING GM "
                + "          JOIN " + S + "TB_MCM_SEC_USER_MAPPING UM ON UM.ROLE_GROUP_ID = GM.ROLE_GROUP_ID "
                + "         WHERE GM.ROLE_ID = R.ROLE_ID), "
                + "       (SELECT COUNT(1) FROM " + S + "TB_MCM_SEC_ROLE_PERM P WHERE P.ROLE_ID = R.ROLE_ID) "
                + "  FROM " + S + "TB_MCM_SEC_ROLE R "
                + " ORDER BY R.ROLE_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        List<PermBenchRolesRow> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            out.add(new PermBenchRolesRow(str(r[0]), str(r[1]), str(r[2]), str(r[3]),
                    toLong(r[4]), toLong(r[5]), rolePermCnt(str(r[0]), toLong(r[6]))));
        }
        return out;
    }

    /** 주어진 사람들의 사람↔그룹 연결. userIds 는 1,000개 이하(Oracle IN 한도) — 호출측 페이지 상한이 보장한다. */
    @SuppressWarnings("unchecked")
    public List<PermBenchUserGroupsRow> searchUserGroups(Collection<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }
        String sql = "SELECT UM.USER_ID, UM.ROLE_GROUP_ID FROM " + S + "TB_MCM_SEC_USER_MAPPING UM "
                + " WHERE UM.USER_ID IN (:userIds) ORDER BY UM.USER_ID, UM.ROLE_GROUP_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("userIds", userIds)
                .getResultList();
        List<PermBenchUserGroupsRow> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            out.add(new PermBenchUserGroupsRow(str(r[0]), str(r[1])));
        }
        return out;
    }

    /** 그룹↔역할 연결 전체. */
    @SuppressWarnings("unchecked")
    public List<PermBenchGroupRolesRow> searchGroupRoles() {
        String sql = "SELECT GM.ROLE_GROUP_ID, GM.ROLE_ID FROM " + S + "TB_MCM_SEC_ROLEGROUP_MAPPING GM "
                + " ORDER BY GM.ROLE_GROUP_ID, GM.ROLE_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        List<PermBenchGroupRolesRow> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            out.add(new PermBenchGroupRolesRow(str(r[0]), str(r[1])));
        }
        return out;
    }

    /**
     * 메뉴 트리 전체 = 폴더(TB_MCM_SEC_MENU_FLD) 다음 화면(TB_MCM_SEC_MENU). 각각 FULL_SEQ 순(Q-024).
     * SHOW_TP = MENU_VIEW_YN 이 'N' 이면 N, 아니면 Y(런타임 hiddenYn 과 같은 뜻 — SecUserService.getMyMenus).
     */
    @SuppressWarnings("unchecked")
    public List<MenuRow> searchMenus() {
        String fldSql = "SELECT F.MENU_ID, F.PARENT_MENU_ID, F.MENU_NM, F.FULL_SEQ, F.MENU_VIEW_YN, F.USE_TP "
                + "  FROM " + S + "TB_MCM_SEC_MENU_FLD F "
                + " ORDER BY CASE WHEN F.FULL_SEQ IS NULL THEN 1 ELSE 0 END, F.FULL_SEQ, F.MENU_SEQ, F.MENU_ID";
        String menuSql = "SELECT M.MENU_ID, M.PARENT_MENU_ID, M.MENU_NM, M.OBJECT_ID, M.FULL_SEQ, M.MENU_VIEW_YN, M.USE_TP "
                + "  FROM " + S + "TB_MCM_SEC_MENU M "
                + " ORDER BY CASE WHEN M.FULL_SEQ IS NULL THEN 1 ELSE 0 END, M.FULL_SEQ, M.MENU_SEQ, M.MENU_ID";
        List<MenuRow> out = new ArrayList<>();
        for (Object[] r : (List<Object[]>) entityManager.createNativeQuery(fldSql).getResultList()) {
            out.add(new MenuRow(str(r[0]), str(r[1]), str(r[2]), null, str(r[3]), showTp(r[4]), str(r[5]), true));
        }
        for (Object[] r : (List<Object[]>) entityManager.createNativeQuery(menuSql).getResultList()) {
            out.add(new MenuRow(str(r[0]), str(r[1]), str(r[2]), str(r[3]), str(r[4]), showTp(r[5]), str(r[6]), false));
        }
        return out;
    }

    /** OBJECT_ID → OBJECT_NM 전체(약 1,000줄). */
    @SuppressWarnings("unchecked")
    public Map<String, String> objectNames() {
        String sql = "SELECT O.OBJECT_ID, O.OBJECT_NM FROM " + S + "TB_MCM_SEC_OBJ O";
        Map<String, String> out = new LinkedHashMap<>();
        for (Object[] r : (List<Object[]>) entityManager.createNativeQuery(sql).getResultList()) {
            out.put(str(r[0]), str(r[1]));
        }
        return out;
    }

    /** OBJECT_ID → USE_TP 전체(menus 의 OBJ_USE_TP 칸). 초안은 오브젝트를 바꾸지 않으므로 CUR·DRAFT 같은 값. */
    @SuppressWarnings("unchecked")
    public Map<String, String> objectUseTps() {
        String sql = "SELECT O.OBJECT_ID, O.USE_TP FROM " + S + "TB_MCM_SEC_OBJ O";
        Map<String, String> out = new LinkedHashMap<>();
        for (Object[] r : (List<Object[]>) entityManager.createNativeQuery(sql).getResultList()) {
            out.put(str(r[0]), str(r[1]));
        }
        return out;
    }

    /** 오브젝트 한 건의 허용 값(explain 의 ALLOWED·사용 안 함 사용자 버튼 목록). */
    public record ObjRow(String objectId, String useTp, String btnPerm, String popupPerm) {
    }

    /** 오브젝트 한 건. 없으면 empty. */
    @SuppressWarnings("unchecked")
    public Optional<ObjRow> findObject(String objectId) {
        String sql = "SELECT O.OBJECT_ID, O.USE_TP, O.BTN_PERM, O.POPUP_PERM FROM " + S + "TB_MCM_SEC_OBJ O "
                + " WHERE O.OBJECT_ID = :objectId";
        List<Object[]> rows = entityManager.createNativeQuery(sql).setParameter("objectId", objectId).getResultList();
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Object[] r = rows.get(0);
        return Optional.of(new ObjRow(str(r[0]), str(r[1]), str(r[2]), str(r[3])));
    }

    /** 역할 행이 있는가(TB_MCM_SEC_ROLE). */
    public boolean roleExists(String roleId) {
        Object n = entityManager.createNativeQuery(
                        "SELECT COUNT(1) FROM " + S + "TB_MCM_SEC_ROLE R WHERE R.ROLE_ID = :roleId")
                .setParameter("roleId", roleId)
                .getSingleResult();
        return toLong(n) > 0;
    }

    private static String showTp(Object menuViewYn) {
        return "N".equals(str(menuViewYn)) ? "N" : "Y";
    }

    /** null 은 null, 그 밖은 toString(Character·BigDecimal 포함). */
    static String str(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof java.math.BigDecimal bd) {
            return bd.stripTrailingZeros().toPlainString();
        }
        return o.toString();
    }

    /** 드라이버가 주는 날짜 값(Timestamp·LocalDateTime·Date) → LocalDateTime. */
    static LocalDateTime toLocalDateTime(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof LocalDateTime ldt) {
            return ldt;
        }
        if (o instanceof java.sql.Timestamp ts) {
            return ts.toLocalDateTime();
        }
        if (o instanceof java.util.Date d) {
            return new java.sql.Timestamp(d.getTime()).toLocalDateTime();
        }
        if (o instanceof java.time.OffsetDateTime odt) {
            return odt.toLocalDateTime();
        }
        throw new IllegalStateException("날짜 형이 아닙니다: " + o.getClass().getName());
    }

    /** 역할 칸 PERM_CNT. SYSADMIN 이면 -1(퍼미션 행 수와 상관없이 모든 값 — {@link CommPermQueryRepository#isSysadmin}). */
    static long rolePermCnt(String roleId, long permRows) {
        return CommPermQueryRepository.isSysadmin(roleId) ? SYSADMIN_PERM_CNT : permRows;
    }

    static long toLong(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
    }
}
