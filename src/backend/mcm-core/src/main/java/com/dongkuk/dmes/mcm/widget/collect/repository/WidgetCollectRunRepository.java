package com.dongkuk.dmes.mcm.widget.collect.repository;

import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRun;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRunId;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
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

    /** SLOT 이 slot 이하인 회차 삭제 — 보관 삭제를 나눠 지울 때의 한 덩어리. */
    @Modifying
    @Query("DELETE FROM WidgetCollectRun r WHERE r.slot <= :slot")
    int deleteBySlotAtMost(@Param("slot") String slot);

    /** SLOT 이 slot 보다 작은 회차의 SLOT 을 오름차순으로 페이지만큼 — 덩어리 경계를 찾는다. */
    @Query("SELECT r.slot FROM WidgetCollectRun r WHERE r.slot < :slot ORDER BY r.slot ASC")
    List<String> findSlotsBefore(@Param("slot") String slot, Pageable page);
}
