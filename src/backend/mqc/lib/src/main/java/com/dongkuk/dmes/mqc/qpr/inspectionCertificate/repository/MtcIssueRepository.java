package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcIssue;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MtcIssueRepository extends JpaRepository<MtcIssue, String> {

    List<MtcIssue> findAllByOrderByIssueNoDesc();

    @Query("select coalesce(max(x.issueNo), 0) from MtcIssue x")
    int maxIssueNo();

    Optional<MtcIssue> findByVrfyCd(String vrfyCd);

    Optional<MtcIssue> findFirstByMtcNo(String mtcNo);
}
