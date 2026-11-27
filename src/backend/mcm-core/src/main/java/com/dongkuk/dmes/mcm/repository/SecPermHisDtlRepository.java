/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: SecPermHisDtlRepository — TB_MCM_SEC_PERM_HIS_DTL JPA 저장소 (권한 작업대 적용 이력 줄)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecPermHisDtl;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** 권한 작업대 적용 이력 줄({@link SecPermHisDtl}) 저장소. */
public interface SecPermHisDtlRepository extends JpaRepository<SecPermHisDtl, SecPermHisDtl.PK> {

    /** 적용 한 건의 줄(순번 순). */
    List<SecPermHisDtl> findByApplyIdOrderBySeqNo(String applyId);
}
