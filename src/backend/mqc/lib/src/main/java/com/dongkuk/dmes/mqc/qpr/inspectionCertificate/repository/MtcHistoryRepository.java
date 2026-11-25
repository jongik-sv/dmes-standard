package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MtcHistoryRepository extends JpaRepository<MtcHistory, Long> {

    /** 최근 200건(처리 시각·번호 내림차순). */
    List<MtcHistory> findTop200ByOrderByActAtDescHistNoDesc();

    /** 재발행으로 대체된 진위 확인 번호 찾기(REISSUE 행의 VRFY_CD 는 이전 번호다). */
    List<MtcHistory> findByActCdAndVrfyCdOrderByActAtDesc(String actCd, String vrfyCd);
}
