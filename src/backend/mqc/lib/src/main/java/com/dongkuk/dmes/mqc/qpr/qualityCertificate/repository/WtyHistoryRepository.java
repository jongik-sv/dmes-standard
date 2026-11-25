package com.dongkuk.dmes.mqc.qpr.qualityCertificate.repository;

import com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain.WtyHistory;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WtyHistoryRepository extends JpaRepository<WtyHistory, Long> {

    /** 최근 100건(처리 시각·번호 내림차순). */
    List<WtyHistory> findTop100ByOrderByActAtDescHistNoDesc();

    /** 직전 행 — 되풀이 저장 모으기 판정용. */
    Optional<WtyHistory> findFirstByOrderByActAtDescHistNoDesc();
}
