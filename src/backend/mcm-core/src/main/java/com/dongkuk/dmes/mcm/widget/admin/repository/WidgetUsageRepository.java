package com.dongkuk.dmes.mcm.widget.admin.repository;

import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetId;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 위젯 사용자 수 집계(읽기 전용) — {@code TB_MCM_SEC_USER_WIDGET} 에서 WIDGET_ID 별 DISTINCT USER_ID 수
 * (스펙 2026-10-02-widget-admin-generic §5.2 search·delete). A 의 {@code SecUserWidgetRepository} 는 고치지 않고 따로 둔다.
 */
public interface WidgetUsageRepository extends Repository<SecUserWidget, SecUserWidgetId> {

    /** 행 하나 = {@code [widgetId(String), userCount(Long)]}. 사용자 탭에 놓인 위젯 전부(DB 정의 행이 없는 코드 위젯 포함). */
    @Query("select w.widgetId, count(distinct w.userId) from SecUserWidget w group by w.widgetId")
    List<Object[]> countUsersByWidget();

    @Query("select count(distinct w.userId) from SecUserWidget w where w.widgetId = :widgetId")
    long countUsers(@Param("widgetId") String widgetId);
}
