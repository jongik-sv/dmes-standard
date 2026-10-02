package com.dongkuk.dmes.mcm.screenusage.repository;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * {@code TB_SEC_SCREEN_USAGE_DAY} 저장소. GROUP BY·SUM·COUNT(DISTINCT)·MAX 와 범위 파라미터만 쓰는 이식 가능한 JPQL
 * (USAGE_DT 는 yyyyMMdd 문자열이라 문자열 비교가 곧 날짜 비교다).
 */
public interface ScreenUsageDayRepository extends JpaRepository<ScreenUsageDay, ScreenUsageDayId> {

    @Query("SELECT MAX(d.usageDt) FROM ScreenUsageDay d")
    String findMaxUsageDt();

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("DELETE FROM ScreenUsageDay d WHERE d.usageDt = :usageDt")
    int deleteByUsageDt(@Param("usageDt") String usageDt);

    @Query("""
            SELECT new com.dongkuk.dmes.mcm.screenusage.repository.UsageSum(
                   d.pageId, d.userId, d.deptCd, SUM(d.openCnt), SUM(d.segCnt), SUM(d.durationMs), MAX(d.usageDt))
              FROM ScreenUsageDay d
             WHERE d.usageDt >= :fromDt AND d.usageDt <= :toDt
               AND (:deptCd IS NULL OR d.deptCd = :deptCd)
               AND (:userId IS NULL OR d.userId = :userId)
               AND (:pageId IS NULL OR d.pageId = :pageId)
             GROUP BY d.pageId, d.userId, d.deptCd
            """)
    List<UsageSum> sumByPageUserDept(@Param("fromDt") String fromDt, @Param("toDt") String toDt,
                                     @Param("deptCd") String deptCd, @Param("userId") String userId,
                                     @Param("pageId") String pageId);

    @Query("""
            SELECT new com.dongkuk.dmes.mcm.screenusage.repository.DailySum(
                   d.usageDt, SUM(d.openCnt), COUNT(DISTINCT d.userId), SUM(d.durationMs))
              FROM ScreenUsageDay d
             WHERE d.usageDt >= :fromDt AND d.usageDt <= :toDt
               AND (:deptCd IS NULL OR d.deptCd = :deptCd)
               AND (:userId IS NULL OR d.userId = :userId)
               AND (:pageId IS NULL OR d.pageId = :pageId)
             GROUP BY d.usageDt
             ORDER BY d.usageDt
            """)
    List<DailySum> sumByDay(@Param("fromDt") String fromDt, @Param("toDt") String toDt,
                            @Param("deptCd") String deptCd, @Param("userId") String userId,
                            @Param("pageId") String pageId);

    @Query("""
            SELECT new com.dongkuk.dmes.mcm.screenusage.repository.PageLastUsed(d.pageId, MAX(d.usageDt))
              FROM ScreenUsageDay d
             GROUP BY d.pageId
            """)
    List<PageLastUsed> findLastUsedDtByPage();
}
