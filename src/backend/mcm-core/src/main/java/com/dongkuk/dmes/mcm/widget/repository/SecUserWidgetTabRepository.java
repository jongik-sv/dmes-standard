package com.dongkuk.dmes.mcm.widget.repository;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SecUserWidgetTabRepository extends JpaRepository<SecUserWidgetTab, SecUserWidgetTabId> {

    List<SecUserWidgetTab> findByUserIdOrderByTabSeqAsc(String userId);

    /**
     * 사용자 행에 남은 기본 탭 ID({@code def-*}, 중복 없이). 관리자가 지운 기본 탭의 재정의 행도 남으므로 새 {@code def-N} 채번이
     * 이 번호들까지 피해야 숨은 재정의 행이 새 탭에 되살아나지 않는다(design-widget-tabs.md §1).
     */
    @Query("select distinct t.tabId from SecUserWidgetTab t where t.tabId like 'def-%'")
    List<String> findDistinctDefaultTabIds();

    /**
     * 옛 고정 탭 행(home·def-*)을 개인 탭으로 옮긴다 — 행을 지우지 않고 TAB_ID·이름·순서만 바꾼다(스펙 2026-10-07-widget-fixed-tabs §4).
     * 바뀐 행 수(0 이면 다른 요청이 먼저 옮겼다). 호출하는 쪽 트랜잭션 안에서 부른다.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SecUserWidgetTab t set t.tabId = :toTabId, t.tabNm = :tabNm, t.tabSeq = :tabSeq,"
            + " t.updatedAt = :now, t.updatedBy = :userId where t.userId = :userId and t.tabId = :fromTabId")
    int moveTab(@Param("userId") String userId, @Param("fromTabId") String fromTabId, @Param("toTabId") String toTabId,
                @Param("tabNm") String tabNm, @Param("tabSeq") int tabSeq, @Param("now") Instant now);
}
