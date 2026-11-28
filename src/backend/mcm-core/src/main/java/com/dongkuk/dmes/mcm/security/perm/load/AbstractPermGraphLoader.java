package com.dongkuk.dmes.mcm.security.perm.load;

import com.dongkuk.dmes.mcm.security.perm.GroupMeta;
import com.dongkuk.dmes.mcm.security.perm.MenuNode;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.RoleMeta;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 권한 그래프 로더 공통 — 사람·그룹·역할·오브젝트·메뉴 읽기와 범위 좁히기. 퍼미션 행과 오브젝트 허용 값만 구현마다 다르다.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 범위 규칙(조정자 지시, 2026-11-27)
 * <ul>
 *   <li>{@code loadForUsers} = 그 사람들의 사람→그룹, 그 그룹의 그룹→역할·그룹 메타, 그 역할의 역할 메타·퍼미션 행만 싣는다.
 *       <b>objects·menus 는 언제나 전체</b>(explain 의 「닿지 않는 오브젝트」 설명과 SYSADMIN 「모든 사용 오브젝트」 계산이 의존)</li>
 *   <li>{@code loadForRoles} = 그 역할이 든 그룹의 사람 전부를 {@code loadForUsers} 범위로 싣고, 사람이 없어도 그 역할의 메타·퍼미션 행은 싣는다</li>
 *   <li>{@code loadAll} = 전부</li>
 * </ul>
 * 메뉴 = 화면 메뉴(TB_MCM_SEC_MENU) + 폴더(TB_MCM_SEC_MENU_FLD). visible = MENU_VIEW_YN≠'N'. IN 목록은 {@value #CHUNK}개씩 나눈다.
 */
@Transactional(readOnly = true)
abstract class AbstractPermGraphLoader implements PermGraphLoader {

    static final int CHUNK = 900;
    static final String S = "MCMAPUSER.";

    @PersistenceContext(unitName = "default")
    protected EntityManager em;

    /** 지정 역할의 퍼미션 행(roleId → objectId → 행). roleIds = null 이면 전부. */
    protected abstract Map<String, Map<String, RolePerm>> loadRolePerms(Set<String> roleIds);

    /** 오브젝트 전체(objectId → 메타). */
    protected abstract Map<String, ObjMeta> loadObjects();

    /**
     * 역할·그룹의 사용 여부·유효 기간을 그대로 싣는가. false 면 모두 「쓰는 중」(USE_TP=Y, 기간 없음)으로 싣는다
     * — 옛 런타임은 이 칸을 보지 않았다(r0). legacy 되돌림이 옛 동작을 그대로 돌려주게 한다(D35).
     */
    protected boolean keepUsage() {
        return true;
    }

    @Override
    public PermGraph loadForUsers(Set<String> userIds) {
        if (userIds == null) userIds = Set.of();
        Map<String, Set<String>> userGroups = pairs(
                "SELECT USER_ID, ROLE_GROUP_ID FROM " + S + "TB_MCM_SEC_USER_MAPPING WHERE USER_ID IN (:ids)", userIds);
        return build(userGroups, null);
    }

    /** 역할이 든 그룹의 사람 전부 범위. 사람이 없어도 그 역할 자체(메타·퍼미션 행)는 싣는다. */
    @Override
    public PermGraph loadForRoles(Set<String> roleIds) {
        if (roleIds == null) roleIds = Set.of();
        Map<String, Set<String>> roleGroups = pairs(
                "SELECT ROLE_ID, ROLE_GROUP_ID FROM " + S + "TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_ID IN (:ids)", roleIds);
        Set<String> groupIds = new LinkedHashSet<>();
        roleGroups.values().forEach(groupIds::addAll);
        Map<String, Set<String>> groupUsers = pairs(
                "SELECT ROLE_GROUP_ID, USER_ID FROM " + S + "TB_MCM_SEC_USER_MAPPING WHERE ROLE_GROUP_ID IN (:ids)", groupIds);
        Set<String> userIds = new LinkedHashSet<>();
        groupUsers.values().forEach(userIds::addAll);
        Map<String, Set<String>> userGroups = pairs(
                "SELECT USER_ID, ROLE_GROUP_ID FROM " + S + "TB_MCM_SEC_USER_MAPPING WHERE USER_ID IN (:ids)", userIds);
        return build(userGroups, roleIds);
    }

    @Override
    public PermGraph loadAll() {
        Map<String, Set<String>> userGroups = pairs(
                "SELECT USER_ID, ROLE_GROUP_ID FROM " + S + "TB_MCM_SEC_USER_MAPPING", null);
        Map<String, Set<String>> groupRoles = pairs(
                "SELECT ROLE_GROUP_ID, ROLE_ID FROM " + S + "TB_MCM_SEC_ROLEGROUP_MAPPING", null);
        return new PermGraph(userGroups, groupRoles, roleMetas(null), groupMetas(null), loadObjects(),
                loadRolePerms(null), loadMenus());
    }

    /** 사람→그룹에서 시작해 그룹→역할·메타·퍼미션을 좁혀 싣는다. extraRoles = 사람이 없어도 실을 역할. */
    private PermGraph build(Map<String, Set<String>> userGroups, Set<String> extraRoles) {
        Set<String> groupIds = new LinkedHashSet<>();
        userGroups.values().forEach(groupIds::addAll);
        Map<String, Set<String>> groupRoles = pairs(
                "SELECT ROLE_GROUP_ID, ROLE_ID FROM " + S + "TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_GROUP_ID IN (:ids)", groupIds);
        Set<String> roleIds = new LinkedHashSet<>();
        groupRoles.values().forEach(roleIds::addAll);
        if (extraRoles != null) roleIds.addAll(extraRoles);
        return new PermGraph(userGroups, groupRoles, roleMetas(roleIds), groupMetas(groupIds), loadObjects(),
                roleIds.isEmpty() ? Map.of() : loadRolePerms(roleIds), loadMenus());
    }

    // ── 공통 읽기 ─────────────────────────────────────────────────────

    private Map<String, RoleMeta> roleMetas(Set<String> roleIds) {
        Map<String, RoleMeta> out = new LinkedHashMap<>();
        for (Object[] r : rows("SELECT ROLE_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE FROM " + S + "TB_MCM_SEC_ROLE"
                + (roleIds == null ? "" : " WHERE ROLE_ID IN (:ids)"), roleIds)) {
            out.put(str(r[0]), keepUsage() ? new RoleMeta(str(r[0]), str(r[1]), ldt(r[2]), ldt(r[3])) : new RoleMeta(str(r[0]), "Y", null, null));
        }
        return out;
    }

    private Map<String, GroupMeta> groupMetas(Set<String> groupIds) {
        Map<String, GroupMeta> out = new LinkedHashMap<>();
        for (Object[] r : rows("SELECT ROLE_GROUP_ID, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE FROM " + S + "TB_MCM_SEC_ROLEGROUP"
                + (groupIds == null ? "" : " WHERE ROLE_GROUP_ID IN (:ids)"), groupIds)) {
            out.put(str(r[0]), keepUsage() ? new GroupMeta(str(r[0]), str(r[1]), ldt(r[2]), ldt(r[3])) : new GroupMeta(str(r[0]), "Y", null, null));
        }
        return out;
    }

    /** 폴더 먼저, 그다음 화면 메뉴. 각각 MENU_SEQ(8자리 0 채움) → MENU_ID 순(2026-11-27 FULL_SEQ 삭제 — 형제 순서는 MENU_SEQ, mcm.menu.MenuOrder). */
    private List<MenuNode> loadMenus() {
        List<MenuNode> out = new ArrayList<>();
        for (Object[] r : rows("SELECT MENU_ID, PARENT_MENU_ID, MENU_VIEW_YN, USE_TP FROM " + S
                + "TB_MCM_SEC_MENU_FLD ORDER BY LPAD(CAST(MENU_SEQ AS VARCHAR2(30)), 8, '0'), MENU_ID", null)) {
            out.add(new MenuNode(str(r[0]), str(r[1]), null, !"N".equals(str(r[2])), str(r[3])));
        }
        for (Object[] r : rows("SELECT MENU_ID, PARENT_MENU_ID, OBJECT_ID, MENU_VIEW_YN, USE_TP FROM " + S
                + "TB_MCM_SEC_MENU ORDER BY LPAD(CAST(MENU_SEQ AS VARCHAR2(30)), 8, '0'), MENU_ID", null)) {
            out.add(new MenuNode(str(r[0]), str(r[1]), str(r[2]), !"N".equals(str(r[3])), str(r[4])));
        }
        return out;
    }

    // ── 도구 ──────────────────────────────────────────────────────────

    /** 두 칸 쿼리 → 첫 칸 → 둘째 칸 집합(넣은 순서). ids = null 이면 IN 없이 한 번. 빈 ids = 빈 결과. */
    protected Map<String, Set<String>> pairs(String sql, Collection<String> ids) {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        for (Object[] r : rows(sql, ids)) {
            String k = str(r[0]);
            String v = str(r[1]);
            if (k != null && v != null) out.computeIfAbsent(k, x -> new LinkedHashSet<>()).add(v);
        }
        return out;
    }

    /** sql 의 {@code (:ids)} 를 ids 묶음마다 채워 돌린다. ids = null 이면 그대로 한 번. 빈 ids = 빈 결과. */
    @SuppressWarnings("unchecked")
    protected List<Object[]> rows(String sql, Collection<String> ids) {
        if (ids == null) return em.createNativeQuery(sql).getResultList();
        List<String> list = ids.stream().filter(java.util.Objects::nonNull).distinct().toList();
        List<Object[]> out = new ArrayList<>();
        for (int i = 0; i < list.size(); i += CHUNK) {
            out.addAll(em.createNativeQuery(sql)
                    .setParameter("ids", list.subList(i, Math.min(i + CHUNK, list.size())))
                    .getResultList());
        }
        return out;
    }

    static String str(Object o) {
        return o == null ? null : o.toString();
    }

    /** 빈 글자·공백만 = null, 아니면 앞뒤 공백을 뗀다(옛 키 빌드가 SYSTEM_CODE 를 trim·빈 값 → mcm 으로 본다). */
    static String blankToNull(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }

    static LocalDateTime ldt(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDateTime l) return l;
        if (o instanceof Timestamp t) return t.toLocalDateTime();
        if (o instanceof java.util.Date d) return new Timestamp(d.getTime()).toLocalDateTime();
        if (o instanceof java.time.OffsetDateTime odt) return odt.toLocalDateTime();
        throw new IllegalStateException("날짜 칸 타입을 모른다: " + o.getClass().getName());
    }
}
