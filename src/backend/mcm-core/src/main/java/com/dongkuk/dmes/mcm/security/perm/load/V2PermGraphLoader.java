package com.dongkuk.dmes.mcm.security.perm.load;

import com.dongkuk.dmes.mcm.security.perm.ObjMeta;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.security.perm.RolePerm;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 새 모델 로더 — 퍼미션 = TB_MCM_SEC_ROLE_PERM, 오브젝트 허용 값 = TB_MCM_SEC_OBJ.BTN_PERM·POPUP_PERM.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: {@code mcm.security.perm-model=v2}(기본, 값이 없을 때도)일 때만 빈이 된다(D10). 범위 규칙은 {@link AbstractPermGraphLoader}.
 */
@Component
@ConditionalOnProperty(name = "mcm.security.perm-model", havingValue = "v2", matchIfMissing = true)
public class V2PermGraphLoader extends AbstractPermGraphLoader {

    @Override
    protected Map<String, Map<String, RolePerm>> loadRolePerms(Set<String> roleIds) {
        Map<String, Map<String, RolePerm>> out = new LinkedHashMap<>();
        for (Object[] r : rows("SELECT ROLE_ID, OBJECT_ID, BTN_PERM, POPUP_PERM, DATA_PERM FROM " + S + "TB_MCM_SEC_ROLE_PERM"
                + (roleIds == null ? "" : " WHERE ROLE_ID IN (:ids)") + " ORDER BY ROLE_ID, OBJECT_ID", roleIds)) {
            String roleId = str(r[0]);
            String objectId = str(r[1]);
            out.computeIfAbsent(roleId, k -> new LinkedHashMap<>()).put(objectId, new RolePerm(roleId, objectId,
                    PermTokens.parse(str(r[2])), PermTokens.parse(str(r[3])), str(r[4])));
        }
        return out;
    }

    @Override
    protected Map<String, ObjMeta> loadObjects() {
        Map<String, ObjMeta> out = new LinkedHashMap<>();
        for (Object[] r : rows("SELECT OBJECT_ID, SYSTEM_CODE, USE_TP, BTN_PERM, POPUP_PERM, START_ACTIVE_DATE, END_ACTIVE_DATE FROM "
                + S + "TB_MCM_SEC_OBJ ORDER BY OBJECT_ID", null)) {
            out.put(str(r[0]), new ObjMeta(str(r[0]), blankToNull(r[1]), str(r[2]),
                    PermTokens.parse(str(r[3])), PermTokens.parse(str(r[4])), ldt(r[5]), ldt(r[6])));
        }
        return out;
    }
}
