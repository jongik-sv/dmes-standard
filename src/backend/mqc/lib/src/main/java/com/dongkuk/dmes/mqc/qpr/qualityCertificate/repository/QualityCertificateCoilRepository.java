package com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.QualityCertificateCoil;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.QualityCertificateCoilId;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QualityCertificateCoilRepository extends JpaRepository<QualityCertificateCoil, QualityCertificateCoilId> {

    List<QualityCertificateCoil> findByQcNoOrderBySeqAsc(String qcNo);

    List<QualityCertificateCoil> findAllByOrderByQcNoAscSeqAsc();

    List<QualityCertificateCoil> findByCoilNoIn(Collection<String> coilNos);
}
