package com.dongkuk.dmes.mcm.widget.repository;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

public interface SecUserWidgetRepository extends JpaRepository<SecUserWidget, SecUserWidgetId> {

    List<SecUserWidget> findByUserId(String userId);

    @Modifying
    @Transactional
    void deleteByUserIdAndTabId(String userId, String tabId);
}
