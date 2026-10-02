package com.dongkuk.dmes.mcm.screenusage.repository;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/** {@code TB_SEC_SCREEN_USAGE_LOG} 저장소. 방언 함수 없이 범위 파라미터만 쓰는 JPQL. */
public interface ScreenUsageLogRepository extends JpaRepository<ScreenUsageLog, String> {

    /** 재전송 중복 사전 조회 — 고유 제약 위반을 catch 하면 트랜잭션이 rollback-only 가 되므로 저장 전에 거른다. */
    @Query("SELECT l.clientSegId FROM ScreenUsageLog l WHERE l.userId = :userId AND l.clientSegId IN :clientSegIds")
    List<String> findExistingClientSegIds(@Param("userId") String userId,
                                          @Param("clientSegIds") Collection<String> clientSegIds);

    /** STARTED_AT ∈ [from, to). 일자 집계·원본 합산용. */
    @Query("SELECT l FROM ScreenUsageLog l WHERE l.startedAt >= :from AND l.startedAt < :to")
    List<ScreenUsageLog> findStartedBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("SELECT MIN(l.startedAt) FROM ScreenUsageLog l")
    LocalDateTime findMinStartedAt();

    /** 보관 삭제 — STARTED_AT < cutoff. */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("DELETE FROM ScreenUsageLog l WHERE l.startedAt < :cutoff")
    int deleteStartedBefore(@Param("cutoff") LocalDateTime cutoff);

    /** 이용 이력 — 최신순. deptCd '-' 는 부서 없는(NULL) 행. 건수는 pageable 로 자른다. */
    @Query("""
            SELECT l FROM ScreenUsageLog l
             WHERE l.startedAt >= :from AND l.startedAt < :to
               AND (:userId IS NULL OR l.userId = :userId)
               AND (:pageId IS NULL OR l.pageId = :pageId)
               AND (:deptCd IS NULL OR l.deptCd = :deptCd OR (:deptCd = '-' AND l.deptCd IS NULL))
             ORDER BY l.startedAt DESC
            """)
    List<ScreenUsageLog> findHistory(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to,
                                     @Param("userId") String userId, @Param("deptCd") String deptCd,
                                     @Param("pageId") String pageId, Pageable pageable);
}
