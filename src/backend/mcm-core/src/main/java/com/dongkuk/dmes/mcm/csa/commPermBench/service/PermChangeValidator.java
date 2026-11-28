/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: 초안 변경 검사 — 구조(V-004)·중복(V-008)·SYSADMIN(V-003·V-009)·빈 BTN(V-001)·오브젝트 허용 값(V-002). saveDraft(b2)·apply(b4) 공용
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermChangeLookup.ObjAllowed;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 오류 = {@link BusinessException} 메시지 {@code CODE: 상세}.
 * <ul>
 *   <li>{@link #parse}: 요청 행 → {@link PermChange}(V-004 구조·정리). {@code PERM_BAD_VALUE}</li>
 *   <li>{@link #check(List, Mode)}: 변경 목록 검사. 순서 = V-008 중복(PERM_BAD_VALUE) → (APPLY 만) XV-003 대상 없음(NOT_FOUND)
 *       → V-003·V-009 SYSADMIN(PERM_FORBIDDEN) → V-001 빈 BTN(PERM_EMPTY_BTN) → V-002 허용 값 밖(PERM_NOT_IN_OBJ).</li>
 *   <li>{@link #validate} = parse + check(SAVE) — saveDraft 용.</li>
 * </ul>
 *
 * <p><b>b4(apply) 계약</b>: 저장된 초안을 {@code PermDraftService.parseChanges} 로 읽어 {@code check(changes, Mode.APPLY)} 를 부른다.
 * 기능설계서 검증 순서(V-004 → V-008 → XV-003 → V-003 → V-009 → V-001 → V-002)와 같다. 두 모드의 차이는 하나다 —
 * 대상(사람·그룹·역할·오브젝트)이 DB 에 없을 때 SAVE 는 오브젝트만 {@code PERM_BAD_VALUE}(ROLE_OBJ ADD·UPD 의 값 검사에 필요해서),
 * APPLY 는 모두 {@code NOT_FOUND: 변경 대상이 없습니다: {키}}(키 = {@code user:ID}·{@code group:ID}·{@code role:ID}·{@code object:ID}, 정렬 순서 첫 건).
 * 이미 있는 ADD·없는 DEL 은 오류가 아니다(no-op). DEL 은 지울 것이 사라져도 되므로 존재 확인을 하지 않는다 —
 * 단 ROLE_OBJ DEL 의 역할은 존재해야 한다(키 1 은 항상 확인).
 * 오류 코드 {@code NOT_FOUND} 는 ErrorCode 에 404 항목이 없어 {@code INVALID_VALUE}(400)로 던지고 메시지 앞 코드로 구분한다.
 */
@Component
public class PermChangeValidator {

    /** 검사 모드. */
    public enum Mode { SAVE, APPLY }

    static final String NOT_FOUND = "NOT_FOUND";
    static final String BAD_VALUE = "PERM_BAD_VALUE";
    static final String FORBIDDEN = "PERM_FORBIDDEN";
    static final String EMPTY_BTN = "PERM_EMPTY_BTN";
    static final String NOT_IN_OBJ = "PERM_NOT_IN_OBJ";

    private static final Set<String> TPS = Set.of(PermChange.USER_GRP, PermChange.GRP_ROLE, PermChange.ROLE_OBJ);
    private static final Set<String> OPS = Set.of(PermChange.ADD, PermChange.DEL, PermChange.UPD);

    private final PermChangeLookup lookup;

    public PermChangeValidator(PermChangeLookup lookup) {
        this.lookup = lookup;
    }

    public List<PermChange> validate(List<Map<String, Object>> rows) {
        List<PermChange> changes = parse(rows);
        check(changes, Mode.SAVE);
        return changes;
    }

    /**
     * 요청 행 → PermChange. TP·OP 는 trim·대문자, 요청 행 키는 대소문자 무시. ROLE_OBJ ADD·UPD 의 BTN·POPUP 은 쉼표 목록을
     * {@link PermTokens} 로 정리하고, 링크 변경과 ROLE_OBJ DEL 의 BTN·POPUP 은 버린다. USER_GRP·GRP_ROLE 은 ADD·DEL 만.
     */
    public static List<PermChange> parse(List<Map<String, Object>> rows) {
        List<PermChange> out = new ArrayList<>();
        if (rows == null) {
            return out;
        }
        int line = 0;
        for (Map<String, Object> raw : rows) {
            line++;
            if (raw == null) {
                throw bad(line, "빈 행");
            }
            Map<String, Object> r = upperKeys(raw);
            String tp = text(r.get("TP")).toUpperCase(Locale.ROOT);
            String op = text(r.get("OP")).toUpperCase(Locale.ROOT);
            String key1 = text(r.get("KEY1"));
            String key2 = text(r.get("KEY2"));
            if (!TPS.contains(tp)) {
                throw bad(line, "TP 는 USER_GRP, GRP_ROLE, ROLE_OBJ 중 하나여야 합니다 (" + tp + ")");
            }
            if (!OPS.contains(op)) {
                throw bad(line, "OP 는 ADD, DEL, UPD 중 하나여야 합니다 (" + op + ")");
            }
            if (key1.isEmpty() || key2.isEmpty()) {
                throw bad(line, "KEY1, KEY2 는 비어 있을 수 없습니다");
            }
            if (!PermChange.ROLE_OBJ.equals(tp)) {
                if (PermChange.UPD.equals(op)) {
                    throw bad(line, tp + " 는 ADD, DEL 만 쓸 수 있습니다");
                }
                out.add(PermChange.link(tp, key1, key2, op));
            } else if (PermChange.DEL.equals(op)) {
                out.add(PermChange.roleObj(key1, key2, op, null, null));
            } else {
                out.add(PermChange.roleObj(key1, key2, op,
                        PermTokens.join(PermTokens.parse(text(r.get("BTN_PERM")))),
                        PermTokens.join(PermTokens.parse(text(r.get("POPUP_PERM"))))));
            }
        }
        return out;
    }

    /** 변경 목록 검사(이미 정리된 PermChange). */
    public void check(List<PermChange> changes, Mode mode) {
        if (changes == null || changes.isEmpty()) {
            return;
        }
        checkDuplicates(changes);
        if (mode == Mode.APPLY) {
            checkTargetsExist(changes);
        }
        checkSysadmin(changes);
        checkRoleObjValues(changes);
    }

    // V-008
    private static void checkDuplicates(List<PermChange> changes) {
        Set<String> seen = new HashSet<>();
        for (PermChange c : changes) {
            if (!seen.add(c.tp() + "|" + c.key1() + "|" + c.key2())) {
                throw new BusinessException(ErrorCode.INVALID_VALUE,
                        BAD_VALUE + ": 같은 변경이 두 번 들어 있습니다 (" + c.tp() + "/" + c.key1() + "/" + c.key2() + ")");
            }
        }
    }

    // XV-003 (APPLY)
    private void checkTargetsExist(List<PermChange> changes) {
        Set<String> users = new LinkedHashSet<>();
        Set<String> groups = new LinkedHashSet<>();
        Set<String> roles = new LinkedHashSet<>();
        Set<String> objects = new LinkedHashSet<>();
        for (PermChange c : changes) {
            boolean del = PermChange.DEL.equals(c.op());
            switch (c.tp()) {
                case PermChange.USER_GRP -> {
                    if (!del) {
                        users.add(c.key1());
                        groups.add(c.key2());
                    }
                }
                case PermChange.GRP_ROLE -> {
                    if (!del) {
                        groups.add(c.key1());
                        roles.add(c.key2());
                    }
                }
                case PermChange.ROLE_OBJ -> {
                    roles.add(c.key1());
                    if (!del) {
                        objects.add(c.key2());
                    }
                }
                default -> { }
            }
        }
        List<String> missing = new ArrayList<>();
        missing(missing, "user:", users, lookup.existing(PermChangeLookup.Target.USER, users));
        missing(missing, "group:", groups, lookup.existing(PermChangeLookup.Target.GROUP, groups));
        missing(missing, "role:", roles, lookup.existing(PermChangeLookup.Target.ROLE, roles));
        missing(missing, "object:", objects, objects.isEmpty() ? Set.of() : lookup.objectAllowed(objects).keySet());
        if (!missing.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, NOT_FOUND + ": 변경 대상이 없습니다: " + missing.get(0));
        }
    }

    private static void missing(List<String> out, String prefix, Set<String> wanted, Set<String> found) {
        for (String id : wanted) {
            if (!found.contains(id)) {
                out.add(prefix + id);
            }
        }
    }

    // V-003 · V-009
    private void checkSysadmin(List<PermChange> changes) {
        // 이 요청이 SYSADMIN 을 그룹에 붙이는 경우도 「SYSADMIN 을 가진 그룹」으로 본다(보수적 — DEL 은 빼지 않는다)
        // m19 — SYSADMIN 전용 오브젝트(dbViewer 등) 퍼미션을 가진 역할도 SYSADMIN 과 같이 다룬다(민감한 역할).
        boolean anyLink = false;
        for (PermChange c : changes) {
            if (PermChange.GRP_ROLE.equals(c.tp()) || PermChange.USER_GRP.equals(c.tp())) anyLink = true;
        }
        Set<String> objRoles = anyLink ? lookup.rolesWithSysadminOnlyObjects() : Set.of();
        java.util.function.Predicate<String> sensitiveRole = r -> isSysadmin(r) || (r != null && objRoles.contains(r));
        Set<String> groupsWithSysadmin = new HashSet<>();
        List<String> userGrpGroups = new ArrayList<>();
        for (PermChange c : changes) {
            if (PermChange.GRP_ROLE.equals(c.tp()) && sensitiveRole.test(c.key2()) && PermChange.ADD.equals(c.op())) {
                groupsWithSysadmin.add(c.key1());
            }
            if (PermChange.USER_GRP.equals(c.tp())) {
                userGrpGroups.add(c.key2());
            }
        }
        Set<String> toLookup = new LinkedHashSet<>(userGrpGroups);
        toLookup.removeAll(groupsWithSysadmin);
        if (!toLookup.isEmpty()) {
            lookup.rolesOfGroups(toLookup).forEach((g, roles) -> {
                if (roles != null && roles.stream().anyMatch(sensitiveRole)) {
                    groupsWithSysadmin.add(g);
                }
            });
        }

        Boolean sysadminUser = null;
        for (PermChange c : changes) {
            boolean involves;
            String who;
            switch (c.tp()) {
                case PermChange.GRP_ROLE -> {
                    involves = sensitiveRole.test(c.key2());
                    who = c.key2();
                }
                case PermChange.ROLE_OBJ -> {
                    // m19 — SYSADMIN 전용 오브젝트 퍼미션을 주고 빼는 일도 SYSADMIN 만
                    involves = isSysadmin(c.key1()) || com.dongkuk.dmes.mcm.csa.commPerm.SysadminGuard.isSysadminOnlyObject(c.key2());
                    who = isSysadmin(c.key1()) ? c.key1() : c.key2();
                    if (isSysadmin(c.key1()) && !PermChange.DEL.equals(c.op())) {
                        // V-003: SYSADMIN 은 퍼미션 행이 없다(D13) — 값 편집은 누구도 못 한다
                        throw new BusinessException(ErrorCode.ACCESS_DENIED,
                                FORBIDDEN + ": " + who + " 시스템 관리자 역할의 퍼미션은 바꿀 수 없습니다");
                    }
                }
                case PermChange.USER_GRP -> {
                    involves = groupsWithSysadmin.contains(c.key2());
                    who = c.key2();
                }
                default -> {
                    involves = false;
                    who = null;
                }
            }
            if (!involves) {
                continue;
            }
            if (sysadminUser == null) {
                sysadminUser = lookup.currentUserIsSysadmin();
            }
            if (!sysadminUser) {
                throw new BusinessException(ErrorCode.ACCESS_DENIED,
                        FORBIDDEN + ": " + who + " 시스템 관리자 권한이 걸린 변경은 시스템 관리자만 할 수 있습니다");
            }
        }
    }

    // V-001 · V-002
    private void checkRoleObjValues(List<PermChange> changes) {
        List<PermChange> edits = new ArrayList<>();
        for (PermChange c : changes) {
            if (PermChange.ROLE_OBJ.equals(c.tp()) && !PermChange.DEL.equals(c.op())) {
                edits.add(c);
            }
        }
        if (edits.isEmpty()) {
            return;
        }
        for (PermChange c : edits) {
            if (PermTokens.parse(c.btnPerm()).isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, EMPTY_BTN + ": " + c.key1() + "/" + c.key2());
            }
        }
        Set<String> objectIds = new LinkedHashSet<>();
        edits.forEach(c -> objectIds.add(c.key2()));
        Map<String, ObjAllowed> allowed = lookup.objectAllowed(objectIds);
        for (PermChange c : edits) {
            ObjAllowed a = allowed.get(c.key2());
            if (a == null) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, BAD_VALUE + ": 없는 오브젝트입니다 (" + c.key2() + ")");
            }
            List<String> extra = new ArrayList<>(PermTokens.notIn(PermTokens.parse(c.btnPerm()), a.btnPerm()));
            extra.addAll(PermTokens.notIn(PermTokens.parse(c.popupPerm()), a.popupPerm()));
            if (!extra.isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_VALUE,
                        NOT_IN_OBJ + ": " + c.key1() + "/" + c.key2() + "/" + PermTokens.join(extra));
            }
        }
    }

    static boolean isSysadmin(String roleId) {
        return PermResolver.SYSADMIN_ROLE.equals(roleId) || ("ROLE_" + PermResolver.SYSADMIN_ROLE).equals(roleId);
    }

    private static BusinessException bad(int line, String detail) {
        return new BusinessException(ErrorCode.INVALID_VALUE,
                BAD_VALUE + ": 초안 변경 값이 올바르지 않습니다 (" + line + "번째 줄: " + detail + ")");
    }

    private static Map<String, Object> upperKeys(Map<String, Object> raw) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            if (e.getKey() != null) {
                m.putIfAbsent(e.getKey().toUpperCase(Locale.ROOT), e.getValue());
            }
        }
        return m;
    }

    private static String text(Object o) {
        return o == null ? "" : o.toString().trim();
    }
}
