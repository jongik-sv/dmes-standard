package com.dongkuk.dmes.mcm.security.service;

import com.dongkuk.dmes.mcm.audit.AuditLogger;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecPerm;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.PasswordHasher;
import com.dongkuk.dmes.mcm.security.TransientUserAccount;
import com.dongkuk.dmes.mcm.security.UserAccount;
import com.dongkuk.dmes.mcm.security.UserAccountRepository;
import com.dongkuk.dmes.mcm.security.dto.MyMenusRequest;
import com.dongkuk.dmes.mcm.security.dto.SecUserSearchRequest;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;

/**
 * 사용자 관리 서비스 — mcm-core. cactus 무관.
 *
 * <p>Phase R3 재작성 (2026-06-01) — W1~W9 신규 RBAC chain 으로 swap:
 * <pre>
 *   User → SecUserMapping → RoleGroup → SecRoleGroupMapping → Role
 *        → SecRoleMapping → (OBJECT_ID, PERMISSION_ID) → SecObj + SecPerm
 * </pre>
 *
 * <p>BPMN secUser 에서 호출. cactus.SecUser 등은 사이트 어댑터(SecUserAccountAdapter 등)
 * 를 통해 위임. mcm-core 자체는 {@link UserAccount} / {@link UserAccountRepository} /
 * {@link PasswordHasher} 인터페이스만 의존.
 *
 * <p>IDOR 차단: getMyMenus / getMyMenusTree / getMyPermissions / getMyButtonEndpoints 는
 * request body 의 userId 를 무시하고 {@link SecurityIdentity#requireUserId()} 로 강제 치환.
 *
 * <p>감사 로그: saveUsers / resetPassword 는 {@link AuditLogger} 로 호출 전·후 기록.
 *
 * <p>legacy 자산 의존 제거 매핑:
 * <ul>
 *   <li>{@code mcm.role.entity.SecObj} (legacy OBJ_ID/OBJ_NM/SYS_CD) →
 *       {@code mcm.entity.SecObj} (W1 OBJECT_ID/OBJECT_NM/SYSTEM_CODE)</li>
 *   <li>{@code mcm.menu.entity.SecMenu} (legacy 단일 PK MENU_ID + ROW_SEQ 정렬) →
 *       {@code mcm.entity.SecMenu} (W2 복합 PK + FULL_SEQ 정렬 + PARENT_MENU_ID 트리)</li>
 *   <li>{@code mcm.role.entity.SecPerm} (legacy PERM_ID/OBJ_ID 1:1) →
 *       {@code mcm.entity.SecPerm} (W6 PERMISSION_ID + PERMISSION_ACTION 콤마 텍스트)</li>
 *   <li>{@code mcm.role.entity.SecPermButton} (legacy ENDPOINT/ACTION 1:N) →
 *       SecPerm.PERMISSION_ACTION 콤마 토큰으로 흡수 (W6 결정)</li>
 *   <li>{@code mcm.role.entity.SecRolePerm} → {@code mcm.entity.SecRoleMapping}
 *       (W3 복합 PK ROLE_ID + OBJECT_ID + PERMISSION_ID)</li>
 *   <li>{@code mcm.security.entity.SecUserRole} → {@code mcm.entity.SecUserMapping}
 *       (W5 복합 PK USER_ID + ROLE_GROUP_ID — RoleGroup 매개 1단계 추가)</li>
 *   <li>{@code mcm.security.entity.SecUserPwHis} → 폐기. resetPassword 는 hashed 비번을
 *       UserAccount.setUserPass 로만 적재. 이력 적재는 후속 PR (Phase R6 신규 SecUserPwd 흡수).</li>
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

    private final UserAccountRepository userAccountRepository;
    private final SecUserMappingRepository secUserMappingRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final SecRoleMappingRepository secRoleMappingRepository;
    private final SecPermRepository secPermRepository;
    /** SEC_MENU·SEC_OBJ 전수 목록 캐시 — 사용자별 권한 필터는 요청마다 여기서 한다. */
    private final MenuCatalog menuCatalog;
    private final SecMenuFldLovRepository secMenuFldLovRepository;
    private final PasswordHasher passwordHasher;
    private final SecurityIdentity securityIdentity;
    private final AuditLogger auditLogger;
    private final PasswordPolicyEvaluator passwordPolicyEvaluator;
    /** SYSADMIN 브레이크글라스 — true 시 메뉴/버튼 舊 전면통과 복원 (기본 false = 매핑 기반, 2026-07-30). */
    private final boolean sysadminFreepass;

    public SecUserService(UserAccountRepository userAccountRepository,
                          SecUserMappingRepository secUserMappingRepository,
                          SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                          SecRoleMappingRepository secRoleMappingRepository,
                          SecPermRepository secPermRepository,
                          MenuCatalog menuCatalog,
                          SecMenuFldLovRepository secMenuFldLovRepository,
                          PasswordHasher passwordHasher,
                          SecurityIdentity securityIdentity,
                          AuditLogger auditLogger,
                          PasswordPolicyEvaluator passwordPolicyEvaluator,
                          @Value("${mcm.security.sysadmin-freepass:false}") boolean sysadminFreepass) {
        this.userAccountRepository = userAccountRepository;
        this.secUserMappingRepository = secUserMappingRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.secRoleMappingRepository = secRoleMappingRepository;
        this.secPermRepository = secPermRepository;
        this.menuCatalog = menuCatalog;
        this.secMenuFldLovRepository = secMenuFldLovRepository;
        this.passwordHasher = passwordHasher;
        this.securityIdentity = securityIdentity;
        this.auditLogger = auditLogger;
        this.passwordPolicyEvaluator = passwordPolicyEvaluator;
        this.sysadminFreepass = sysadminFreepass;
    }

    // ─────────────────────────────────────────────────────────────────────
    // BPMN action=search
    // ─────────────────────────────────────────────────────────────────────

    /** BPMN action=search */
    public List<UserAccount> searchUsers(SecUserSearchRequest request) {
        List<UserAccount> all = userAccountRepository.findAll();
        return all.stream()
                .filter(u -> isBlank(request.getUserId()) || (u.getUserId() != null && u.getUserId().contains(request.getUserId())))
                .filter(u -> isBlank(request.getUserNm()) || (u.getUserNm() != null && u.getUserNm().contains(request.getUserNm())))
                .filter(u -> isBlank(request.getUseYn()) || request.getUseYn().equals(u.getUseYn()))
                .filter(u -> isBlank(request.getDeptCd()) || request.getDeptCd().equals(u.getDeptCd()))
                .toList();
    }

    // ─────────────────────────────────────────────────────────────────────
    // BPMN action=save
    // ─────────────────────────────────────────────────────────────────────

    /**
     * BPMN action=save — C/U/D 통합. 갭 #17 사용자 변경 audit + 비번 정책 적용.
     */
    public int saveUsers(List<Map<String, Object>> master) {
        return auditLogger.record("USER_SAVE", "SecUser", master, () -> doSaveUsers(master));
    }

    private int doSaveUsers(List<Map<String, Object>> master) {
        if (master == null) return 0;

        List<ErrorDetail> errors = new ArrayList<>();
        int count = 0;

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> row = master.get(i);
            String rowKey = (String) row.get("rowKey");
            String rowStatus = (String) row.get("rowStatus");
            String userId = (String) row.get("userId");

            if ("C".equals(rowStatus)) {
                if (isBlank(userId)) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "userId", "E001", "사용자ID는 필수입니다."));
                    continue;
                }
                if (userAccountRepository.existsById(userId)) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "userId", "E003", "이미 존재하는 사용자ID입니다."));
                    continue;
                }
                String rawPass = (String) row.get("userPass");
                if (isBlank(rawPass)) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "userPass", "E002", "비밀번호는 필수입니다."));
                    continue;
                }
                try {
                    passwordPolicyEvaluator.validate(rawPass, userId);
                } catch (BusinessException pe) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "userPass", "E002", pe.getMessage()));
                    continue;
                }

                UserAccount entity = newUserAccount();
                entity.setUserNm((String) row.get("userNm"));
                entity.setUserEmpNo((String) row.get("userNo"));
                String hashed = passwordHasher.encode(rawPass);
                entity.setUserPass(hashed);
                entity.setUseYn(defaultIfBlank((String) row.get("useYn"), "Y"));
                entity.setLockYn(defaultIfBlank((String) row.get("lockYn"), "N"));
                entity.setTryCnt(0);
                entity.setPassInitYn(defaultIfBlank((String) row.get("passInitYn"), "N"));
                entity.setPassSetDd(LocalDate.now());
                entity.setDeptCd((String) row.get("deptCd"));
                UserAccount toSave = createNewUserAccount(userId, entity);
                userAccountRepository.save(toSave);
                count++;

            } else if ("U".equals(rowStatus)) {
                if (isBlank(userId)) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "userId", "E001", "사용자ID는 필수입니다."));
                    continue;
                }
                Optional<UserAccount> opt = userAccountRepository.findById(userId);
                if (opt.isEmpty()) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "userId", "E004", "사용자를 찾을 수 없습니다."));
                    continue;
                }
                UserAccount entity = opt.get();
                if (row.containsKey("userNm"))   entity.setUserNm((String) row.get("userNm"));
                if (row.containsKey("userNo"))   entity.setUserEmpNo((String) row.get("userNo"));
                if (row.containsKey("useYn"))    entity.setUseYn((String) row.get("useYn"));
                if (row.containsKey("lockYn"))   entity.setLockYn((String) row.get("lockYn"));
                if (row.containsKey("deptCd"))   entity.setDeptCd((String) row.get("deptCd"));

                String rawPass = (String) row.get("userPass");
                if (!isBlank(rawPass)) {
                    try {
                        passwordPolicyEvaluator.validate(rawPass, userId);
                    } catch (BusinessException pe) {
                        errors.add(ErrorDetail.ofGrid("master", rowKey, i, "userPass", "E002", pe.getMessage()));
                        continue;
                    }
                    String hashed = passwordHasher.encode(rawPass);
                    entity.setUserPass(hashed);
                    entity.setPassSetDd(LocalDate.now());
                    entity.setPassInitYn("N");
                }
                userAccountRepository.save(entity);
                count++;

            } else if ("D".equals(rowStatus)) {
                if (isBlank(userId)) continue;
                // 신규 chain: 사용자 삭제 시 SecUserMapping (USER → RoleGroup) 도 동반 정리.
                // legacy SecUserRole (USER → Role) 흡수 매핑. 사용자 단위 벌크 DELETE 1회.
                secUserMappingRepository.bulkDeleteByUserId(userId);
                userAccountRepository.deleteById(userId);
                count++;
            }
        }

        if (!errors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.", errors);
        }
        return count;
    }

    // ─────────────────────────────────────────────────────────────────────
    // BPMN action=resetPassword
    // ─────────────────────────────────────────────────────────────────────

    /**
     * BPMN action=resetPassword. 임시 비번 발급 + passInitYn='Y'.
     *
     * <p>Phase R3 변경 — legacy SecUserPwHis 적재 폐기 (Phase R7 일괄 삭제 대상).
     * 신규 SecUserPwd 흡수 (W5) 는 commUserMng 화면 service 가 담당. 본 mcm-core SecUserService
     * 는 UserAccount.setUserPass + 임시 비번 반환 / passInitYn='Y' 만 처리.
     */
    public Map<String, Object> resetPassword(MyMenusRequest request) {
        return auditLogger.record("USER_RESET_PW", "SecUser", request, () -> doResetPassword(request));
    }

    @SuppressWarnings("deprecation")
    private Map<String, Object> doResetPassword(MyMenusRequest request) {
        String targetUserId = request.getUserId();
        if (isBlank(targetUserId)) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "userId 는 필수입니다.");
        }
        UserAccount user = userAccountRepository.findById(targetUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "사용자를 찾을 수 없습니다."));

        String tempPassword = generateTempPassword();
        String hashed = passwordHasher.encode(tempPassword);
        user.setUserPass(hashed);
        user.setPassInitYn("Y");
        user.setPassSetDd(LocalDate.now());
        user.setTryCnt(0);
        user.setLockYn("N");
        userAccountRepository.save(user);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", targetUserId);
        result.put("temporaryPassword", tempPassword);
        result.put("reset", true);
        return result;
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
     *   <li>{@code rowSeq} 정렬 → {@code fullSeq} 정렬 (legacy ROW_SEQ NUMERIC 정렬 → 신규 FULL_SEQ
     *       VARCHAR 사전순 정렬 — As-Is 의도 보존)</li>
     *   <li>{@code uprLvMenuId} (legacy) → {@code parentMenuId} (W2)</li>
     *   <li>{@code menuType} 'dir' 분류 / {@code serviceUrl} / {@code param} / {@code sq} 등
     *       legacy-only 필드는 신규 SecMenu 에 없음 — 응답에서 제거 또는 null 채움.</li>
     * </ul>
     */
    public List<Map<String, Object>> getMyMenus(MyMenusRequest request /* userId 무시 */) {
        String userId = securityIdentity.requireUserId();
        // 메뉴·OBJECT 전수 목록은 카탈로그 캐시(사용자 무관) — 같은 스냅샷 하나에서 둘 다 읽는다.
        MenuCatalog.Snapshot catalog = menuCatalog.snapshot();
        // useTp='Y' 만 보존, FULL_SEQ 정렬
        List<SecMenu> allMenus = catalog.menus().stream()
                .filter(m -> "Y".equals(m.getUseTp()))
                .sorted(Comparator.comparing(SecMenu::getFullSeq,
                        Comparator.nullsLast(Comparator.naturalOrder())))
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
            row.put("rowSeq",      fld.get("FULL_SEQ"));
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
            row.put("rowSeq",      menu.getFullSeq());
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
            // 2026-06-05 Phase 1 — DB derived componentPath = PARENT_MENU_ID + "/" + OBJECT_ID.
            //   FE Sidebar 가 본 값을 그대로 사용해 page-components/{PARENT_MENU_ID}/{OBJECT_ID}/page.tsx 동적 import.
            //   PARENT_MENU_ID 가 group 토큰 (cma/csa/cme) 이고 OBJECT_ID 가 camelCase leaf 토큰이라는 규약 정합 (reference_naming_standards §A.3).
            //   둘 중 하나라도 null/blank 면 componentPath = null (FE 가 fallback 으로 sysCd+objId 조립 유지).
            String parentMenuId = menu.getParentMenuId();
            if (objectId != null && !objectId.isBlank() && parentMenuId != null && !parentMenuId.isBlank()) {
                row.put("componentPath", parentMenuId + "/" + objectId);
            } else {
                row.put("componentPath", null);
            }
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

    /** 임시 비번 발급. 8자리 영숫자. */
    private String generateTempPassword() {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        Random random = new Random();
        StringBuilder sb = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            sb.append(alphabet.charAt(random.nextInt(alphabet.length())));
        }
        return sb.toString();
    }

    /**
     * 신규 UserAccount 빈 인스턴스. 사이트 어댑터가 빈 SecUser 를 감싼 어댑터를 반환.
     */
    private UserAccount newUserAccount() {
        return new TransientUserAccount();
    }

    private UserAccount createNewUserAccount(String userId, UserAccount template) {
        if (template instanceof TransientUserAccount t) {
            t.setUserId(userId);
            return t;
        }
        return template;
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
        Set<String> roleIds = resolveRoleIds(userId);
        if (roleIds.isEmpty()) return List.of();
        if (sysadminFreepass
                && (roleIds.contains("SYSADMIN") || roleIds.contains("ROLE_SYSADMIN"))) {
            return allMenus;
        }
        List<SecRoleMapping> mappings = secRoleMappingRepository.findByRoleIdIn(roleIds);
        Set<String> allowedObjectIds = new HashSet<>();
        for (SecRoleMapping rm : mappings) {
            if (rm.getObjectId() != null) allowedObjectIds.add(rm.getObjectId());
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
        nodes.sort((a, b) -> {
            String sa = String.valueOf(a.get("rowSeq") == null ? "" : a.get("rowSeq"));
            String sb = String.valueOf(b.get("rowSeq") == null ? "" : b.get("rowSeq"));
            return sa.compareTo(sb);
        });
        for (Map<String, Object> node : nodes) {
            List<Map<String, Object>> children = (List<Map<String, Object>>) node.get("items");
            if (children != null && !children.isEmpty()) {
                sortTree(children);
            }
        }
    }

    private boolean isBlank(String s) { return s == null || s.isBlank(); }

    private String defaultIfBlank(String value, String fallback) {
        return isBlank(value) ? fallback : value;
    }
}
