package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.InspectionCertificate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InspectionCertificateRepository extends JpaRepository<InspectionCertificate, String> {

    List<InspectionCertificate> findAllByOrderByMtcNoDesc();

    List<InspectionCertificate> findByCoilNoAndStdCd(String coilNo, String stdCd);

    /** 채번용: 같은 접두(MTC-yyMMdd-)의 가장 큰 번호. */
    Optional<InspectionCertificate> findTopByMtcNoStartingWithOrderByMtcNoDesc(String prefix);
}
