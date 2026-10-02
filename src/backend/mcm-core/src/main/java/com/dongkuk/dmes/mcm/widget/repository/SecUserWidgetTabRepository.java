package com.dongkuk.dmes.mcm.widget.repository;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SecUserWidgetTabRepository extends JpaRepository<SecUserWidgetTab, SecUserWidgetTabId> {

    List<SecUserWidgetTab> findByUserIdOrderByTabSeqAsc(String userId);
}
