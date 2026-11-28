/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: SecHrEvt (TB_MCM_SEC_HR_EVT) JPA Repository — ERP 인사 정보 수신(V24)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecHrEvt;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/** ERP 인사 정보 저장소. */
public interface SecHrEvtRepository extends JpaRepository<SecHrEvt, String> {

    /** 처리할 건 — 상태가 주어진 것 중 발령일·받은 순. 같은 사람의 앞 발령을 먼저 처리한다. */
    @Query("SELECT e FROM SecHrEvt e WHERE e.procSt IN :sts ORDER BY e.evtDt, e.createdAt, e.evtId")
    List<SecHrEvt> findByProcStIn(@Param("sts") Collection<String> sts);
}
