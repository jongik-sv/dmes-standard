package com.dongkuk.dmes.mcm.security.perm;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 권한 설명 서비스 — 작업대(b1)의 explain·사람 메뉴 트리·역할 메뉴 트리. 계산은 런타임과 같은 {@link PermResolver}(D24).
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용:
 * <ul>
 *   <li>그래프 = CUR(draft 가 null·빈 목록) 또는 DRAFT(현재 그래프에 draft 변경을 {@link PermGraph#applyChanges} 로 얹음).
 *       초안 저장·읽기는 작업대(b-레인)가 맡고 여기에는 변경 목록만 넘긴다</li>
 *   <li>CUR 범위 = 사람 기준 {@code loadForUsers}, 역할 기준 {@code loadForRoles}. DRAFT = {@code loadAll}
 *       (초안이 새로 붙인 그룹·역할의 연결이 좁힌 범위 밖일 수 있어서)</li>
 *   <li>메뉴 트리 = 지금 런타임 {@code SecUserService.getMyMenus} 규칙과 같다(순서는 {@code tree} 주석).
 *       숨김(hidden) = 그 줄 자신의 MENU_VIEW_YN='N'(보이는 줄도 숨김 표시로 내려간다, SHOW_TP)</li>
 * </ul>
 */
@Service
@Transactional(readOnly = true)
public class PermExplainService {

    /** 메뉴 트리 한 줄. visible = 런타임이 내려주는 줄인가. reason = 안 보이면 이유, 보이면서 숨김이면 MENU_HIDDEN, 아니면 null. */
    public record MenuTreeRow(String menuId, String parentMenuId, String menuNm, String objectId, String sortSeq,
                              boolean folder, boolean hidden, String useTp, boolean visible, DenyReason reason) {
    }

    /** 메뉴 이름·정렬 값·폴더 여부(읽은 표 = SEC_MENU_FLD 면 폴더). */
    public record MenuLabel(String menuNm, String sortSeq, boolean folder) {
    }

    /** 역할 트리용 가상 사용자·그룹 ID(실제 ID 에 쓰지 않는 # 를 둘러 겹치지 않게 한다). 그룹 메타가 없으면 쓰는 것으로 본다. */
    static final String ROLE_PROBE_USER = "#ROLE_PROBE_USER#";
    static final String ROLE_PROBE_GROUP = "#ROLE_PROBE_GROUP#";

    private final PermGraphLoader loader;
    private final PermResolver resolver;

    @PersistenceContext(unitName = "default")
    private EntityManager em;

    public PermExplainService(PermGraphLoader loader, PermResolver resolver) {
        this.loader = loader;
        this.resolver = resolver;
    }

    /** 사람×오브젝트 설명. */
    public Explain explain(String userId, String objectId, List<PermChange> draft) {
        if (userId == null || objectId == null) throw new IllegalArgumentException("userId·objectId 는 비울 수 없다");
        return resolver.explain(userGraph(userId, draft), userId, objectId);
    }

    /** 사람 기준 메뉴 트리(폴더 + 화면). 줄 순서 = 그래프 메뉴 순서(폴더 FULL_SEQ, 그다음 화면 FULL_SEQ). */
    public List<MenuTreeRow> userMenuTree(String userId, List<PermChange> draft) {
        PermGraph g = userGraph(userId, draft);
        Set<String> visibleObjects = resolver.visibleObjects(g, userId);
        return tree(g, visibleObjects, objectId -> resolver.explain(g, userId, objectId).objectReason());
    }

    /**
     * 역할 기준 메뉴 트리. 가상 사용자 하나(가상 그룹 → 이 역할)로 사람 트리와 같은 계산을 탄다
     * — 보이는 오브젝트 = {@code objectsOfRole}, 안 보이는 이유 = resolver 의 explain(ROLE_UNUSED·OBJ_UNUSED·NO_PERM 등).
     */
    public List<MenuTreeRow> roleMenuTree(String roleId, List<PermChange> draft) {
        PermGraph g = isDraft(draft) ? loader.loadAll().applyChanges(draft) : roleGraph(roleId);
        // 모르는 역할(메타 없음·SYSADMIN 아님) = 연결 없음 → 안 보이는 이유 NO_ROLE
        boolean known = roleId != null && (g.roles().containsKey(roleId)
                || PermResolver.SYSADMIN_ROLE.equals(roleId) || "ROLE_SYSADMIN".equals(roleId));
        PermGraph one = new PermGraph(Map.of(ROLE_PROBE_USER, Set.of(ROLE_PROBE_GROUP)),
                known ? Map.of(ROLE_PROBE_GROUP, Set.of(roleId)) : Map.of(),
                g.roles(), Map.of(), g.objects(), g.rolePerms(), g.menus());
        Set<String> visibleObjects = resolver.visibleObjects(one, ROLE_PROBE_USER);
        return tree(one, visibleObjects, objectId -> resolver.explain(one, ROLE_PROBE_USER, objectId).objectReason());
    }

    // ── 내부 ─────────────────────────────────────────────────────────

    private static boolean isDraft(List<PermChange> draft) {
        return draft != null && !draft.isEmpty();
    }

    private PermGraph userGraph(String userId, List<PermChange> draft) {
        if (isDraft(draft)) return loader.loadAll().applyChanges(draft);
        return loader.loadForUsers(userId == null ? Set.of() : Set.of(userId));
    }

    private PermGraph roleGraph(String roleId) {
        Set<String> ids = roleId == null ? Set.of() : Set.of(roleId);
        return loader.loadForRoles(ids);
    }

    /**
     * 런타임 {@code SecUserService.getMyMenus} 를 그대로 옮긴다.
     * <ol>
     *   <li>화면 줄(SEC_MENU) 중 USE_TP='Y' 만 대상. 오브젝트가 보이는 화면 + 그 화면에서 화면 줄끼리 부모를 타고 오른 화면 = 보임</li>
     *   <li>보이는 화면의 부모부터 폴더 줄(SEC_MENU_FLD)끼리 부모를 타고 오른 ID = 필요한 폴더</li>
     *   <li>폴더 줄 = USE_TP≠'N' 이고 필요한 폴더면 보임</li>
     * </ol>
     * 폴더·화면 구분 = 읽은 표(라벨이 없으면 OBJECT_ID 가 비면 폴더). hidden = 그 줄 자신의 MENU_VIEW_YN='N'(SHOW_TP 와 같은 뜻).
     */
    private List<MenuTreeRow> tree(PermGraph g, Set<String> visibleObjects,
                                   java.util.function.Function<String, DenyReason> denyOf) {
        Map<String, MenuLabel> labels = menuLabels();
        Map<String, MenuNode> leafById = new HashMap<>();
        Map<String, String> folderParent = new HashMap<>();
        for (MenuNode m : g.menus()) {
            if (m.menuId() == null) continue;
            if (isFolder(m, labels)) folderParent.putIfAbsent(m.menuId(), m.parentMenuId());
            else if ("Y".equals(m.useTp())) leafById.putIfAbsent(m.menuId(), m);
        }
        // 1) 보이는 화면
        Set<String> visibleLeaves = new HashSet<>();
        for (MenuNode m : leafById.values()) {
            if (m.objectId() == null || !visibleObjects.contains(m.objectId())) continue;
            visibleLeaves.add(m.menuId());
            String parent = m.parentMenuId();
            while (parent != null && !visibleLeaves.contains(parent)) {
                visibleLeaves.add(parent);
                MenuNode p = leafById.get(parent);
                parent = p == null ? null : p.parentMenuId();
            }
        }
        // 2) 필요한 폴더
        Set<String> neededFolders = new HashSet<>();
        for (String leafId : visibleLeaves) {
            MenuNode leaf = leafById.get(leafId);
            String p = leaf == null ? null : leaf.parentMenuId();
            while (p != null && !p.isBlank() && neededFolders.add(p)) {
                p = folderParent.get(p);
            }
        }

        Map<String, DenyReason> denyCache = new HashMap<>();
        List<MenuTreeRow> out = new ArrayList<>(g.menus().size());
        for (MenuNode m : g.menus()) {
            boolean folder = isFolder(m, labels);
            boolean hidden = !m.visible();
            boolean visible;
            DenyReason reason;
            if (folder) {
                visible = !"N".equals(m.useTp()) && neededFolders.contains(m.menuId());
                if (visible) reason = hidden ? DenyReason.MENU_HIDDEN : null;
                else reason = "N".equals(m.useTp()) ? DenyReason.MENU_HIDDEN : DenyReason.NO_PERM;
            } else {
                visible = "Y".equals(m.useTp()) && visibleLeaves.contains(m.menuId());
                if (visible) {
                    reason = hidden ? DenyReason.MENU_HIDDEN : null;
                } else if (!"Y".equals(m.useTp())) {
                    reason = DenyReason.MENU_HIDDEN;
                } else if (m.objectId() == null) {
                    reason = DenyReason.NO_PERM;
                } else {
                    reason = denyCache.computeIfAbsent(m.objectId(), denyOf);
                    if (reason == null || reason == DenyReason.MENU_HIDDEN) reason = DenyReason.NO_PERM;
                }
            }
            MenuLabel l = labels.getOrDefault(m.menuId(), new MenuLabel(null, null, folder));
            out.add(new MenuTreeRow(m.menuId(), m.parentMenuId(), l.menuNm(), m.objectId(), l.sortSeq(),
                    folder, hidden, m.useTp(), visible, reason));
        }
        return out;
    }

    private static boolean isFolder(MenuNode m, Map<String, MenuLabel> labels) {
        MenuLabel l = labels.get(m.menuId());
        return l != null ? l.folder() : m.objectId() == null;
    }

    /** 메뉴 이름·정렬 값·폴더 여부(폴더 + 화면). 정렬 값 = FULL_SEQ. 시험에서 바꿔 끼울 수 있게 열어 둔다. */
    @SuppressWarnings("unchecked")
    protected Map<String, MenuLabel> menuLabels() {
        Map<String, MenuLabel> out = new HashMap<>();
        for (String t : List.of("TB_MCM_SEC_MENU_FLD", "TB_MCM_SEC_MENU")) {
            boolean folder = t.endsWith("_FLD");
            List<Object[]> rows = em.createNativeQuery("SELECT MENU_ID, MENU_NM, FULL_SEQ FROM MCMAPUSER." + t).getResultList();
            for (Object[] r : rows) {
                if (r[0] != null) out.putIfAbsent(r[0].toString(), new MenuLabel(str(r[1]), str(r[2]), folder));
            }
        }
        return out;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
