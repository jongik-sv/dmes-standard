package com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.WtyVersion;
import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.WtyVersionId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WtyVersionRepository extends JpaRepository<WtyVersion, WtyVersionId> {

    List<WtyVersion> findByDocIdOrderByDocVerDesc(String docId);
}
