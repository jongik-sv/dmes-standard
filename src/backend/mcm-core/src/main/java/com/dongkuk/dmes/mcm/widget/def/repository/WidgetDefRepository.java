package com.dongkuk.dmes.mcm.widget.def.repository;

import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code MCMAPUSER.TB_MCM_WIDGET_DEF} — 스펙 2026-10-02-widget-admin-generic §4.1. */
public interface WidgetDefRepository extends JpaRepository<WidgetDef, String> {

    List<WidgetDef> findAllByOrderByWidgetIdAsc();

    List<WidgetDef> findBySrcTpOrderByWidgetIdAsc(String srcTp);

    /** 한 유형의 정의 행(사용 중지 포함) — 환율 허용 목록이 exchange 정의 설정을 읽는다. */
    List<WidgetDef> findBySrcTpAndTypeIdOrderByWidgetIdAsc(String srcTp, String typeId);
}
