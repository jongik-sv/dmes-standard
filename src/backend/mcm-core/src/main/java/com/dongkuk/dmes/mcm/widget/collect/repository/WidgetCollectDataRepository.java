package com.dongkuk.dmes.mcm.widget.collect.repository;

import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectData;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectDataId;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** {@code MCMAPUSER.TB_MCM_WIDGET_COLLECT_DATA} — 스펙 2026-10-05 정시 수집 §3. */
public interface WidgetCollectDataRepository extends JpaRepository<WidgetCollectData, WidgetCollectDataId> {

    /** fromSlot 이후(포함) 값을 오름차순 읽기의 정확한 거꾸로(최근 SLOT·큰 ITEM_KEY 부터) 페이지 크기만큼 — 앞에서 자르면 가장 오래된 행이 버려진다. */
    List<WidgetCollectData> findByWidgetIdAndSlotGreaterThanEqualOrderBySlotDescItemKeyDesc(
            String widgetId, String fromSlot, Pageable page);

    List<WidgetCollectData> findByWidgetIdAndSlotOrderByItemKeyAsc(String widgetId, String slot);

    /** SLOT 이 slot 보다 작은 값 삭제(보관 기간 밖). 지운 행 수. */
    @Modifying
    @Query("DELETE FROM WidgetCollectData d WHERE d.slot < :slot")
    int deleteBySlotBefore(@Param("slot") String slot);
}
