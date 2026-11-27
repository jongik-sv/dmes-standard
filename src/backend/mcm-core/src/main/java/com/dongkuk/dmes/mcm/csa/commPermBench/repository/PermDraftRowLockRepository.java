/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermDraftRowLock 의 Oracle 구현 — 초안 행 SELECT FOR UPDATE
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.repository;

import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermDraftRowLock;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

@Repository
public class PermDraftRowLockRepository implements PermDraftRowLock {

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    @Override
    public void lock(String ownerUserId) {
        entityManager.createNativeQuery("SELECT OWNER_USER_ID FROM MCMAPUSER.TB_MCM_SEC_PERM_DRAFT "
                        + "WHERE OWNER_USER_ID = :owner FOR UPDATE")
                .setParameter("owner", ownerUserId)
                .getResultList();
    }
}
