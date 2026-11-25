package com.dongkuk.dmes.mqc.qpr.tagManagement.repository;

import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagHistory;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TagHistoryRepository extends JpaRepository<TagHistory, Long> {

    /** 최근 100건(처리 시각·번호 내림차순). */
    List<TagHistory> findTop100ByOrderByActAtDescHistNoDesc();

    /** 직전 행 — 되풀이 저장 모으기 판정용. */
    Optional<TagHistory> findFirstByOrderByActAtDescHistNoDesc();
}
