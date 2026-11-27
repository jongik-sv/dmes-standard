/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: SecPermHisRepository — TB_MCM_SEC_PERM_HIS JPA 저장소 (권한 작업대 적용 이력 머리)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecPermHis;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

/** 권한 작업대 적용 이력 머리({@link SecPermHis}) 저장소. */
public interface SecPermHisRepository extends JpaRepository<SecPermHis, String> {

    /** 기간 안 적용 이력(최근 먼저). */
    List<SecPermHis> findByApplyAtBetweenOrderByApplyAtDesc(LocalDateTime from, LocalDateTime to);

    /** 기간 안 적용자 한 명의 적용 이력(최근 먼저). */
    List<SecPermHis> findByApplyAtBetweenAndApplyUserIdOrderByApplyAtDesc(LocalDateTime from, LocalDateTime to, String applyUserId);
}
