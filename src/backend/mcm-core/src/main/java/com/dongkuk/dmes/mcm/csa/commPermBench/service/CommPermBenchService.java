/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench OASIS BPMN serviceTask entry point — 11 action 중 1단계 4개 구현(searchBench·searchMenuTree·explain·searchRolePerm)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchApplyRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchExplainRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchBenchRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchHistoryDtlRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchHistoryRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchMenuTreeRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchSearchRolePermRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchButtonsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchGroupRolesRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchGroupsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchMenusRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchPathsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchPermsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchRolesRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchUserGroupsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchUsersRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.CommPermBenchQueryRepository;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.CommPermBenchQueryRepository.MenuRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.CommPermBenchQueryRepository.ObjRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.CommPermBenchQueryRepository.UserFilter;
import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermBenchGraphSource.Source;
import com.dongkuk.dmes.mcm.security.perm.ButtonVerdict;
import com.dongkuk.dmes.mcm.security.perm.DenyReason;
import com.dongkuk.dmes.mcm.security.perm.Explain;
import com.dongkuk.dmes.mcm.security.perm.ExplainPath;
import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermExplainService;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * commPermBench(권한 작업대) — OASIS BPMN serviceTask entry point.
 *
 * <p>Spring bean {@code commPermBenchService} → BPMN {@code camunda:class}. 11 action = decompose.md §0.3.
 * 응답 모양(가이드 6-D-1, 조정 결정): grid 하나인 action 은 {@code List<Map>} 을 돌려주고 BPMN {@code output="<grid>"}
 * (searchMenuTree→menus · searchRolePerm→perms · loadDraft·saveDraft→draft · apply→result · searchHistory→his · searchHistoryDtl→dtl).
 * grid 가 여럿인 searchBench·explain·impact 는 Map(key = grid 이름) + {@code output="result"}. 행 = dto.PermBench*Row#toRow().
 *
 * <p>1단계(b1) = searchBench·searchMenuTree·explain·searchRolePerm. 보임·버튼 판정은 모두 {@link PermResolver} 가 한다(D24) —
 * 이 클래스는 그래프를 고르고(source CUR·DRAFT) 결과를 grid 칸으로 옮길 뿐이다. 2단계 7개는 b2~b5 가 채운다.
 *
 * <p>오류 = {@link BusinessException}, 메시지 {@code CODE: 상세}(Q-013). mcm-core 는 oasis 패키지를 쓰지 않으므로
 * (McmCoreArchitectureTest) oasis {@code UserException} 대신 이 예외를 쓴다.
 *
 * <p>가이드 §6-B: 본 Service 에 {@code @Transactional} 금지 — 트랜잭션은 BPMN process {@code tx} property 로.
 */
@Service("commPermBenchService")
public class CommPermBenchService {

    private static final String PENDING = "b1 pending c0/c1";

    /**
     * 사람 목록 상한(Q-011 조정 결정). 페이지 없음 — 넘으면 앞 200명(USER_ID 순)만 주고, FE 가 200건이면
     * 「앞 200명만 보입니다. 찾기로 좁혀 주세요.」를 보인다(디자인설계서). userGroups IN 목록도 1,000 아래로 묶인다.
     */
    static final int USER_LIMIT = 200;

    /** 메뉴 경로 구분(기능설계서 G9-004 「모듈 › 폴더 › 메뉴」). */
    static final String PATH_SEP = " › ";

    static final String REQUIRED = "PERM_REQUIRED";
    static final String BAD_VALUE = "PERM_BAD_VALUE";

    private final CommPermBenchQueryRepository query;
    private final PermBenchGraphSource graphs;
    private final PermDraftService draft;
    private final PermImpactService impact;
    private final PermApplyService applier;
    private final PermHistoryService history;
    private final PermChangeLookup lookup;

    /** 1단계만 쓰는 구성(시험용). 초안 action 은 {@code PERM_NOT_READY} 로 거절된다. */
    public CommPermBenchService(CommPermBenchQueryRepository query, PermBenchGraphSource graphs) {
        this(query, graphs, null);
    }

    /** 초안까지 쓰는 구성(시험용). 영향(impact)은 {@code PERM_NOT_READY} 로 거절된다. */
    public CommPermBenchService(CommPermBenchQueryRepository query, PermBenchGraphSource graphs, PermDraftService draft) {
        this(query, graphs, draft, null);
    }

    /** 영향까지 쓰는 구성(시험용). 적용(apply)은 {@code PERM_NOT_READY} 로 거절된다. */
    public CommPermBenchService(CommPermBenchQueryRepository query, PermBenchGraphSource graphs, PermDraftService draft,
                                PermImpactService impact) {
        this(query, graphs, draft, impact, null);
    }

    /** 적용까지 쓰는 구성(시험용). 이력 조회는 {@code PERM_NOT_READY} 로 거절된다. */
    public CommPermBenchService(CommPermBenchQueryRepository query, PermBenchGraphSource graphs, PermDraftService draft,
                                PermImpactService impact, PermApplyService applier) {
        this(query, graphs, draft, impact, applier, null);
    }

    /** 이력까지 쓰는 구성(시험용). searchBench 의 ME_SYSADMIN 은 늘 N 이다. */
    public CommPermBenchService(CommPermBenchQueryRepository query, PermBenchGraphSource graphs, PermDraftService draft,
                                PermImpactService impact, PermApplyService applier, PermHistoryService history) {
        this(query, graphs, draft, impact, applier, history, null);
    }

    @Autowired
    public CommPermBenchService(CommPermBenchQueryRepository query, PermBenchGraphSource graphs, PermDraftService draft,
                                PermImpactService impact, PermApplyService applier, PermHistoryService history,
                                PermChangeLookup lookup) {
        this.query = query;
        this.graphs = graphs;
        this.draft = draft;
        this.impact = impact;
        this.applier = applier;
        this.history = history;
        this.lookup = lookup;
    }

    private PermDraftService draft() {
        if (draft == null) {
            throw new BusinessException(ErrorCode.SERVICE_EXECUTION_ERROR, "PERM_NOT_READY: 초안 서비스가 등록되지 않았습니다");
        }
        return draft;
    }

    // ────────────────────────────────────────────────────────────────
    // [1단계] searchBench
    // ────────────────────────────────────────────────────────────────

    /**
     * 사람(앞 200명)·그룹·역할 목록과 연결.
     *
     * <p>grids: {@code users}(USER_ID 순, 최대 {@value #USER_LIMIT}명) · {@code groups} · {@code roles}(전체) ·
     * {@code userGroups}(돌려준 사람 것만) · {@code groupRoles}(전체) ·
     * {@code me}(한 줄 {@code ME_SYSADMIN} Y|N — 로그인 사용자가 SYSADMIN 역할을 가졌는가).
     * 현재 DB 값만 준다 — 초안(USER_GRP·GRP_ROLE)은 FE 가 겹쳐 그린다(기능설계서 G4·G5).
     */
    public Map<String, Object> searchBench(CommPermBenchSearchBenchRequest request) {
        CommPermBenchSearchBenchRequest r = request != null ? request : new CommPermBenchSearchBenchRequest();
        String q = trimToNull(r.getUserQ());
        UserFilter filter = new UserFilter(
                q == null ? null : "%" + escapeLike(q.toUpperCase(Locale.ROOT)) + "%",
                trimToNull(r.getRoleGroupId()),
                trimToNull(r.getRoleId()));

        List<PermBenchUsersRow> users = query.searchUsers(filter, USER_LIMIT);
        List<String> userIds = new ArrayList<>(users.size());
        for (PermBenchUsersRow u : users) {
            userIds.add(u.userId());
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("users", rows(users, PermBenchUsersRow::toRow));
        out.put("groups", rows(query.searchGroups(), PermBenchGroupsRow::toRow));
        out.put("roles", rows(query.searchRoles(), PermBenchRolesRow::toRow));
        out.put("userGroups", rows(query.searchUserGroups(userIds), PermBenchUserGroupsRow::toRow));
        out.put("groupRoles", rows(query.searchGroupRoles(), PermBenchGroupRolesRow::toRow));
        // 로그인 사용자의 SYSADMIN 여부 — 변경 검사(PermChangeValidator)와 같은 판정(PermChangeLookup)을 쓴다. 로그인 없음·판정기 없음 = N
        boolean sysadmin = lookup != null && lookup.currentUserIsSysadmin();
        out.put("me", List.of(Map.<String, Object>of("ME_SYSADMIN", sysadmin ? "Y" : "N")));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // [1단계] searchMenuTree — BPMN output="menus"
    // ────────────────────────────────────────────────────────────────

    /**
     * 메뉴 트리 전체(폴더+화면) + 사람 또는 역할 기준 보임(VISIBLE)·이유(REASON). 반환 = grid {@code menus} 행 목록.
     *
     * <p>보임·이유·폴더 규칙·줄 순서는 {@link PermExplainService#userMenuTree}·{@link PermExplainService#roleMenuTree}(r4,
     * 런타임 {@code SecUserService.getMyMenus} 와 같은 규칙)를 그대로 쓴다. 여기서는 §0.3 칸으로 옮기기만 한다:
     * SHOW_TP = hidden ? N : Y, SORT_SEQ = MENU_SEQ 8자리 0 채움(2026-11-27 FULL_SEQ 삭제), VISIBLE = visible ? Y : N, REASON = r4 이유 이름
     * (보이지만 숨김 = Y·MENU_HIDDEN, 안 보이는데 이유가 비면 NO_PERM — VISIBLE=N 이면 REASON 은 늘 채운다).
     * 끝 칸 OBJ_USE_TP = 오브젝트의 USE_TP(폴더·OBJECT_ID 없음·없는 오브젝트는 null). 역할 기준에서 FE 가 「오브젝트 사용 안 함」 표시에 쓴다.
     *
     * <ul>
     *   <li>입력은 userId 또는 roleId 하나(둘 다·둘 다 없음 = 오류). 없는 userId·roleId = PERM_BAD_VALUE</li>
     *   <li>source=DRAFT = 저장된 초안 변경 목록을 r4 에 넘긴다(빈 목록 = CUR)</li>
     *   <li>사람 기준에서 사용자가 사용 안 함(USE_TP≠Y·유효 기간 밖, {@link #userActive})이면 r4 를 부르지 않고
     *       모든 행(화면·폴더) = N·NO_ROLE(Q-022) — r4 는 사용자 상태를 보지 않는다</li>
     * </ul>
     */
    public List<Map<String, Object>> searchMenuTree(CommPermBenchSearchMenuTreeRequest request) {
        CommPermBenchSearchMenuTreeRequest r = request != null ? request : new CommPermBenchSearchMenuTreeRequest();
        String userId = trimToNull(r.getUserId());
        String roleId = trimToNull(r.getRoleId());
        if (userId == null && roleId == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, REQUIRED + ": userId 또는 roleId 가 필요합니다");
        }
        if (userId != null && roleId != null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, BAD_VALUE + ": userId 와 roleId 중 하나만 보냅니다");
        }
        Source source = PermBenchGraphSource.parseSource(r.getSource());
        PermExplainService explainer = graphs.explainer();

        if (userId != null && !userActive(userId)) {
            // Q-022: 사용 안 함 사용자 — 설명 서비스를 부르지 않고 모든 행 N·NO_ROLE
            Map<String, String> useTps = query.objectUseTps();
            List<Map<String, Object>> out = new ArrayList<>();
            for (MenuRow m : query.searchMenus()) {
                String obj = m.folder() ? null : trimToNull(m.objectId());
                out.add(new PermBenchMenusRow(m.menuId(), m.parentMenuId(), m.menuNm(), m.objectId(), m.sortSeq(),
                        m.showTp(), m.useTp(), "N", DenyReason.NO_ROLE.name(),
                        obj == null ? null : useTps.get(obj)).toRow());
            }
            return out;
        }

        List<PermChange> changes = graphs.draftChanges(source);
        List<PermExplainService.MenuTreeRow> tree;
        if (userId != null) {
            tree = explainer.userMenuTree(userId, changes);
        } else {
            if (!isSysadminRole(roleId) && !query.roleExists(roleId)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, BAD_VALUE + ": 없는 역할입니다 (" + roleId + ")");
            }
            tree = explainer.roleMenuTree(roleId, changes);
        }

        Map<String, String> useTps = query.objectUseTps();
        List<Map<String, Object>> out = new ArrayList<>(tree.size());
        for (PermExplainService.MenuTreeRow t : tree) {
            String reason = t.reason() != null ? t.reason().name() : (t.visible() ? null : DenyReason.NO_PERM.name());
            String obj = t.folder() ? null : trimToNull(t.objectId());
            out.add(new PermBenchMenusRow(t.menuId(), t.parentMenuId(), t.menuNm(), t.objectId(), t.sortSeq(),
                    t.hidden() ? "N" : "Y", t.useTp(), yn(t.visible()), reason,
                    obj == null ? null : useTps.get(obj)).toRow());
        }
        return out;
    }

    private static boolean isSysadminRole(String roleId) {
        return PermResolver.SYSADMIN_ROLE.equals(roleId) || "ROLE_SYSADMIN".equals(roleId);
    }

    // ────────────────────────────────────────────────────────────────
    // [1단계] explain — BPMN output="result"(buttons·paths 2 grid)
    // ────────────────────────────────────────────────────────────────

    /**
     * 사람×오브젝트의 버튼·팝업별 허용·이유(buttons)와 권한을 얻은 그룹→역할 길(paths). 판정 = {@link PermExplainService#explain}(r4).
     *
     * <ul>
     *   <li>없는 objectId·userId = PERM_BAD_VALUE</li>
     *   <li>ALLOWED = 그 코드가 오브젝트 허용 값(KIND=BTN 이면 OBJ.BTN_PERM, POPUP 이면 OBJ.POPUP_PERM)에 있으면 Y</li>
     *   <li>GRANTED = verdict.granted · REASON = 켜짐이면 GrantReason, 잠김이면 DenyReason 이름</li>
     *   <li>ROLES·GROUPS·BTN_PERM·POPUP_PERM = 쉼표 구분, 값이 없으면 null</li>
     *   <li>source=DRAFT = 저장된 초안 변경 목록을 r4 에 넘긴다(빈 목록 = CUR)</li>
     *   <li>사용 안 함 사용자({@link #userActive}) = r4 를 부르지 않고 오브젝트 허용 값(BTN 다음 POPUP) 전부
     *       ALLOWED=Y·GRANTED=N·REASON=NO_ROLE, paths 없음(Q-022)</li>
     * </ul>
     */
    public Map<String, Object> explain(CommPermBenchExplainRequest request) {
        CommPermBenchExplainRequest r = request != null ? request : new CommPermBenchExplainRequest();
        String userId = require("userId", r.getUserId());
        String objectId = require("objectId", r.getObjectId());
        Source source = PermBenchGraphSource.parseSource(r.getSource());
        PermExplainService explainer = graphs.explainer();
        ObjRow obj = query.findObject(objectId).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE,
                BAD_VALUE + ": 없는 오브젝트입니다 (" + objectId + ")"));
        List<String> objBtn = PermTokens.parse(obj.btnPerm());
        List<String> objPopup = PermTokens.parse(obj.popupPerm());
        boolean active = userActive(userId);

        List<Map<String, Object>> buttons = new ArrayList<>();
        List<Map<String, Object>> paths = new ArrayList<>();
        if (!active) {
            // Q-022: 사용 안 함 사용자 — 설명 서비스를 부르지 않는다. 오브젝트 허용 값 전부 = 잠김·NO_ROLE, 길 없음
            for (String code : objBtn) {
                buttons.add(new PermBenchButtonsRow(code, ButtonVerdict.Kind.BTN.name(), "Y", "N",
                        DenyReason.NO_ROLE.name(), null, null).toRow());
            }
            for (String code : objPopup) {
                buttons.add(new PermBenchButtonsRow(code, ButtonVerdict.Kind.POPUP.name(), "Y", "N",
                        DenyReason.NO_ROLE.name(), null, null).toRow());
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("buttons", buttons);
            out.put("paths", paths);
            return out;
        }

        Explain e = explainer.explain(userId, objectId, graphs.draftChanges(source));
        if (e != null) {
            for (ButtonVerdict v : e.buttons()) {
                List<String> allowedList = v.kind() == ButtonVerdict.Kind.POPUP ? objPopup : objBtn;
                String reason = v.granted()
                        ? (v.grantReason() == null ? null : v.grantReason().name())
                        : (v.denyReason() == null ? null : v.denyReason().name());
                buttons.add(new PermBenchButtonsRow(v.code(), v.kind() == null ? null : v.kind().name(),
                        yn(allowedList.contains(v.code())), yn(v.granted()), reason,
                        joinOrNull(v.viaRoles()), joinOrNull(v.viaGroups())).toRow());
            }
            for (ExplainPath p : e.paths()) {
                paths.add(new PermBenchPathsRow(p.roleGroupId(), p.roleId(),
                        joinOrNull(p.btnPerm()), joinOrNull(p.popupPerm())).toRow());
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("buttons", buttons);
        out.put("paths", paths);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // [1단계] searchRolePerm — BPMN output="perms"
    // ────────────────────────────────────────────────────────────────

    /**
     * 역할×오브젝트 퍼미션. 반환 = grid {@code perms} 행 목록.
     *
     * <ul>
     *   <li>없는 roleId·menuFolderId = PERM_BAD_VALUE</li>
     *   <li>menuFolderId 가 있으면 그 폴더 아래(후손 전부) 화면의 오브젝트를 메뉴 순서로 모두 준다 —
     *       퍼미션이 없는 오브젝트도 행이 있고 BTN_PERM·POPUP_PERM·DATA_PERM 이 null(퍼미션 편집에서 새로 켤 수 있게)</li>
     *   <li>menuFolderId 가 없으면 그 역할의 퍼미션이 있는 오브젝트만 준다(메뉴 순서, 메뉴에 없는 것은 끝에 OBJECT_ID 순)</li>
     *   <li>OBJ_* = 그래프의 오브젝트 허용 값, OBJ_READ_PERM = {@code PermTokens.readPreset(OBJ.BTN_PERM)}(D18)</li>
     *   <li>코드 목록 칸은 쉼표 구분, 값이 없으면 null</li>
     *   <li>MENU_PATH = 그 오브젝트를 가리키는 첫 화면 행의 폴더 이름들 › 화면 이름</li>
     *   <li>source=DRAFT 면 초안의 ROLE_OBJ 변경이 겹친 값</li>
     * </ul>
     */
    public List<Map<String, Object>> searchRolePerm(CommPermBenchSearchRolePermRequest request) {
        CommPermBenchSearchRolePermRequest r = request != null ? request : new CommPermBenchSearchRolePermRequest();
        String roleId = require("roleId", r.getRoleId());
        String folderId = trimToNull(r.getMenuFolderId());
        Source source = PermBenchGraphSource.parseSource(r.getSource());
        PermGraph g = graphs.forRole(roleId, source);
        requireRole(g, roleId);
        Map<String, RolePerm> perms = g.rolePerms().getOrDefault(roleId, Map.of());

        List<MenuRow> menus = query.searchMenus();
        Map<String, MenuRow> byId = new HashMap<>();
        for (MenuRow m : menus) {
            byId.putIfAbsent(m.menuId(), m);
        }
        if (folderId != null && !byId.containsKey(folderId)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, BAD_VALUE + ": 없는 메뉴 폴더입니다 (" + folderId + ")");
        }

        // 오브젝트 → 그 오브젝트를 가리키는 첫 화면 행(범위 안)
        Map<String, MenuRow> firstLeaf = new LinkedHashMap<>();
        Set<String> scope = folderId == null ? null : descendantsOf(folderId, menus);
        for (MenuRow m : menus) {
            String obj = trimToNull(m.objectId());
            if (m.folder() || obj == null) {
                continue;
            }
            if (scope != null && !scope.contains(m.menuId())) {
                continue;
            }
            firstLeaf.putIfAbsent(obj, m);
        }

        List<String> objectIds = new ArrayList<>();
        if (scope != null) {
            objectIds.addAll(firstLeaf.keySet());
        } else {
            for (String obj : firstLeaf.keySet()) {
                if (perms.containsKey(obj)) {
                    objectIds.add(obj);
                }
            }
            // 메뉴에 없는 것은 끝에 OBJECT_ID 순 — 그래프 맵 순서에 기대지 않는다
            List<String> rest = new ArrayList<>();
            for (String obj : perms.keySet()) {
                if (!firstLeaf.containsKey(obj)) {
                    rest.add(obj);
                }
            }
            rest.sort(null);
            objectIds.addAll(rest);
        }

        Map<String, String> names = objectIds.isEmpty() ? Map.of() : query.objectNames();
        List<Map<String, Object>> out = new ArrayList<>(objectIds.size());
        for (String obj : objectIds) {
            ObjMeta om = g.objects().get(obj);
            RolePerm rp = perms.get(obj);
            MenuRow leaf = firstLeaf.get(obj);
            out.add(new PermBenchPermsRow(roleId, obj, names.get(obj),
                    leaf == null ? null : menuPath(leaf, byId),
                    om == null ? null : joinOrNull(om.btnPerm()),
                    om == null ? null : joinOrNull(om.popupPerm()),
                    om == null ? null : joinOrNull(PermTokens.readPreset(om.btnPerm())),
                    rp == null ? null : joinOrNull(rp.btnPerm()),
                    rp == null ? null : joinOrNull(rp.popupPerm()),
                    rp == null ? null : blankToNull(rp.dataPerm())).toRow());
        }
        return out;
    }

    /**
     * 사용자가 지금 쓰는 사용자인가(TB_MCM_SEC_USER USE_TP·유효 기간, 규칙 = {@code UserStatus#activeAt}).
     * 없는 userId = PERM_BAD_VALUE.
     */
    private boolean userActive(String userId) {
        return query.findUserStatus(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE,
                        BAD_VALUE + ": 없는 사용자입니다 (" + userId + ")"))
                .activeAt(java.time.LocalDateTime.now());
    }

    /** 그래프 역할 메타에 없는 roleId = PERM_BAD_VALUE. */
    private static void requireRole(PermGraph g, String roleId) {
        if (!g.roles().containsKey(roleId)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, BAD_VALUE + ": 없는 역할입니다 (" + roleId + ")");
        }
    }

    /** folderId 와 그 후손 메뉴 ID(폴더·화면). */
    private static Set<String> descendantsOf(String folderId, List<MenuRow> menus) {
        Map<String, List<MenuRow>> children = childrenOf(menus);
        Set<String> out = new LinkedHashSet<>();
        List<String> stack = new ArrayList<>(List.of(folderId));
        while (!stack.isEmpty()) {
            String id = stack.remove(stack.size() - 1);
            if (!out.add(id)) {
                continue;
            }
            for (MenuRow c : children.getOrDefault(id, List.of())) {
                stack.add(c.menuId());
            }
        }
        return out;
    }

    /** 루트 폴더부터 화면까지 이름을 › 로 잇는다. 부모 고리는 한 번 만난 데서 끊는다. */
    private static String menuPath(MenuRow leaf, Map<String, MenuRow> byId) {
        List<String> names = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        MenuRow cur = leaf;
        while (cur != null && seen.add(cur.menuId())) {
            names.add(0, cur.menuNm() == null ? cur.menuId() : cur.menuNm());
            String parent = trimToNull(cur.parentMenuId());
            cur = parent == null ? null : byId.get(parent);
        }
        return String.join(PATH_SEP, names);
    }

    // ────────────────────────────────────────────────────────────────
    // [2단계] b2~b5 가 채운다
    // ────────────────────────────────────────────────────────────────

    /** 내 초안 읽기(draft) — {@link PermDraftService#loadDraft()}. */
    public List<Map<String, Object>> loadDraft() {
        return draft().loadDraft();
    }

    /** 초안 전체 교체 저장(draft) — 변경 목록은 grids.changes. {@link PermDraftService#saveDraft}. */
    public List<Map<String, Object>> saveDraft(List<Map<String, Object>> changes) {
        return draft().saveDraft(changes);
    }

    /** 내 초안 버리기 — {@link PermDraftService#discardDraft()}. */
    public void discardDraft() {
        draft().discardDraft();
    }

    /** [2단계] 저장된 초안의 영향(summary·impacts). */
    public Map<String, Object> impact() {
        if (impact == null) {
            throw new BusinessException(ErrorCode.SERVICE_EXECUTION_ERROR, "PERM_NOT_READY: 영향 계산 서비스가 등록되지 않았습니다");
        }
        return impact.impact();
    }

    /**
     * [2단계] 초안 적용 — grid result(BPMN output="result"). {@link PermApplyService#apply}.
     * PERM_CONFLICT·PERM_NEED_CONFIRM·PERM_NOT_IN_OBJ·PERM_EMPTY_BTN 등.
     */
    public List<Map<String, Object>> apply(CommPermBenchApplyRequest request) {
        if (applier == null) {
            throw new BusinessException(ErrorCode.SERVICE_EXECUTION_ERROR, "PERM_NOT_READY: 적용 서비스가 등록되지 않았습니다");
        }
        return applier.apply(request);
    }

    /** [2단계] 적용 이력 — grid his(BPMN output="his"). */
    public List<Map<String, Object>> searchHistory(CommPermBenchSearchHistoryRequest request) {
        return history().searchHistory(request);
    }

    /** [2단계] 적용 이력 줄 — grid dtl(BPMN output="dtl"). */
    public List<Map<String, Object>> searchHistoryDtl(CommPermBenchSearchHistoryDtlRequest request) {
        return history().searchHistoryDtl(request);
    }

    private PermHistoryService history() {
        if (history == null) {
            throw new BusinessException(ErrorCode.SERVICE_EXECUTION_ERROR, "PERM_NOT_READY: 이력 조회 서비스가 등록되지 않았습니다");
        }
        return history;
    }

    // ────────────────────────────────────────────────────────────────
    // 도우미
    // ────────────────────────────────────────────────────────────────

    private static Map<String, List<MenuRow>> childrenOf(List<MenuRow> menus) {
        Map<String, List<MenuRow>> children = new HashMap<>();
        for (MenuRow m : menus) {
            String parent = trimToNull(m.parentMenuId());
            if (parent != null && !parent.equals(m.menuId())) {
                children.computeIfAbsent(parent, k -> new ArrayList<>()).add(m);
            }
        }
        return children;
    }

    /** 코드 목록 → 쉼표 구분. 비면 null(「값 없음」을 null 하나로). */
    private static String joinOrNull(Collection<String> tokens) {
        String s = PermTokens.join(tokens);
        return s.isEmpty() ? null : s;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static boolean isShown(MenuRow m) {
        return !"N".equals(m.showTp());
    }

    private static <T> List<Map<String, Object>> rows(Collection<T> items, Function<T, Map<String, Object>> toRow) {
        List<Map<String, Object>> out = new ArrayList<>(items.size());
        for (T t : items) {
            out.add(toRow.apply(t));
        }
        return out;
    }

    private static String yn(boolean b) {
        return b ? "Y" : "N";
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String require(String name, String value) {
        String v = trimToNull(value);
        if (v == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, REQUIRED + ": " + name + " 가 필요합니다");
        }
        return v;
    }

    /** LIKE 이스케이프(ESCAPE '\'). */
    static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
