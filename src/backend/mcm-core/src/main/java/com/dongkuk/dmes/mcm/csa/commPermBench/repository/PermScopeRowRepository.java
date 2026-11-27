/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: 범위 지문(D22)용 현재 행 읽기 — 사람·그룹·역할 범위의 연결·퍼미션 행(native, 읽기 전용)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.repository;

import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermDraftFingerprint;
import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermScopeRowSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** {@link PermScopeRowSource} 의 Oracle 구현. IN 목록은 500개씩 끊어 부른다(Oracle 1,000 한도). */
@Repository
public class PermScopeRowRepository implements PermScopeRowSource {

    private static final String S = "MCMAPUSER.";
    /** IN 목록 한 번에 담는 최대 개수(Oracle 한도 1,000 아래). */
    static final int CHUNK = 500;

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    @Override
    public Map<String, List<String>> rowsOf(Collection<String> scopeKeys) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        List<String> users = new ArrayList<>();
        List<String> groups = new ArrayList<>();
        List<String> roles = new ArrayList<>();
        for (String k : scopeKeys) {
            out.put(k, new ArrayList<>());
            if (k.startsWith(PermDraftFingerprint.USER)) {
                users.add(k.substring(PermDraftFingerprint.USER.length()));
            } else if (k.startsWith(PermDraftFingerprint.GROUP)) {
                groups.add(k.substring(PermDraftFingerprint.GROUP.length()));
            } else if (k.startsWith(PermDraftFingerprint.ROLE)) {
                roles.add(k.substring(PermDraftFingerprint.ROLE.length()));
            }
        }
        for (List<String> ids : chunks(users)) {
            for (Object[] r : query("SELECT USER_ID, ROLE_GROUP_ID FROM " + S
                    + "TB_MCM_SEC_USER_MAPPING WHERE USER_ID IN (:ids)", ids)) {
                put(out, PermDraftFingerprint.USER + str(r[0]), str(r[1]));
            }
        }
        for (List<String> ids : chunks(groups)) {
            for (Object[] r : query("SELECT ROLE_GROUP_ID, ROLE_ID FROM " + S
                    + "TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_GROUP_ID IN (:ids)", ids)) {
                put(out, PermDraftFingerprint.GROUP + str(r[0]), str(r[1]));
            }
        }
        for (List<String> ids : chunks(roles)) {
            for (Object[] r : query("SELECT ROLE_ID, OBJECT_ID, BTN_PERM, POPUP_PERM, DATA_PERM FROM " + S
                    + "TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID IN (:ids)", ids)) {
                put(out, PermDraftFingerprint.ROLE + str(r[0]), roleLine(str(r[1]), str(r[2]), str(r[3]), str(r[4])));
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private List<Object[]> query(String sql, List<String> ids) {
        return entityManager.createNativeQuery(sql).setParameter("ids", ids).getResultList();
    }

    private static void put(Map<String, List<String>> out, String key, String line) {
        out.computeIfAbsent(key, k -> new ArrayList<>()).add(line);
    }

    /** 역할 범위 한 줄 = OBJECT_ID US BTN US POPUP US DATA (값은 저장된 글자 그대로 — 순서만 다른 같은 값은 다른 지문, 허용한 오탐). */
    static String roleLine(String objectId, String btn, String popup, String data) {
        char sep = PermScopeRowSource.FIELD_SEP;
        return objectId + sep + btn + sep + popup + sep + data;
    }

    static <T> List<List<T>> chunks(List<T> all) {
        List<List<T>> out = new ArrayList<>();
        for (int i = 0; i < all.size(); i += CHUNK) {
            out.add(all.subList(i, Math.min(all.size(), i + CHUNK)));
        }
        return out;
    }

    /** 드라이버가 문자열이 아닌 형을 줘도 문자열로 바꾼다. null = 빈 문자열. */
    private static String str(Object o) {
        return o == null ? "" : o.toString();
    }
}
