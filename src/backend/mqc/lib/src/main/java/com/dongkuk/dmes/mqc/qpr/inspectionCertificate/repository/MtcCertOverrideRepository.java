package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcCertOverride;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MtcCertOverrideRepository extends JpaRepository<MtcCertOverride, String> {

    List<MtcCertOverride> findAllByOrderBySortSeqAsc();

    @Query("select coalesce(max(x.sortSeq), 0) from MtcCertOverride x")
    int maxSortSeq();
}
