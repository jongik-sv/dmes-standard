package com.dongkuk.dmes.mcm.widget.def.repository;

import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** {@code MCMAPUSER.TB_MCM_WIDGET_DEF} — 스펙 2026-10-02-widget-admin-generic §4.1. */
public interface WidgetDefRepository extends JpaRepository<WidgetDef, String> {

    List<WidgetDef> findAllByOrderByWidgetIdAsc();

    /**
     * 목록용 요약 — {@link #findAllByOrderByWidgetIdAsc} 와 같은 정렬이되 설정(CONFIG_JSON, 최대 200KB)을 읽지 않는다(화면 성능 가이드 R1).
     * 열 순서: WIDGET_ID, SRC_TP, TYPE_ID, TITLE, SUBTITLE, DESCRIPTION, DEF_W, DEF_H, MIN_W, MIN_H, MAX_W, MAX_H,
     * REFRESH_SEC, LINK_PAGE_ID, MULTIPLE_YN, USE_YN, DATA_SRC, CATEGORY_CD, PRIVATE_YN.
     */
    @Query("""
            SELECT d.widgetId, d.srcTp, d.typeId, d.title, d.subtitle, d.description, d.defW, d.defH, d.minW, d.minH,
                   d.maxW, d.maxH, d.refreshSec, d.linkPageId, d.multipleYn, d.useYn, d.dataSrc, d.categoryCd, d.privateYn
            FROM WidgetDef d ORDER BY d.widgetId ASC
            """)
    List<Object[]> findAllSummaryOrderByWidgetIdAsc();

    List<WidgetDef> findBySrcTpOrderByWidgetIdAsc(String srcTp);

    /** 한 유형의 정의 행(사용 중지 포함) — 환율 허용 목록이 exchange 정의 설정을 읽는다. */
    List<WidgetDef> findBySrcTpAndTypeIdOrderByWidgetIdAsc(String srcTp, String typeId);
}
