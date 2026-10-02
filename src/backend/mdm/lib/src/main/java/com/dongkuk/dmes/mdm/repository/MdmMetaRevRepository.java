package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmMetaRev;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** {@code TB_MDM_META_REV} 읽기(spec 2026-10-02-mdm-meta-cache-design §3.4 search). 쓰기는 MetaRevisionRecorder 가 한다. */
public interface MdmMetaRevRepository extends JpaRepository<MdmMetaRev, Long> {

    /** 순번 {@code since} 뒤의 기록, 순번 오름차순. 클라이언트 폴링 한 번. */
    List<MdmMetaRev> findByRevSeqGreaterThanOrderByRevSeqAsc(Long since, Pageable page);

    /** 가장 큰 순번. 기록이 없으면 0. */
    @Query("SELECT COALESCE(MAX(r.revSeq), 0) FROM MdmMetaRev r")
    long latestSeq();
}
