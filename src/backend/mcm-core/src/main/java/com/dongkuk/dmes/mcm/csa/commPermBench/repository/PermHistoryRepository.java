/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: 적용 이력 읽기(JPQL, 읽기 전용) — 머리는 상한을 DB 에서 자른다
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.repository;

import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermHistoryStore;
import com.dongkuk.dmes.mcm.entity.SecPermHis;
import com.dongkuk.dmes.mcm.entity.SecPermHisDtl;
import com.dongkuk.dmes.mcm.repository.SecPermHisDtlRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/** {@link PermHistoryStore} 의 JPA 구현. */
@Repository
public class PermHistoryRepository implements PermHistoryStore {

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    private final SecPermHisDtlRepository details;

    public PermHistoryRepository(SecPermHisDtlRepository details) {
        this.details = details;
    }

    @Override
    public List<SecPermHis> findHistory(LocalDateTime from, LocalDateTime toExclusive, String applyUserId, int limit) {
        String jpql = "SELECT h FROM SecPermHis h WHERE h.applyAt >= :from AND h.applyAt < :to"
                + (applyUserId == null ? "" : " AND h.applyUserId = :u")
                + " ORDER BY h.applyAt DESC, h.applyId DESC";
        var q = entityManager.createQuery(jpql, SecPermHis.class)
                .setParameter("from", from)
                .setParameter("to", toExclusive)
                .setMaxResults(limit);
        if (applyUserId != null) {
            q.setParameter("u", applyUserId);
        }
        return q.getResultList();
    }

    @Override
    public List<SecPermHisDtl> findDetails(String applyId) {
        return details.findByApplyIdOrderBySeqNo(applyId);
    }
}
