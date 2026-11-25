package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcCert;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MtcCertRepository extends JpaRepository<MtcCert, String> {

    List<MtcCert> findAllByOrderBySortSeqAsc();

    @Query("select coalesce(max(x.sortSeq), 0) from MtcCert x")
    int maxSortSeq();

    boolean existsByMtcNo(String mtcNo);

    List<MtcCert> findByCertIdStartingWith(String prefix);
}
