package com.dongkuk.dmes.mcm.widget.collect.repository;

import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRun;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRunId;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** {@code MCMAPUSER.TB_MCM_WIDGET_COLLECT_RUN} — 스펙 2026-10-05 정시 수집 §3. */
public interface WidgetCollectRunRepository extends JpaRepository<WidgetCollectRun, WidgetCollectRunId> {

    /** 가장 최근 SLOT 의 회차. */
    Optional<WidgetCollectRun> findFirstByWidgetIdOrderBySlotDesc(String widgetId);

    /** SLOT 이 slot 보다 작은 회차 삭제(보관 기간 밖). 지운 행 수. */
    @Modifying
    @Query("DELETE FROM WidgetCollectRun r WHERE r.slot < :slot")
    int deleteBySlotBefore(@Param("slot") String slot);
}
