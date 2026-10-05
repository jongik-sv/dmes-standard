package com.dongkuk.dmes.mcm.widget.repository;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SecUserWidgetTabRepository extends JpaRepository<SecUserWidgetTab, SecUserWidgetTabId> {

    List<SecUserWidgetTab> findByUserIdOrderByTabSeqAsc(String userId);

    /**
     * 사용자 행에 남은 기본 탭 ID({@code def-*}, 중복 없이). 관리자가 지운 기본 탭의 재정의 행도 남으므로 새 {@code def-N} 채번이
     * 이 번호들까지 피해야 숨은 재정의 행이 새 탭에 되살아나지 않는다(design-widget-tabs.md §1).
     */
    @Query("select distinct t.tabId from SecUserWidgetTab t where t.tabId like 'def-%'")
    List<String> findDistinctDefaultTabIds();
}
