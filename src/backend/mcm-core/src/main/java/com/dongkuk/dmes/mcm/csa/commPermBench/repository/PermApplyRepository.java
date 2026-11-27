/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermApplyStore 의 Oracle 구현 — 초안·범위 행 SELECT FOR UPDATE WAIT 5(native), 삭제 native DELETE, 넣기·바꾸기 JPA
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.repository;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermApplyService;
import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermApplyStore;
import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermDraftFingerprint;
import com.dongkuk.dmes.mcm.entity.SecPermHis;
import com.dongkuk.dmes.mcm.entity.SecPermHisDtl;
import com.dongkuk.dmes.mcm.entity.SecRoleGroupMapping;
import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.entity.SecRolePermId;
import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import com.dongkuk.dmes.mcm.repository.SecPermHisRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Supplier;

/**
 * 잠금 SQL = 종류마다 {@code SELECT 키 FROM 표 WHERE 키 IN (:ids) ORDER BY 키 FOR UPDATE WAIT 5}, 500개씩 끊는다(Oracle IN 1,000 한도).
 * 종류 순서 = 키 정렬 순(group → object → role → user). 같은 키를 건드린 두 적용은 같은 순서로 기다리므로 교착 없이 줄을 선다.
 *
 * <p>사람 범위는 설계 §2.5 7번대로 TB_MCM_SEC_USER 행을 잠근다. 알려진 한계(BPMN설계서 §4.3 S10-2): 그 행을 갱신하는
 * 다른 경로(로그인 시각 등)는 적용이 끝날 때까지 기다린다. 적용은 짧은 한 트랜잭션이라 기본안 그대로 둔다.
 *
 * <p>삽입은 {@link EntityManager#persist}(키를 정해 넣는 엔티티라 {@code save} 의 merge 조회를 피한다), 바꾸기는 관리 엔티티,
 * 삭제는 native DELETE(지운 행 수로 no-op 판정 — 찾은 뒤 지우는 사이의 경합과 두 번 조회를 없앤다).
 *
 * <p>오류 변환({@link #translate}): ORA-30006(WAIT 초과)·ORA-00060(교착)·ORA-00054 = {@code PERM_BUSY},
 * ORA-00001·02291·02292 = {@link DataIntegrityViolationException}.
 */
@Repository
public class PermApplyRepository implements PermApplyStore {

    private static final String S = "MCMAPUSER.";
    /** 잠금 대기 초. */
    static final int LOCK_WAIT_SEC = 5;

    /** 잠금 키 접두 → (표, 키 칸). */
    private static final Map<String, String[]> LOCK_TABLES = new LinkedHashMap<>();

    static {
        LOCK_TABLES.put(PermDraftFingerprint.GROUP, new String[]{"TB_MCM_SEC_ROLEGROUP", "ROLE_GROUP_ID"});
        LOCK_TABLES.put(PermApplyService.OBJECT, new String[]{"TB_MCM_SEC_OBJ", "OBJECT_ID"});
        LOCK_TABLES.put(PermDraftFingerprint.ROLE, new String[]{"TB_MCM_SEC_ROLE", "ROLE_ID"});
        LOCK_TABLES.put(PermDraftFingerprint.USER, new String[]{"TB_MCM_SEC_USER", "USER_ID"});
    }

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    private final SecUserMappingRepository userGroups;
    private final SecRoleGroupMappingRepository groupRoles;
    private final SecRolePermRepository rolePerms;
    private final SecPermHisRepository history;

    public PermApplyRepository(SecUserMappingRepository userGroups, SecRoleGroupMappingRepository groupRoles,
                               SecRolePermRepository rolePerms, SecPermHisRepository history) {
        this.userGroups = userGroups;
        this.groupRoles = groupRoles;
        this.rolePerms = rolePerms;
        this.history = history;
    }

    // ── 잠금 ──

    @Override
    public void lockDraft(String ownerUserId) {
        run(() -> entityManager.createNativeQuery("SELECT OWNER_USER_ID FROM " + S + "TB_MCM_SEC_PERM_DRAFT "
                        + "WHERE OWNER_USER_ID = :owner FOR UPDATE WAIT " + LOCK_WAIT_SEC)
                .setParameter("owner", ownerUserId)
                .getResultList());
    }

    @Override
    public Set<String> lockScopes(Collection<String> keys) {
        // 키 정렬 순서대로 종류별 묶음(TreeSet → group, object, role, user)
        Map<String, List<String>> byKind = new LinkedHashMap<>();
        for (String k : new TreeSet<>(keys)) {
            for (String prefix : LOCK_TABLES.keySet()) {
                if (k.startsWith(prefix)) {
                    byKind.computeIfAbsent(prefix, p -> new ArrayList<>()).add(k.substring(prefix.length()));
                    break;
                }
            }
        }
        Set<String> locked = new LinkedHashSet<>();
        byKind.forEach((prefix, ids) -> {
            String[] t = LOCK_TABLES.get(prefix);
            for (List<String> chunk : PermScopeRowRepository.chunks(ids)) {
                List<?> rows = run(() -> entityManager.createNativeQuery("SELECT " + t[1] + " FROM " + S + t[0]
                                + " WHERE " + t[1] + " IN (:ids) ORDER BY " + t[1] + " FOR UPDATE WAIT " + LOCK_WAIT_SEC)
                        .setParameter("ids", chunk)
                        .getResultList());
                for (Object r : rows) {
                    locked.add(prefix + r);
                }
            }
        });
        return locked;
    }

    // ── USER_GRP ──

    @Override
    public boolean userGroupExists(String userId, String roleGroupId) {
        return run(() -> userGroups.existsById(new SecUserMapping.PK(userId, roleGroupId)));
    }

    @Override
    public void insertUserGroup(String userId, String roleGroupId) {
        SecUserMapping m = new SecUserMapping();
        m.setUserId(userId);
        m.setRoleGroupId(roleGroupId);
        entityManager.persist(m);
    }

    @Override
    public boolean deleteUserGroup(String userId, String roleGroupId) {
        return run(() -> entityManager.createNativeQuery("DELETE FROM " + S + "TB_MCM_SEC_USER_MAPPING "
                        + "WHERE USER_ID = :u AND ROLE_GROUP_ID = :g")
                .setParameter("u", userId).setParameter("g", roleGroupId)
                .executeUpdate()) > 0;
    }

    // ── GRP_ROLE ──

    @Override
    public boolean groupRoleExists(String roleGroupId, String roleId) {
        return run(() -> groupRoles.existsById(new SecRoleGroupMapping.PK(roleGroupId, roleId)));
    }

    @Override
    public void insertGroupRole(String roleGroupId, String roleId) {
        SecRoleGroupMapping m = new SecRoleGroupMapping();
        m.setRoleGroupId(roleGroupId);
        m.setRoleId(roleId);
        entityManager.persist(m);
    }

    @Override
    public boolean deleteGroupRole(String roleGroupId, String roleId) {
        return run(() -> entityManager.createNativeQuery("DELETE FROM " + S + "TB_MCM_SEC_ROLEGROUP_MAPPING "
                        + "WHERE ROLE_GROUP_ID = :g AND ROLE_ID = :r")
                .setParameter("g", roleGroupId).setParameter("r", roleId)
                .executeUpdate()) > 0;
    }

    // ── ROLE_OBJ ──

    @Override
    public Optional<PermRow> findRolePerm(String roleId, String objectId) {
        return run(() -> rolePerms.findById(new SecRolePermId(roleId, objectId))
                .map(p -> new PermRow(p.getBtnPerm(), p.getPopupPerm(), p.getDataPerm())));
    }

    @Override
    public void insertRolePerm(String roleId, String objectId, String btnPerm, String popupPerm) {
        entityManager.persist(new SecRolePerm(roleId, objectId, btnPerm, popupPerm, null));
    }

    @Override
    public void updateRolePerm(String roleId, String objectId, String btnPerm, String popupPerm) {
        SecRolePerm p = run(() -> rolePerms.findById(new SecRolePermId(roleId, objectId)))
                .orElseThrow(() -> new IllegalStateException("퍼미션 행이 없습니다: " + roleId + "/" + objectId));
        p.setBtnPerm(btnPerm);
        p.setPopupPerm(popupPerm); // DATA_PERM 은 그대로(관리 엔티티라 flush 때 UPDATE)
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<PermRow> deleteRolePerm(String roleId, String objectId) {
        // 역할 행이 잠겨 있으므로 읽은 값과 지운 행은 같다(잠그지 않는 옛 화면 저장은 클래스 주석 S10-1 한계)
        List<Object[]> before = run(() -> entityManager.createNativeQuery("SELECT BTN_PERM, POPUP_PERM, DATA_PERM FROM " + S
                        + "TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = :r AND OBJECT_ID = :o")
                .setParameter("r", roleId).setParameter("o", objectId)
                .getResultList());
        int n = run(() -> entityManager.createNativeQuery("DELETE FROM " + S + "TB_MCM_SEC_ROLE_PERM "
                        + "WHERE ROLE_ID = :r AND OBJECT_ID = :o")
                .setParameter("r", roleId).setParameter("o", objectId)
                .executeUpdate());
        if (n == 0) {
            return Optional.empty();
        }
        Object[] v = before.isEmpty() ? new Object[3] : before.get(0);
        return Optional.of(new PermRow(str(v[0]), str(v[1]), str(v[2])));
    }

    // ── 이력 ──

    @Override
    public boolean applyIdExists(String applyId) {
        return run(() -> history.existsById(applyId));
    }

    @Override
    public void insertHistory(SecPermHis header, List<SecPermHisDtl> rows) {
        run(() -> {
            entityManager.persist(header);
            entityManager.flush(); // 머리 PK 위반을 여기서 알린다(앞선 쓰기는 호출자가 이미 flush 했다). HIS_DTL → HIS FK 도 머리 먼저
            return null;
        });
        for (SecPermHisDtl d : rows) {
            entityManager.persist(d);
        }
    }

    @Override
    public void flush() {
        run(() -> {
            entityManager.flush();
            return null;
        });
    }

    // ── 오류 변환 ──

    private static <T> T run(Supplier<T> body) {
        try {
            return body.get();
        } catch (BusinessException | DataIntegrityViolationException e) {
            throw e;
        } catch (RuntimeException e) {
            throw translate(e);
        }
    }

    /** Oracle 오류 번호로 바꾼다. 해당 없으면 그대로. */
    static RuntimeException translate(RuntimeException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof SQLException s) {
                int code = s.getErrorCode();
                if (code == 30006 || code == 60 || code == 54) {
                    return new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_BUSY: 다른 적용이 진행 중입니다");
                }
                if (code == 1 || code == 2291 || code == 2292 || s instanceof SQLIntegrityConstraintViolationException) {
                    return new DataIntegrityViolationException(s.getMessage(), e);
                }
            }
            if (t.getCause() == t) {
                break;
            }
        }
        return e;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
