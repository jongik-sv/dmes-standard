package com.dongkuk.dmes.mcm.widget.layout.repository;

import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayoutId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

/** {@code MCMAPUSER.TB_MCM_WIDGET_DEFAULT_LAYOUT} — 스펙 2026-10-02-widget-admin-generic §4.2. */
public interface WidgetDefaultLayoutRepository extends JpaRepository<WidgetDefaultLayout, WidgetDefaultLayoutId> {

    /** 한 키의 배치(위→아래, 왼쪽→오른쪽). */
    List<WidgetDefaultLayout> findByLayoutKeyOrderByPosYAscPosXAsc(String layoutKey);

    /** 배치가 있는 키별 위젯 수 — 행 하나 = {@code [layoutKey(String), count(Long)]}. */
    @Query("select l.layoutKey, count(l) from WidgetDefaultLayout l group by l.layoutKey")
    List<Object[]> countGroupByLayoutKey();

    @Modifying
    @Transactional
    void deleteByLayoutKey(String layoutKey);
}
