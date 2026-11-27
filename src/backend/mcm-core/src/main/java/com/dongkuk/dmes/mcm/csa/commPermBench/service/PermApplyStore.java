/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench apply(b4)가 DB 를 잠그고 쓰는 이음매 — 초안·범위 행 잠금·연결/퍼미션 쓰기·이력
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.entity.SecPermHis;
import com.dongkuk.dmes.mcm.entity.SecPermHisDtl;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 적용(apply)이 쓰는 DB 읽기·쓰기. 구현 = {@code repository.PermApplyRepository}(native 잠금·삭제 + JPA 넣기·바꾸기), 시험 = 메모리 가짜.
 *
 * <p>모든 호출은 OASIS process 의 한 트랜잭션(txBiz) 안에서 일어난다. 잠금은 커밋·롤백까지 유지된다.
 * 옛 표 {@code TB_MCM_SEC_PERM}·{@code TB_MCM_SEC_ROLE_MAPPING} 은 쓰지 않는다(D10).
 *
 * <p>오류 약속(구현이 지킨다): 잠금 대기 5초 초과(ORA-30006)·교착(ORA-00060) = {@code BusinessException("PERM_BUSY: …")},
 * 제약 위반(ORA-00001·02291·02292) = {@link org.springframework.dao.DataIntegrityViolationException}.
 */
public interface PermApplyStore {

    /** 퍼미션 한 행의 값(TB_MCM_SEC_ROLE_PERM). null 칸은 null 그대로. */
    record PermRow(String btnPerm, String popupPerm, String dataPerm) {
    }

    /** 내 초안 행(TB_MCM_SEC_PERM_DRAFT)을 {@code SELECT … FOR UPDATE WAIT 5} 로 잠근다. 행이 없으면 아무것도 잠그지 않는다. */
    void lockDraft(String ownerUserId);

    /**
     * 잠금 키의 행을 {@code SELECT … FOR UPDATE WAIT 5} 로 잠근다. 키 = {@code group:}(TB_MCM_SEC_ROLEGROUP)·{@code object:}(TB_MCM_SEC_OBJ)·
     * {@code role:}(TB_MCM_SEC_ROLE)·{@code user:}(TB_MCM_SEC_USER). 순서 = 키 정렬 순(종류 → 키) — 두 관리자가 같은 순서로 잠가 교착을 피한다.
     *
     * @return 잠근(= 지금 있는) 키
     */
    Set<String> lockScopes(Collection<String> keys);

    // ── USER_GRP (TB_MCM_SEC_USER_MAPPING) ──
    boolean userGroupExists(String userId, String roleGroupId);

    void insertUserGroup(String userId, String roleGroupId);

    /** native DELETE. 지운 행이 있으면 true. */
    boolean deleteUserGroup(String userId, String roleGroupId);

    // ── GRP_ROLE (TB_MCM_SEC_ROLEGROUP_MAPPING) ──
    boolean groupRoleExists(String roleGroupId, String roleId);

    void insertGroupRole(String roleGroupId, String roleId);

    /** native DELETE. 지운 행이 있으면 true. */
    boolean deleteGroupRole(String roleGroupId, String roleId);

    // ── ROLE_OBJ (TB_MCM_SEC_ROLE_PERM) ──
    Optional<PermRow> findRolePerm(String roleId, String objectId);

    void insertRolePerm(String roleId, String objectId, String btnPerm, String popupPerm);

    /** BTN·POPUP 만 바꾼다. DATA_PERM 은 그대로 둔다(D21). */
    void updateRolePerm(String roleId, String objectId, String btnPerm, String popupPerm);

    /** native DELETE. 지웠으면 지우기 직전의 값, 지운 행이 없으면 empty. */
    Optional<PermRow> deleteRolePerm(String roleId, String objectId);

    // ── 이력 ──
    boolean applyIdExists(String applyId);

    /** 머리 한 줄과 줄들을 넣는다(머리 먼저 — HIS_DTL FK). 머리는 곧바로 flush 한다(PK 위반을 여기서 알린다). */
    void insertHistory(SecPermHis header, List<SecPermHisDtl> rows);

    /** 지금까지의 쓰기를 DB 로 보낸다 — 제약 위반을 적용 안에서 오류로 받고, 커밋 뒤 이벤트 전에 쓰기가 끝나게 한다. */
    void flush();
}
