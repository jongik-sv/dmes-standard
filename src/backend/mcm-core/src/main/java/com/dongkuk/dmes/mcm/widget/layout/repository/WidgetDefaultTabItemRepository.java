package com.dongkuk.dmes.mcm.widget.layout.repository;

import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItemId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

/** {@code MCMAPUSER.TB_MCM_WIDGET_DEFAULT_TAB_ITEM} — design-widget-tabs.md §2. */
public interface WidgetDefaultTabItemRepository extends JpaRepository<WidgetDefaultTabItem, WidgetDefaultTabItemId> {

    /** 한 키의 모든 기본 탭 위젯(탭별로 위→아래, 왼쪽→오른쪽). */
    List<WidgetDefaultTabItem> findByLayoutKeyOrderByTabIdAscPosYAscPosXAsc(String layoutKey);

    /** 기본 탭 하나의 위젯(위→아래, 왼쪽→오른쪽). */
    List<WidgetDefaultTabItem> findByLayoutKeyAndTabIdOrderByPosYAscPosXAsc(String layoutKey, String tabId);

    @Modifying
    @Transactional
    void deleteByLayoutKeyAndTabId(String layoutKey, String tabId);

    @Modifying
    @Transactional
    void deleteByLayoutKey(String layoutKey);
}
