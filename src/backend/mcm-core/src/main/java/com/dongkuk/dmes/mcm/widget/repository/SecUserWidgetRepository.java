package com.dongkuk.dmes.mcm.widget.repository;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface SecUserWidgetRepository extends JpaRepository<SecUserWidget, SecUserWidgetId> {

    List<SecUserWidget> findByUserId(String userId);

    List<SecUserWidget> findByUserIdAndTabId(String userId, String tabId);

    /** 한 탭의 위젯을 다른 탭 ID 로 옮긴다(INST_ID 그대로 — 메모·대화가 이어진다). 호출하는 쪽 트랜잭션 안에서 부른다. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SecUserWidget w set w.tabId = :toTabId where w.userId = :userId and w.tabId = :fromTabId")
    int moveTab(@Param("userId") String userId, @Param("fromTabId") String fromTabId, @Param("toTabId") String toTabId);

    @Modifying
    @Transactional
    void deleteByUserIdAndTabId(String userId, String tabId);
}
