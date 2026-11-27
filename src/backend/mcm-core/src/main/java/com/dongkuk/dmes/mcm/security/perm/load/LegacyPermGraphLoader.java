package com.dongkuk.dmes.mcm.security.perm.load;

import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 옛 모델 로더 — 퍼미션 = TB_MCM_SEC_ROLE_MAPPING(역할×오브젝트×PERMISSION_ID) ⋈ TB_MCM_SEC_PERM.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: {@code mcm.security.perm-model=legacy}(되돌림)일 때만 빈이 된다(D10). 옛 줄을 새 모양으로 바꾸는 규칙은 D11 과 같다.
 * <ul>
 *   <li>(역할, 오브젝트) 하나 = 행 하나. BTN = 그 줄들의 PERMISSION_COMMON ∪ PERMISSION_CUSTOM ∪ PERMISSION_ACTION, POPUP = POPUP_BTN 합집합</li>
 *   <li>없는 퍼미션을 가리키는 줄 = 토큰 없는 행(키 없음·메뉴 보임 — 옛 런타임과 같음). 퍼미션 USE_TP·유효 기간 = 보지 않음(D16)</li>
 *   <li>역할·그룹·오브젝트의 USE_TP·유효 기간 = 보지 않음. 모두 「쓰는 중」으로 싣는다(옛 런타임 r0 규칙, D35 되돌림)</li>
 *   <li>옛 오브젝트에는 허용 값이 없다 → 허용 값 = 그 오브젝트를 가리키는 옛 줄 전체(모든 역할)의 토큰 합집합.
 *       그래서 효과 교집합이 옛 계산과 같고, SYSADMIN = 옛 줄에 나온 토큰 전부가 된다(D12·D13 차이는 c3·r5 가 적는다)</li>
 * </ul>
 */
@Component
@ConditionalOnProperty(name = "mcm.security.perm-model", havingValue = "legacy")
public class LegacyPermGraphLoader extends AbstractPermGraphLoader {

    @Override
    protected boolean keepUsage() {
        return false;
    }

    /** 옛 퍼미션 한 건의 토큰. [0] = COMMON ∪ CUSTOM ∪ ACTION, [1] = POPUP_BTN. */
    private Map<String, Set<String>[]> permTokens() {
        Map<String, Set<String>[]> out = new LinkedHashMap<>();
        for (Object[] r : rows("SELECT PERMISSION_ID, PERMISSION_COMMON, PERMISSION_CUSTOM, PERMISSION_ACTION, POPUP_BTN FROM "
                + S + "TB_MCM_SEC_PERM", null)) {
            Set<String>[] t = newPair();
            t[0].addAll(PermTokens.parse(str(r[1])));
            t[0].addAll(PermTokens.parse(str(r[2])));
            t[0].addAll(PermTokens.parse(str(r[3])));
            t[1].addAll(PermTokens.parse(str(r[4])));
            out.put(str(r[0]), t);
        }
        return out;
    }

    /**
     * 없는 퍼미션을 가리키는 줄도 (역할, 오브젝트) 행은 만든다(토큰 없음) — 옛 메뉴 거르기는 매핑의 OBJECT_ID 만 봤다.
     */
    @Override
    protected Map<String, Map<String, RolePerm>> loadRolePerms(Set<String> roleIds) {
        Map<String, Set<String>[]> perms = permTokens();
        Map<String, Map<String, Set<String>[]>> acc = new LinkedHashMap<>();
        for (Object[] r : rows("SELECT ROLE_ID, OBJECT_ID, PERMISSION_ID FROM " + S + "TB_MCM_SEC_ROLE_MAPPING"
                + (roleIds == null ? "" : " WHERE ROLE_ID IN (:ids)") + " ORDER BY ROLE_ID, OBJECT_ID, PERMISSION_ID", roleIds)) {
            Set<String>[] t = acc.computeIfAbsent(str(r[0]), k -> new LinkedHashMap<>()).computeIfAbsent(str(r[1]), k -> newPair());
            addAll(t, perms.get(str(r[2])));
        }
        Map<String, Map<String, RolePerm>> out = new LinkedHashMap<>();
        acc.forEach((roleId, objs) -> objs.forEach((objectId, t) ->
                out.computeIfAbsent(roleId, k -> new LinkedHashMap<>()).put(objectId,
                        new RolePerm(roleId, objectId, new ArrayList<>(t[0]), new ArrayList<>(t[1]), null))));
        return out;
    }

    /** 허용 값 = 그 오브젝트를 가리키는 옛 줄 전체의 토큰 합집합. 사용 여부·유효 기간 = 보지 않음(옛 런타임과 같음). */
    @Override
    protected Map<String, ObjMeta> loadObjects() {
        Map<String, Set<String>[]> perms = permTokens();
        Map<String, Set<String>[]> allowed = new LinkedHashMap<>();
        for (Object[] r : rows("SELECT DISTINCT OBJECT_ID, PERMISSION_ID FROM " + S + "TB_MCM_SEC_ROLE_MAPPING", null)) {
            addAll(allowed.computeIfAbsent(str(r[0]), k -> newPair()), perms.get(str(r[1])));
        }
        Map<String, ObjMeta> out = new LinkedHashMap<>();
        for (Object[] r : rows("SELECT OBJECT_ID, SYSTEM_CODE FROM " + S + "TB_MCM_SEC_OBJ ORDER BY OBJECT_ID", null)) {
            Set<String>[] t = allowed.getOrDefault(str(r[0]), newPair());
            out.put(str(r[0]), new ObjMeta(str(r[0]), blankToNull(r[1]), "Y",
                    new ArrayList<>(t[0]), new ArrayList<>(t[1]), null, null));
        }
        return out;
    }

    private static void addAll(Set<String>[] sink, Set<String>[] src) {
        if (src == null) return;
        sink[0].addAll(src[0]);
        sink[1].addAll(src[1]);
    }

    @SuppressWarnings("unchecked")
    private static Set<String>[] newPair() {
        return new Set[]{new LinkedHashSet<String>(), new LinkedHashSet<String>()};
    }
}
