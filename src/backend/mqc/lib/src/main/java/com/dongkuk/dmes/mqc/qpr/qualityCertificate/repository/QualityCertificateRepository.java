package com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.QualityCertificate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QualityCertificateRepository extends JpaRepository<QualityCertificate, String> {

    List<QualityCertificate> findAllByOrderByQcNoDesc();

    /** 채번용: 같은 접두(QC-yyMM-)의 가장 큰 번호. */
    Optional<QualityCertificate> findTopByQcNoStartingWithOrderByQcNoDesc(String prefix);
}
