package com.dongkuk.dmes.mcm.widget.layout.repository;

import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

/** {@code MCMAPUSER.TB_MCM_WIDGET_DEFAULT_TAB} — design-widget-tabs.md §2. */
public interface WidgetDefaultTabRepository extends JpaRepository<WidgetDefaultTab, WidgetDefaultTabId> {

    /** 한 키의 기본 탭(관리자 순서). */
    List<WidgetDefaultTab> findByLayoutKeyOrderByTabSeqAscTabIdAsc(String layoutKey);

    /** 기본 탭이 있는 키별 탭 수 — 행 하나 = {@code [layoutKey(String), count(Long)]}. */
    @Query("select t.layoutKey, count(t) from WidgetDefaultTab t group by t.layoutKey")
    List<Object[]> countGroupByLayoutKey();

    /** 모든 기본 탭 ID — 새 {@code def-N} 채번용. */
    @Query("select t.tabId from WidgetDefaultTab t")
    List<String> findAllTabIds();

    @Modifying
    @Transactional
    void deleteByLayoutKey(String layoutKey);
}
