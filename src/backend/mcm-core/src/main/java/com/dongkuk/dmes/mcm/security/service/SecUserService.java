package com.dongkuk.dmes.mcm.security.service;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecPerm;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import com.dongkuk.dmes.mcm.menu.MenuOrder;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.dto.MyMenusRequest;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 내 메뉴·내 권한 조회 서비스 — mcm-core. cactus 무관.
 *
 * <p>Phase R3 재작성 (2026-06-01) — W1~W9 신규 RBAC chain 으로 swap:
 * <pre>
 *   User → SecUserMapping → RoleGroup → SecRoleGroupMapping → Role
 *        → SecRoleMapping → (OBJECT_ID, PERMISSION_ID) → SecObj + SecPerm
 * </pre>
 *
 * <p>BPMN secUser 의 myMenus / myMenusTree / myPermissions / myButtonEndpoints 에서 호출한다.
 * 사용자 조회·저장·비밀번호 초기화(search / save / resetPassword)는 BE 리팩토링 2회차 F7 에서
 * {@code mcm-core/archive/main/security/} 로 옮겼다 — 실제 @Primary 사용자 저장소가 빈 목록·미지원 예외만 내는
 * 죽은 경로였다. 사용자 관리는 {@code csa/commUserMng} 가 맡는다.
 *
 * <p>IDOR 차단: getMyMenus / getMyMenusTree / getMyPermissions / getMyButtonEndpoints 는
 * request body 의 userId 를 무시하고 {@link SecurityIdentity#requireUserId()} 로 강제 치환.
 *
 * <p>legacy 자산 의존 제거 매핑:
 * <ul>
 *   <li>{@code mcm.role.entity.SecObj} (legacy OBJ_ID/OBJ_NM/SYS_CD) →
 *       {@code mcm.entity.SecObj} (W1 OBJECT_ID/OBJECT_NM/SYSTEM_CODE)</li>
 *   <li>{@code mcm.menu.entity.SecMenu} (legacy 단일 PK MENU_ID + ROW_SEQ 정렬) →
 *       {@code mcm.entity.SecMenu} (W2 복합 PK + MENU_SEQ 정렬 + PARENT_MENU_ID 트리)</li>
 *   <li>{@code mcm.role.entity.SecPerm} (legacy PERM_ID/OBJ_ID 1:1) →
 *       {@code mcm.entity.SecPerm} (W6 PERMISSION_ID + PERMISSION_ACTION 콤마 텍스트)</li>
 *   <li>{@code mcm.role.entity.SecPermButton} (legacy ENDPOINT/ACTION 1:N) →
 *       SecPerm.PERMISSION_ACTION 콤마 토큰으로 흡수 (W6 결정)</li>
 *   <li>{@code mcm.role.entity.SecRolePerm} → {@code mcm.entity.SecRoleMapping}
 *       (W3 복합 PK ROLE_ID + OBJECT_ID + PERMISSION_ID)</li>
 *   <li>{@code mcm.security.entity.SecUserRole} → {@code mcm.entity.SecUserMapping}
 *       (W5 복합 PK USER_ID + ROLE_GROUP_ID — RoleGroup 매개 1단계 추가)</li>
 * </ul>
 *
 * <p>의미 변경 사항 (legacy → 신규):
 * <ul>
 *   <li>{@code getMyButtonEndpoints} — legacy SecPermButton.ENDPOINT/HTTP_METHOD 1:N 평탄화 →
 *       신규 SecPerm.PERMISSION_ACTION 콤마 토큰을 action 으로 추출. endpoint / httpMethod 는
 *       PermKey 빌드로 별도 매핑되므로 본 응답에서는 "*" 로 통일 (FE 호환).</li>
 * </ul>
 */
@Service("secUserService")
public class SecUserService {

    private final SecUserMappingRepository secUserMappingRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final SecRoleMappingRepository secRoleMappingRepository;
    private final SecPermRepository secPermRepository;
    /** SEC_MENU·SEC_OBJ 전수 목록 캐시 — 사용자별 권한 필터는 요청마다 여기서 한다. */
    private final MenuCatalog menuCatalog;
    private final SecMenuFldLovRepository secMenuFldLovRepository;
    private final SecurityIdentity securityIdentity;
    /** SYSADMIN 브레이크글라스 — true 시 메뉴/버튼 舊 전면통과 복원 (기본 false = 매핑 기반, 2026-07-30). */
    private final boolean sysadminFreepass;

    /** perm-bench r3 — v2 계산(그래프 + resolver). null 이면 옛 계산(legacy). */
    private final PermGraphLoader permGraphLoader;
    private final PermResolver permResolver;

    /** 옛 계산(legacy) 전용 — 시험과 되돌림 경로. */
    public SecUserService(SecUserMappingRepository secUserMappingRepository,
                          SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                          SecRoleMappingRepository secRoleMappingRepository,
                          SecPermRepository secPermRepository,
                          MenuCatalog menuCatalog,
                          SecMenuFldLovRepository secMenuFldLovRepository,
                          SecurityIdentity securityIdentity,
                          boolean sysadminFreepass) {
        this(secUserMappingRepository, secRoleGroupMappingRepository, secRoleMappingRepository, secPermRepository,
                menuCatalog, secMenuFldLovRepository, securityIdentity, sysadminFreepass, "legacy", null, null);
    }

    /** perm-bench r3 — {@code mcm.security.perm-model=v2}(기본)이면 버튼·메뉴 거르기를 PermGraphLoader + PermResolver 로 한다(D24). */
    @Autowired
    public SecUserService(SecUserMappingRepository secUserMappingRepository,
                          SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                          SecRoleMappingRepository secRoleMappingRepository,
                          SecPermRepository secPermRepository,
                          MenuCatalog menuCatalog,
                          SecMenuFldLovRepository secMenuFldLovRepository,
                          SecurityIdentity securityIdentity,
                          @Value("${mcm.security.sysadmin-freepass:false}") boolean sysadminFreepass,
                          @Value("${mcm.security.perm-model:v2}") String permModel,
                          PermGraphLoader permGraphLoader,
                          PermResolver permResolver) {
        boolean v2 = "v2".equalsIgnoreCase(permModel == null ? "" : permModel.trim());
        this.permGraphLoader = v2 ? permGraphLoader : null;
        this.permResolver = v2 ? permResolver : null;
        this.secUserMappingRepository = secUserMappingRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.secRoleMappingRepository = secRoleMappingRepository;
        this.secPermRepository = secPermRepository;
        this.menuCatalog = menuCatalog;
        this.secMenuFldLovRepository = secMenuFldLovRepository;
        this.securityIdentity = securityIdentity;
        this.sysadminFreepass = sysadminFreepass;
    }

    // ─────────────────────────────────────────────────────────────────────
    // BPMN action=myMenus / myMenusTree
    // ─────────────────────────────────────────────────────────────────────

    /**
     * BPMN action=myMenus — IDOR 차단: 인증된 본인의 ID 사용.
     *
     * <p>Phase R3 재작성 — W2 신규 SecMenu (복합 PK + 다른 컬럼명) 사용:
     * <ul>
     *   <li>{@code useYn='Y'} → {@code useTp='Y'} (W2 컬럼 명)</li>
     *   <li>{@code rowSeq} 정렬 → 형제끼리 {@code MENU_SEQ} 숫자 정렬 ({@link MenuOrder}, 2026-11-27 FULL_SEQ 제거)</li>
     *   <li>{@code uprLvMenuId} (legacy) → {@code parentMenuId} (W2)</li>
     *   <li>{@code menuType} 'dir' 분류 / {@code serviceUrl} / {@code param} / {@code sq} 등
     *       legacy-only 필드는 신규 SecMenu 에 없음 — 응답에서 제거 또는 null 채움.</li>
     * </ul>
     */
    public List<Map<String, Object>> getMyMenus(MyMenusRequest request /* userId 무시 */) {
        String userId = securityIdentity.requireUserId();
        // 메뉴·OBJECT 전수 목록은 카탈로그 캐시(사용자 무관) — 같은 스냅샷 하나에서 둘 다 읽는다.
        MenuCatalog.Snapshot catalog = menuCatalog.snapshot();
        // useTp='Y' 만 보존. 형제 순서는 트리를 만든 뒤 sortTree 가 MENU_SEQ 로 정한다(MenuOrder) — 여기 정렬은 결과를 늘 같게 하려는 것.
        List<SecMenu> allMenus = catalog.menus().stream()
                .filter(m -> "Y".equals(m.getUseTp()))
                .sorted(MenuOrder.MENUS)
                .toList();
        List<SecMenu> menus = filterMenusByRole(allMenus, userId);

        Map<String, SecObj> objById = catalog.objectsById();

        // Round 3: SEC_MENU 가 leaf 화면만 보관하도록 분리됨에 따라 SEC_MENU_FLD 의 폴더 row
        // (모듈 + 그룹) 도 myMenus 응답에 포함 — portal 사이드바 트리 계층 정합.
        List<Map<String, Object>> fldRows = secMenuFldLovRepository.findAllForMyMenus();
        // 권한 필터된(보이는) leaf 의 조상 폴더만 노출 — 권한 있는 자식(object)이 없는 폴더는 숨긴다.
        // (SYSADMIN 은 filterMenusByRole 이 전체 leaf 를 통과 → 모든 폴더 노출.)
        Set<String> visibleFolderIds = collectAncestorFolderIds(menus, fldRows);
        List<Map<String, Object>> result = new ArrayList<>(menus.size() + fldRows.size());
        for (Map<String, Object> fld : fldRows) {
            // 폴더 USE_TP 가 'N' 이면 skip.
            Object useTp = fld.get("USE_TP");
            if (useTp != null && "N".equals(useTp.toString())) continue;
            // 보이는 자식(권한 object)이 없는 폴더는 숨긴다.
            String fldId = asStr(fld.get("MENU_ID"));
            if (fldId != null && !visibleFolderIds.contains(fldId)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("menuId",      fld.get("MENU_ID"));
            row.put("menuSeq",     fld.get("MENU_SEQ"));
            row.put("menuNm",      fld.get("MENU_NM"));
            row.put("menuType",    fld.get("MENU_TP"));
            row.put("menuSet",     null);
            row.put("lv",          null);
            row.put("uprLvMenuId", fld.get("PARENT_MENU_ID"));
            row.put("objId",       null);
            row.put("serviceUrl",  null);
            row.put("param",       null);
            row.put("sq",          null);
            row.put("hiddenYn",    "N".equals(String.valueOf(fld.get("MENU_VIEW_YN"))) ? "Y" : "N");
            row.put("useYn",       fld.get("USE_TP"));
            row.put("sysCd",       null);
            row.put("objNm",       null);
            // 2026-06-05 Phase 1 — DB derived: 폴더 row 는 componentPath null (오픈 대상 ✗).
            row.put("componentPath", null);
            result.add(row);
        }
        for (SecMenu menu : menus) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("menuId",      menu.getMenuId());
            row.put("menuSeq",     menu.getMenuSeq());
            row.put("menuNm",      menu.getMenuNm());
            row.put("menuType",    menu.getMenuTp());
            // legacy menuSet / lv / serviceUrl / param / sq / hiddenYn 은 신규 SecMenu 에 없음 → null
            row.put("menuSet",     null);
            row.put("lv",          null);
            row.put("uprLvMenuId", menu.getParentMenuId());
            row.put("objId",       menu.getObjectId());
            row.put("serviceUrl",  null);
            row.put("param",       null);
            row.put("sq",          null);
            row.put("hiddenYn",    "N".equals(menu.getMenuViewYn()) ? "Y" : "N");
            row.put("useYn",       menu.getUseTp());

            String objectId = menu.getObjectId();
            if (objectId != null) {
                SecObj obj = objById.get(objectId);
                if (obj != null) {
                    row.put("sysCd", obj.getSystemCode());
                    row.put("objNm", obj.getObjectNm());
                } else {
                    row.put("sysCd", null);
                    row.put("objNm", null);
                }
            } else {
                row.put("sysCd", null);
                row.put("objNm", null);
            }
            // componentPath — FE Sidebar 가 이 값으로 page-components/{componentPath}/page.tsx 를 동적 import 한다.
            //   2026-11-26 — 화면 코드 경로는 OBJECT 의 것(OBJECT.FORM_URL)이다. FORM_URL 이 비었거나 '/' 가 없으면 옛 규칙
            //   PARENT_MENU_ID/OBJECT_ID 로 물러난다(MenuCodePath). 정할 수 없으면 null (FE 가 sysCd+objId 조립으로 물러난다).
            row.put("componentPath", catalog.codePathOf(menu));
            result.add(row);
        }
        return result;
    }

    /**
     * BPMN action=myMenusTree — IDOR 차단 적용된 getMyMenus 결과를 부모-자식 트리로 조립.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getMyMenusTree(MyMenusRequest request /* userId 무시 */) {
        List<Map<String, Object>> flat = getMyMenus(request);

        Map<String, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> row : flat) {
            row.put("items", new ArrayList<Map<String, Object>>());
            byId.put((String) row.get("menuId"), row);
        }

        List<Map<String, Object>> roots = new ArrayList<>();
        for (Map<String, Object> row : flat) {
            String parentId = (String) row.get("uprLvMenuId");
            if (parentId != null && byId.containsKey(parentId)) {
                ((List<Map<String, Object>>) byId.get(parentId).get("items")).add(row);
            } else {
                roots.add(row);
            }
        }

        sortTree(roots);
        return roots;
    }

    // ─────────────────────────────────────────────────────────────────────
    // BPMN action=myPermissions / myButtonEndpoints
    // ─────────────────────────────────────────────────────────────────────

    /**
     * BPMN action=myPermissions — IDOR 차단 적용.
     *
     * <p>Phase R3 — legacy SecRolePerm 반환 → 신규 SecRoleMapping 반환 (복합 PK 의미 동일).
     */
    public List<SecRoleMapping> getMyPermissions(MyMenusRequest request /* userId 무시 */) {
        String userId = securityIdentity.requireUserId();
        Set<String> roleIds = resolveRoleIds(userId);
        if (roleIds.isEmpty()) return List.of();
        return secRoleMappingRepository.findByRoleIdIn(roleIds);
    }

    /**
     * BPMN action=myButtonEndpoints — 현재 사용자가 호출 가능한 (objId × action) 평탄화 목록.
     *
     * <p>Phase R3 재작성 — legacy SecPermButton.ENDPOINT/HTTP_METHOD 1:N 평탄화 폐기:
     * <ul>
     *   <li>legacy: (PERM_ID, OBJ_ID, ACTION, ENDPOINT, HTTP_METHOD) 평탄 row</li>
     *   <li>신규: SecRoleMapping → (OBJECT_ID, PERMISSION_ID) → SecPerm.PERMISSION_ACTION 콤마 → 각 action
     *       row 별 (objId, action, endpoint="*", httpMethod="*")</li>
     * </ul>
     *
     * <p>endpoint / httpMethod 는 PermKey 기반 RBAC 로 별도 매핑되므로 FE 호환을 위해 "*" 통일.
     *
     * <p>SYSADMIN 와일드카드 마커 1 행 ({objId:"*", action:"*"}) 은 브레이크글라스
     * ({@code mcm.security.sysadmin-freepass=true}) 시에만 — 평시엔 실 매핑 행 반환 (2026-07-30 순수 RBAC).
     *
     * <p>IDOR 차단 — request body 의 userId 무시.
     */
    public List<Map<String, Object>> getMyButtonEndpoints(MyMenusRequest request /* userId 무시 */) {
        String userId = securityIdentity.requireUserId();

        // 브레이크글라스 시에만 와일드카드 마커 1행 (FE 가 {*,*} 보면 무조건 enabled) — 평시 실 매핑 행.
        if (sysadminFreepass
                && (securityIdentity.hasAuthority("ROLE_SYSADMIN")
                    || securityIdentity.hasAuthority("SYSADMIN"))) {
            Map<String, Object> wildcard = new LinkedHashMap<>();
            wildcard.put("objId", "*");
            wildcard.put("action", "*");
            wildcard.put("endpoint", "*");
            wildcard.put("httpMethod", "*");
            return List.of(wildcard);
        }

        if (permGraphLoader != null && permResolver != null) {
            // perm-bench r3 — v2: 오브젝트마다 효과 action 한 줄씩(줄 사이 중복 없음)
            PermGraph graph = permGraphLoader.loadForUsers(Set.of(userId));
            List<Map<String, Object>> rows = new ArrayList<>();
            permResolver.actionsOf(graph, userId).forEach((objId, actions) -> {
                for (String action : actions) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("objId", objId);
                    row.put("action", action);
                    row.put("endpoint", "*");
                    row.put("httpMethod", "*");
                    rows.add(row);
                }
            });
            return rows;
        }

        Set<String> roleIds = resolveRoleIds(userId);
        if (roleIds.isEmpty()) return List.of();

        List<SecRoleMapping> mappings = secRoleMappingRepository.findByRoleIdIn(roleIds);
        if (mappings.isEmpty()) return List.of();

        Set<String> permissionIds = new LinkedHashSet<>();
        for (SecRoleMapping rm : mappings) {
            if (rm.getPermissionId() != null) permissionIds.add(rm.getPermissionId());
        }
        if (permissionIds.isEmpty()) return List.of();

        Map<String, SecPerm> permById = new HashMap<>();
        for (SecPerm p : secPermRepository.findAllById(permissionIds)) {
            permById.put(p.getPermissionId(), p);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (SecRoleMapping rm : mappings) {
            if (rm.getObjectId() == null || rm.getPermissionId() == null) continue;
            SecPerm perm = permById.get(rm.getPermissionId());
            if (perm == null) continue;
            Set<String> actions = collectPermActions(perm);
            for (String action : actions) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("objId", rm.getObjectId());
                row.put("action", action);
                row.put("endpoint", "*");
                row.put("httpMethod", "*");
                result.add(row);
            }
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 내부 helper
    // ─────────────────────────────────────────────────────────────────────

    /** SYSADMIN 또는 ROLE_GROUP 매핑이 있는 모든 ROLE_ID 도출 (RBAC chain step 1+2). */
    private Set<String> resolveRoleIds(String userId) {
        if (isBlank(userId)) return Set.of();
        List<String> roleGroupIds = secUserMappingRepository.findRoleGroupIdsByUserId(userId);
        if (roleGroupIds == null || roleGroupIds.isEmpty()) return Set.of();
        List<String> roleIds = secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(roleGroupIds);
        if (roleIds == null || roleIds.isEmpty()) return Set.of();
        return new LinkedHashSet<>(roleIds);
    }

    /** SecPerm 의 4 텍스트 필드를 콤마 분할하여 action 집합 빌드 (UserPermCache 와 동일 정책). */
    private static Set<String> collectPermActions(SecPerm perm) {
        Set<String> actions = new LinkedHashSet<>();
        appendCsv(actions, perm.getPermissionCommon());
        appendCsv(actions, perm.getPermissionCustom());
        appendCsv(actions, perm.getPopupBtn());
        appendCsv(actions, perm.getPermissionAction());
        return actions;
    }

    private static void appendCsv(Set<String> sink, String csv) {
        if (csv == null || csv.isBlank()) return;
        for (String raw : csv.split(",")) {
            if (raw == null) continue;
            String t = raw.trim();
            if (!t.isEmpty()) sink.add(t);
        }
    }

    /**
     * 사용자에게 허용된 OBJECT_ID 집합 기준으로 SecMenu 필터링.
     *
     * <p>Phase R3 — 신규 SecRoleMapping 의 OBJECT_ID set 기준 (legacy SecRolePerm/SecPerm 의 PERM→OBJ 매핑 흡수).
     *
     * <p>SYSADMIN 도 매핑 기반 필터 (2026-07-30 순수 RBAC — 백필로 전체 obj 매핑 보유 → 결과적으로 전체 leaf 통과).
     * 브레이크글라스 시에만 무조건 전체 통과.
     */
    private List<SecMenu> filterMenusByRole(List<SecMenu> allMenus, String userId) {
        if (isBlank(userId)) return List.of();
        if (sysadminFreepass
                && (securityIdentity.hasAuthority("ROLE_SYSADMIN")
                    || securityIdentity.hasAuthority("SYSADMIN"))) {
            return allMenus;
        }
        Set<String> allowedObjectIds = new HashSet<>();
        if (permGraphLoader != null && permResolver != null) {
            // 브레이크글라스 DB 역할 검사 — legacy 와 같게 둔다(토큰에 권한 문자열이 없어도 DB 역할이 SYSADMIN 이면 전체)
            if (sysadminFreepass) {
                Set<String> roleIds = resolveRoleIds(userId);
                if (roleIds.contains("SYSADMIN") || roleIds.contains("ROLE_SYSADMIN")) return allMenus;
            }
            // perm-bench r3 — v2: 퍼미션 행이 있는 쓰는 오브젝트(SYSADMIN = 쓰는 오브젝트 전부). 아래 조상 규칙은 그대로
            allowedObjectIds.addAll(permResolver.visibleObjects(permGraphLoader.loadForUsers(Set.of(userId)), userId));
        } else {
            Set<String> roleIds = resolveRoleIds(userId);
            if (roleIds.isEmpty()) return List.of();
            if (sysadminFreepass
                    && (roleIds.contains("SYSADMIN") || roleIds.contains("ROLE_SYSADMIN"))) {
                return allMenus;
            }
            List<SecRoleMapping> mappings = secRoleMappingRepository.findByRoleIdIn(roleIds);
            for (SecRoleMapping rm : mappings) {
                if (rm.getObjectId() != null) allowedObjectIds.add(rm.getObjectId());
            }
        }
        if (allowedObjectIds.isEmpty()) return List.of();

        Map<String, SecMenu> menuById = new HashMap<>();
        for (SecMenu m : allMenus) {
            menuById.put(m.getMenuId(), m);
        }
        Set<String> visibleMenuIds = new HashSet<>();
        for (SecMenu m : allMenus) {
            String objectId = m.getObjectId();
            if (objectId != null && allowedObjectIds.contains(objectId)) {
                visibleMenuIds.add(m.getMenuId());
                String parent = m.getParentMenuId();
                while (parent != null && !visibleMenuIds.contains(parent)) {
                    visibleMenuIds.add(parent);
                    SecMenu p = menuById.get(parent);
                    parent = (p != null) ? p.getParentMenuId() : null;
                }
            }
        }
        if (visibleMenuIds.isEmpty()) return List.of();
        List<SecMenu> filtered = new ArrayList<>(visibleMenuIds.size());
        for (SecMenu m : allMenus) {
            if (visibleMenuIds.contains(m.getMenuId())) {
                filtered.add(m);
            }
        }
        return filtered;
    }

    /**
     * 권한 필터된(보이는) leaf 메뉴들의 조상 폴더 MENU_ID 집합을 계산한다.
     *
     * <p>각 보이는 leaf 의 {@code parentMenuId}(그룹 폴더)부터 폴더 트리(SEC_MENU_FLD)를 위로 타고
     * 올라가며 모든 조상 폴더 ID 를 수집한다. 보이는 leaf 가 하나도 없는 폴더는 결과에 포함되지 않아
     * {@code getMyMenus} 에서 제외(숨김)된다. SYSADMIN 은 전체 leaf 가 보이므로 자식 있는 모든 폴더가 포함된다.
     */
    static Set<String> collectAncestorFolderIds(List<SecMenu> visibleLeaves,
                                                List<Map<String, Object>> fldRows) {
        Map<String, String> folderParent = new HashMap<>();
        if (fldRows != null) {
            for (Map<String, Object> fld : fldRows) {
                String mid = asStr(fld.get("MENU_ID"));
                if (mid != null) folderParent.put(mid, asStr(fld.get("PARENT_MENU_ID")));
            }
        }
        Set<String> needed = new HashSet<>();
        if (visibleLeaves == null) return needed;
        for (SecMenu leaf : visibleLeaves) {
            String p = leaf.getParentMenuId();
            // leaf 의 그룹 폴더부터 루트 폴더까지 조상 체인 수집 (cycle 방지: 이미 본 노드면 중단).
            while (p != null && !p.isBlank() && !needed.contains(p)) {
                needed.add(p);
                p = folderParent.get(p);
            }
        }
        return needed;
    }

    private static String asStr(Object o) {
        return o == null ? null : o.toString();
    }

    @SuppressWarnings("unchecked")
    private void sortTree(List<Map<String, Object>> nodes) {
        // 2026-11-27 — FULL_SEQ 를 없앴다. 형제끼리 MENU_SEQ(숫자) → MENU_ID 순(MenuOrder).
        nodes.sort(MenuOrder.rows("menuSeq", "menuId"));
        for (Map<String, Object> node : nodes) {
            List<Map<String, Object>> children = (List<Map<String, Object>>) node.get("items");
            if (children != null && !children.isEmpty()) {
                sortTree(children);
            }
        }
    }

    private boolean isBlank(String s) { return s == null || s.isBlank(); }
}
