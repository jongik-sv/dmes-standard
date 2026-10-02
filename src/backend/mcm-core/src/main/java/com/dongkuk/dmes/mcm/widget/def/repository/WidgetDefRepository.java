package com.dongkuk.dmes.mcm.widget.def.repository;

import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code MCMAPUSER.TB_MCM_WIDGET_DEF} — 스펙 2026-10-02-widget-admin-generic §4.1. */
public interface WidgetDefRepository extends JpaRepository<WidgetDef, String> {

    List<WidgetDef> findAllByOrderByWidgetIdAsc();

    List<WidgetDef> findBySrcTpOrderByWidgetIdAsc(String srcTp);
}
