/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commPermMng OASIS BPMN serviceTask entry point
 *       2026-11-27 @jongik-sv: 퍼미션 모델 v2 — 한 줄 = 역할×오브젝트 퍼미션(TB_MCM_SEC_ROLE_PERM).
 *       action 4개(lov·search·searchPermOne·save). 옛 PERMISSION_ID 묶음(TB_MCM_SEC_PERM) 읽기·쓰기 삭제(D10)
 */
package com.dongkuk.dmes.mcm.csa.commPermMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commPermMng.dto.CommPermMngPermOneRequest;
import com.dongkuk.dmes.mcm.csa.commPermMng.dto.CommPermMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commPermMng.query.CommPermMngQuery;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecRole;
import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.entity.SecRolePermId;
import com.dongkuk.dmes.mcm.repository.CommPermQueryRepository;
import com.dongkuk.dmes.mcm.repository.CommPermQueryRepository.ObjMenu;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * commPermMng(퍼미션 관리) — OASIS BPMN serviceTask entry point.
 *
 * <p>Spring bean {@code commPermMngService} → BPMN {@code camunda:class}. 한 줄 = 역할 × 오브젝트 퍼미션 한 건
 * ({@code TB_MCM_SEC_ROLE_PERM}, PK ROLE_ID·OBJECT_ID). 옛 {@code TB_MCM_SEC_PERM} 은 남기되 읽지도 쓰지도 않는다(D10).
 *
 * <p>action(= BPMN sequenceFlow name):
 * <ol>
 *   <li>{@code lov} → {@link #lov()} — 역할·메뉴 폴더 고르기 목록</li>
 *   <li>{@code search} → {@link #searchCmPerm(CommPermMngSearchRequest)} — 퍼미션 목록(필터·페이지)</li>
 *   <li>{@code searchPermOne} → {@link #searchPermOne(CommPermMngPermOneRequest)} — 고른 줄 곁 정보</li>
 *   <li>{@code save} → {@link #saveCmPerm(List)} — MERGE·DEL 일괄 저장(전부 검사 뒤 쓰기)</li>
 * </ol>
 *
 * <p>SYSADMIN 은 퍼미션 행 없이 모든 권한을 받는다(D13). 그래서 조회·고르기 목록에서 빼고 저장은 거절한다.
 * {@code @Transactional} 없음 — OASIS 가 BPMN 프로세스 하나를 트랜잭션 하나로 감싼다.
 * 감사 칼럼은 {@code McmAuditListener} 가 채운다.
 */
@Service("commPermMngService")
public class CommPermMngService {

    static final int DEFAULT_PAGE_SIZE = 100;
    static final int MAX_PAGE_SIZE = 1000;
    /** TB_MCM_SEC_ROLE_PERM 값 칼럼 길이(VARCHAR 1000). */
    static final int MAX_VALUE_LEN = 1000;

    static final String OP_MERGE = "MERGE";
    static final String OP_DEL = "DEL";

    private final SecRolePermRepository secRolePermRepository;
    private final SecRoleRepository secRoleRepository;
    private final SecObjRepository secObjRepository;
    private final CommPermQueryRepository commPermQueryRepository;
    private final CommPermMngQuery commPermMngQuery;
    private final ApplicationEventPublisher eventPublisher;

    public CommPermMngService(SecRolePermRepository secRolePermRepository,
                              SecRoleRepository secRoleRepository,
                              SecObjRepository secObjRepository,
                              CommPermQueryRepository commPermQueryRepository,
                              CommPermMngQuery commPermMngQuery,
                              ApplicationEventPublisher eventPublisher) {
        this.secRolePermRepository = secRolePermRepository;
        this.secRoleRepository = secRoleRepository;
        this.secObjRepository = secObjRepository;
        this.commPermQueryRepository = commPermQueryRepository;
        this.commPermMngQuery = commPermMngQuery;
        this.eventPublisher = eventPublisher;
    }

    // ────────────────────────────────────────────────────────────────
    // action: lov
    // ────────────────────────────────────────────────────────────────

    /**
     * 고르기 목록. grids {@code roles}(ROLE_ID·ROLE_NM·USE_TP, SYSADMIN 제외, ROLE_ID 순) ·
     * {@code menus}(모듈·폴더, {@link CommPermQueryRepository#folderLov()}).
     */
    public Map<String, Object> lov() {
        List<Map<String, Object>> roles = new ArrayList<>();
        for (SecRole r : secRoleRepository.findAll(Sort.by("roleId"))) {
            if (CommPermQueryRepository.isSysadmin(r.getRoleId())) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ROLE_ID", r.getRoleId());
            m.put("ROLE_NM", r.getRoleNm());
            m.put("USE_TP", r.getUseTp());
            roles.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("roles", roles);
        out.put("menus", commPermQueryRepository.folderLov());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search
    // ────────────────────────────────────────────────────────────────

    /**
     * 퍼미션 목록. grids {@code perms} + 최상위 {@code TOTAL_CNT}(페이지 자르기 전 줄 수).
     *
     * <p>줄 = 퍼미션 행(HAS_PERM=Y, SYSADMIN 제외). showEmpty=Y 이고 역할을 고르면 그 역할의 퍼미션이 없는
     * 오브젝트(USE_TP 무관)마다 HAS_PERM=N 줄을 더한다. 필터 = roleId(같음) · menuId(폴더 하위 트리에 메뉴가 있는
     * 오브젝트) · objectQ(ID·이름 부분 일치) · codeQ(Y 줄 = 퍼미션 BTN·POPUP, N 줄 = 오브젝트 허용 BTN·POPUP 토큰 부분 일치).
     * 대소문자는 무시한다. 정렬 = ROLE_ID → 메뉴 트리 순서(메뉴 없는 오브젝트는 뒤) → OBJECT_ID.
     *
     * <p>필터·정렬·페이지는 메모리에서 한다. 오브젝트 ≈ 1,000 × 역할 ≈ 20 규모라 전체 적재가 SQL 페이지보다
     * 단순하고 충분히 빠르다. 규모가 커지면 SQL 페이지로 옮긴다.
     */
    public Map<String, Object> searchCmPerm(CommPermMngSearchRequest request) {
        String roleId = trimToNull(request != null ? request.getRoleId() : null);
        String menuId = trimToNull(request != null ? request.getMenuId() : null);
        String objectQ = lower(request != null ? request.getObjectQ() : null);
        String codeQ = lower(request != null ? request.getCodeQ() : null);
        boolean showEmpty = request != null && "Y".equalsIgnoreCase(trimToNull(request.getShowEmpty()));
        int pageNo = parsePositive(request != null ? request.getPageNo() : null, 1);
        int pageSize = Math.min(parsePositive(request != null ? request.getPageSize() : null, DEFAULT_PAGE_SIZE),
                MAX_PAGE_SIZE);

        Map<String, SecRole> roles = new HashMap<>();
        for (SecRole r : secRoleRepository.findAll()) roles.put(r.getRoleId(), r);
        Map<String, SecObj> objs = new HashMap<>();
        for (SecObj o : secObjRepository.findAll()) objs.put(o.getObjectId(), o);
        Map<String, ObjMenu> objMenus = commPermQueryRepository.objMenus();
        Set<String> menuObjIds = menuId == null ? null : commPermMngQuery.objectIdsUnderFolder(menuId);

        List<SecRolePerm> perms = roleId == null ? secRolePermRepository.findAll()
                : secRolePermRepository.findByRoleId(roleId);

        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> permObjIdsOfRole = new HashSet<>();
        for (SecRolePerm p : perms) {
            if (CommPermQueryRepository.isSysadmin(p.getRoleId())) continue;
            if (roleId != null) permObjIdsOfRole.add(p.getObjectId());
            SecObj obj = objs.get(p.getObjectId());
            if (!objMatches(p.getObjectId(), obj, menuObjIds, objectQ)) continue;
            if (!codeMatches(codeQ, p.getBtnPerm(), p.getPopupPerm())) continue;
            rows.add(permRow(p.getRoleId(), roles.get(p.getRoleId()), p.getObjectId(), obj,
                    objMenus.get(p.getObjectId()), p));
        }

        if (showEmpty && roleId != null && !CommPermQueryRepository.isSysadmin(roleId) && roles.containsKey(roleId)) {
            for (SecObj obj : objs.values()) {
                if (permObjIdsOfRole.contains(obj.getObjectId())) continue;
                if (!objMatches(obj.getObjectId(), obj, menuObjIds, objectQ)) continue;
                if (!codeMatches(codeQ, obj.getBtnPerm(), obj.getPopupPerm())) continue;
                rows.add(permRow(roleId, roles.get(roleId), obj.getObjectId(), obj,
                        objMenus.get(obj.getObjectId()), null));
            }
        }

        rows.sort(Comparator
                .comparing((Map<String, Object> m) -> (String) m.get("ROLE_ID"))
                .thenComparing(m -> sortKeyOf(objMenus, m), Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(m -> (String) m.get("OBJECT_ID")));

        int total = rows.size();
        long from = (long) (pageNo - 1) * pageSize;
        List<Map<String, Object>> page = from >= total ? new ArrayList<>()
                : new ArrayList<>(rows.subList((int) from, (int) Math.min(total, from + pageSize)));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("perms", page);
        out.put("TOTAL_CNT", total);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchPermOne
    // ────────────────────────────────────────────────────────────────

    /**
     * 고른 줄(역할×오브젝트) 곁 정보.
     * grids {@code others}(같은 오브젝트의 다른 역할 퍼미션 — ROLE_ID·ROLE_NM·BTN_PERM·POPUP_PERM, ROLE_ID 순) ·
     * {@code groups}(역할이 든 그룹 — ROLE_GROUP_ID·ROLE_GROUP_NM·USER_CNT) + 최상위 {@code USER_CNT}(그 역할을 받는 사람 수).
     */
    public Map<String, Object> searchPermOne(CommPermMngPermOneRequest request) {
        String roleId = trimToNull(request != null ? request.getRoleId() : null);
        String objectId = trimToNull(request != null ? request.getObjectId() : null);

        List<Map<String, Object>> others = new ArrayList<>();
        if (objectId != null) {
            Map<String, SecRole> roles = new HashMap<>();
            for (SecRole r : secRoleRepository.findAll()) roles.put(r.getRoleId(), r);
            List<SecRolePerm> perms = new ArrayList<>(secRolePermRepository.findByObjectId(objectId));
            perms.sort(Comparator.comparing(SecRolePerm::getRoleId));
            for (SecRolePerm p : perms) {
                if (p.getRoleId().equals(roleId) || CommPermQueryRepository.isSysadmin(p.getRoleId())) continue;
                SecRole r = roles.get(p.getRoleId());
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("ROLE_ID", p.getRoleId());
                m.put("ROLE_NM", r != null ? r.getRoleNm() : null);
                m.put("BTN_PERM", norm(p.getBtnPerm()));
                m.put("POPUP_PERM", norm(p.getPopupPerm()));
                others.add(m);
            }
        }

        List<Map<String, Object>> groups = new ArrayList<>();
        for (Map<String, Object> g : commPermQueryRepository.groupsOfRole(roleId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ROLE_GROUP_ID", g.get("ROLE_GROUP_ID"));
            m.put("ROLE_GROUP_NM", g.get("ROLE_GROUP_NM"));
            m.put("USER_CNT", g.get("USER_CNT"));
            groups.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("others", others);
        out.put("groups", groups);
        out.put("USER_CNT", roleId == null ? 0L : commPermQueryRepository.distinctUserCnt(List.of(roleId)));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: save
    // ────────────────────────────────────────────────────────────────

    /**
     * 퍼미션 일괄 저장. 입력 = grids {@code perms.rows}(ROLE_ID·OBJECT_ID·BTN_PERM·POPUP_PERM·DATA_PERM·OP_TP).
     *
     * <ul>
     *   <li>MERGE = PK upsert. 값은 토큰 정규화(trim·빈 값·중복 제거). BTN 이 비면 {@code PERM_EMPTY_BTN}(D14),
     *       BTN·POPUP 이 오브젝트 허용 값 밖이면 {@code PERM_NOT_IN_OBJ}(D15). DATA 는 정규화만(D21)</li>
     *   <li>DEL = 행이 있으면 지운다</li>
     *   <li>SYSADMIN 줄 = {@code PERM_SYSADMIN}(D13). 없는 역할·오브젝트 = {@code PERM_NO_ROLE}·{@code PERM_NO_OBJ}</li>
     *   <li>한 번에 같은 PK(ROLE_ID·OBJECT_ID)가 두 줄 = {@code PERM_BAD_ROW}(MERGE·DEL 섞여도)</li>
     * </ul>
     *
     * <p>모든 줄을 먼저 검사하고, 하나라도 틀리면 아무것도 쓰지 않는다. 오류 = {@link BusinessException},
     * 메시지가 코드로 시작한다(BusinessException 은 메시지 생성자만 있다).
     * 쓴 역할이 있으면 {@link RoleChangedEvent} 를 발행한다(D30).
     *
     * @return 최상위 {@code cnt_merge}·{@code cnt_delete}
     */
    public Map<String, Object> saveCmPerm(List<Map<String, Object>> perms) {
        List<SecRolePerm> merges = new ArrayList<>();
        List<SecRolePermId> deletes = new ArrayList<>();
        if (perms != null) {
            Map<String, Boolean> roleExists = new HashMap<>();
            Map<String, Optional<SecObj>> objCache = new HashMap<>();
            Map<SecRolePermId, Map<String, Object>> seen = new LinkedHashMap<>(); // PK 중복 검사
            for (Map<String, Object> row : perms) {
                if (row == null) continue;
                String roleId = trimToNull(strOf(row.get("ROLE_ID")));
                String objectId = trimToNull(strOf(row.get("OBJECT_ID")));
                String opTp = trimToNull(strOf(row.get("OP_TP")));
                String key = roleId + "/" + objectId;
                if (roleId == null || objectId == null) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_BAD_ROW: ROLE_ID·OBJECT_ID 가 비었습니다 (" + key + ")");
                }
                if (CommPermQueryRepository.isSysadmin(roleId)) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_SYSADMIN: SYSADMIN 은 퍼미션 행을 두지 않습니다 (" + key + ")");
                }
                SecRolePermId pk = new SecRolePermId(roleId, objectId);
                if (seen.put(pk, row) != null) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_BAD_ROW: 같은 ROLE_ID·OBJECT_ID 가 한 번에 두 번 왔습니다 (" + key + ")");
                }
                if (OP_DEL.equalsIgnoreCase(opTp)) {
                    deletes.add(pk);
                    continue;
                }
                if (!OP_MERGE.equalsIgnoreCase(opTp)) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_BAD_ROW: OP_TP 는 MERGE·DEL 만 됩니다 (" + key + " op=" + opTp + ")");
                }
                if (!roleExists.computeIfAbsent(roleId, secRoleRepository::existsById)) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_NO_ROLE: 없는 역할입니다 (" + key + ")");
                }
                SecObj obj = objCache.computeIfAbsent(objectId, secObjRepository::findById).orElse(null);
                if (obj == null) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_NO_OBJ: 없는 오브젝트입니다 (" + key + ")");
                }
                List<String> btn = PermTokens.parse(strOf(row.get("BTN_PERM")));
                List<String> popup = PermTokens.parse(strOf(row.get("POPUP_PERM")));
                List<String> data = PermTokens.parse(strOf(row.get("DATA_PERM")));
                if (btn.isEmpty()) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_EMPTY_BTN: 버튼 권한이 비었습니다 (" + key + ")");
                }
                List<String> badBtn = PermTokens.notIn(btn, PermTokens.parse(obj.getBtnPerm()));
                List<String> badPopup = PermTokens.notIn(popup, PermTokens.parse(obj.getPopupPerm()));
                if (!badBtn.isEmpty() || !badPopup.isEmpty()) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_NOT_IN_OBJ: " + key + " btn=" + badBtn + " popup=" + badPopup);
                }
                String btnVal = checkLen(key, "BTN_PERM", PermTokens.join(btn));
                String popupVal = checkLen(key, "POPUP_PERM", PermTokens.join(popup));
                String dataVal = checkLen(key, "DATA_PERM", PermTokens.join(data));
                merges.add(new SecRolePerm(roleId, objectId, btnVal,
                        popupVal.isEmpty() ? null : popupVal, dataVal.isEmpty() ? null : dataVal));
            }
        }

        // 쓰기 — 검사를 모두 통과한 뒤에만(전부 또는 없음)
        Set<String> touched = new LinkedHashSet<>();
        int cntMerge = 0;
        for (SecRolePerm in : merges) {
            SecRolePerm entity = secRolePermRepository.findById(in.id()).orElse(in);
            entity.setBtnPerm(in.getBtnPerm());
            entity.setPopupPerm(in.getPopupPerm());
            entity.setDataPerm(in.getDataPerm());
            secRolePermRepository.save(entity);
            touched.add(in.getRoleId());
            cntMerge++;
        }
        int cntDelete = 0;
        for (SecRolePermId id : deletes) {
            if (secRolePermRepository.existsById(id)) {
                secRolePermRepository.deleteById(id);
                touched.add(id.getRoleId());
                cntDelete++;
            }
        }
        if (!touched.isEmpty()) {
            eventPublisher.publishEvent(new RoleChangedEvent(touched));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cntMerge);
        out.put("cnt_delete", cntDelete);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // helpers
    // ────────────────────────────────────────────────────────────────

    /** 목록 한 줄. p 가 null 이면 HAS_PERM=N(퍼미션 없음) 줄. */
    private static Map<String, Object> permRow(String roleId, SecRole role, String objectId, SecObj obj,
                                               ObjMenu menu, SecRolePerm p) {
        String objBtn = obj != null ? obj.getBtnPerm() : null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ROLE_ID", roleId);
        m.put("ROLE_NM", role != null ? role.getRoleNm() : null);
        m.put("OBJECT_ID", objectId);
        m.put("OBJECT_NM", obj != null ? obj.getObjectNm() : null);
        m.put("MENU_PATH", menu != null ? menu.folderPath() : null);
        m.put("MENU_NM", menu != null ? menu.menuNm() : null);
        m.put("OBJ_BTN_PERM", norm(objBtn));
        m.put("OBJ_POPUP_PERM", norm(obj != null ? obj.getPopupPerm() : null));
        m.put("OBJ_READ_PERM", PermTokens.join(PermTokens.readPreset(PermTokens.parse(objBtn))));
        m.put("BTN_PERM", p != null ? norm(p.getBtnPerm()) : "");
        m.put("POPUP_PERM", p != null ? norm(p.getPopupPerm()) : "");
        m.put("DATA_PERM", p != null ? norm(p.getDataPerm()) : "");
        m.put("HAS_PERM", p != null ? "Y" : "N");
        return m;
    }

    /** 메뉴 폴더 조건·objectQ 조건. */
    private static boolean objMatches(String objectId, SecObj obj, Set<String> menuObjIds, String objectQ) {
        if (menuObjIds != null && !menuObjIds.contains(objectId)) return false;
        if (objectQ == null) return true;
        return contains(objectId, objectQ) || (obj != null && contains(obj.getObjectNm(), objectQ));
    }

    /** codeQ 가 btn·popup 토큰 하나에 부분 일치하는가(대소문자 무시). codeQ 가 비면 참. */
    private static boolean codeMatches(String codeQ, String btn, String popup) {
        if (codeQ == null) return true;
        for (String t : PermTokens.parse(btn)) if (contains(t, codeQ)) return true;
        for (String t : PermTokens.parse(popup)) if (contains(t, codeQ)) return true;
        return false;
    }

    private static String sortKeyOf(Map<String, ObjMenu> objMenus, Map<String, Object> row) {
        ObjMenu menu = objMenus.get((String) row.get("OBJECT_ID"));
        return menu != null ? menu.sortKey() : null;
    }

    private static String checkLen(String key, String col, String value) {
        if (value.length() > MAX_VALUE_LEN) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_TOO_LONG: " + key + " " + col + " 길이 " + value.length() + " > " + MAX_VALUE_LEN);
        }
        return value;
    }

    private static boolean contains(String value, String lowerQ) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(lowerQ);
    }

    /** 토큰 정규화. null·빈 값 = "". */
    private static String norm(String csv) {
        return PermTokens.join(PermTokens.parse(csv));
    }

    private static String trimToNull(String v) {
        if (v == null) return null;
        String s = v.trim();
        return s.isEmpty() ? null : s;
    }

    private static String lower(String v) {
        String s = trimToNull(v);
        return s == null ? null : s.toLowerCase(Locale.ROOT);
    }

    /** 양의 정수로 읽는다("2"·"2.0" 모두). 비었거나 1 미만·숫자 아님 = def. */
    private static int parsePositive(String v, int def) {
        String s = trimToNull(v);
        if (s == null) return def;
        try {
            double d = Double.parseDouble(s);
            if (d < 1 || d > Integer.MAX_VALUE) return def;
            return (int) d;
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
