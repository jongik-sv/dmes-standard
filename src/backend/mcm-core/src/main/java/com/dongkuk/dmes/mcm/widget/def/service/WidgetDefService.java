package com.dongkuk.dmes.mcm.widget.def.service;

import com.dongkuk.dmes.mcm.widget.def.dto.WidgetDefListRequest;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultLayouts;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 사용자용 위젯 정의 조회 — OASIS {@code widgetDef}(스펙 2026-10-02-widget-admin-generic §5.1, AUTH_ONLY).
 * 화면은 이 응답으로 코드 등록부·유형 등록부·DB 행을 합친다(§1.1). 모든 사용자가 부르므로 정의 설정의 서버 전용 키
 * (쿼리 SQL·챗봇 시스템 프롬프트 등)를 지워 돌려준다. 이 클래스에는 {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1).
 */
@Service("widgetDefService")
public class WidgetDefService {

    private final WidgetDefRepository defRepository;
    private final WidgetDefaultLayoutRepository layoutRepository;

    @Autowired
    public WidgetDefService(WidgetDefRepository defRepository, WidgetDefaultLayoutRepository layoutRepository) {
        this.defRepository = defRepository;
        this.layoutRepository = layoutRepository;
    }

    /**
     * 정의·덮어쓰기 행 전부(사용 중지 포함)와 「홈」 고정 탭의 배치 = 전사({@code *}) 배치. 없으면 homeDefault·homeDefaultKey 가 null
     * (화면이 코드 상수를 쓴다). 부서 배치는 「홈」을 대신하지 않고 부서 고정 탭으로 따로 보인다(스펙 2026-10-07-widget-fixed-tabs §1).
     */
    public Map<String, Object> list(WidgetDefListRequest request) {
        List<Map<String, Object>> defs = new ArrayList<>();
        for (WidgetDef d : defRepository.findAllByOrderByWidgetIdAsc()) defs.add(WidgetDefMaps.toPublicMap(d));

        WidgetDefaultLayouts.Found found =
                WidgetDefaultLayouts.firstExisting(layoutRepository, List.of(WidgetDefaultLayout.COMPANY_KEY));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("defs", defs);
        result.put("homeDefault", found == null ? null : WidgetDefaultLayouts.toItems(found.rows()));
        result.put("homeDefaultKey", found == null ? null : found.layoutKey());
        return result;
    }
}
