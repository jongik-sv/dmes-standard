package com.dongkuk.dmes.mcm.widget.layout.service;

import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 기본 배치 조회 도우미 — widgetDef/list(사용자 부서 기준)와 commWidgetMng/loadLayout(effective=Y)이 함께 쓴다(스펙 §4.2). */
public final class WidgetDefaultLayouts {

    /** 처음 찾은 배치. */
    public record Found(String layoutKey, List<WidgetDefaultLayout> rows) {}

    private WidgetDefaultLayouts() {}

    /** keys 순서대로 보며 행이 있는 첫 키의 배치. 아무것도 없으면 null. */
    public static Found firstExisting(WidgetDefaultLayoutRepository repository, List<String> keys) {
        for (String key : keys) {
            List<WidgetDefaultLayout> rows = repository.findByLayoutKeyOrderByPosYAscPosXAsc(key);
            if (rows != null && !rows.isEmpty()) return new Found(key, rows);
        }
        return null;
    }

    /** 응답 목록 — 한 줄은 {@code instId, widgetId, posX, posY, sizeW, sizeH, lockYn}. */
    public static List<Map<String, Object>> toItems(List<WidgetDefaultLayout> rows) {
        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (WidgetDefaultLayout r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("instId", r.getInstId());
            m.put("widgetId", r.getWidgetId());
            m.put("posX", r.getPosX());
            m.put("posY", r.getPosY());
            m.put("sizeW", r.getSizeW());
            m.put("sizeH", r.getSizeH());
            m.put("lockYn", r.getLockYn());
            items.add(m);
        }
        return items;
    }
}
