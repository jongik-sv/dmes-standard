package com.dongkuk.dmes.mcm.widget.def.service;

import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.dto.WidgetDefListRequest;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultLayouts;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final WidgetUserContextResolver userContextResolver;

    @Autowired
    public WidgetDefService(WidgetDefRepository defRepository,
                            WidgetDefaultLayoutRepository layoutRepository,
                            WidgetUserContextResolver userContextResolver) {
        this.defRepository = defRepository;
        this.layoutRepository = layoutRepository;
        this.userContextResolver = userContextResolver;
    }

    /**
     * 정의·덮어쓰기 행 전부(사용 중지 포함)와 사용자 부서 기준 「홈」 기본 배치 —
     * 자기 부서 → 상위 부서(최대 10단) → 전사(*) 순서로 처음 찾은 배치. 없으면 homeDefault·homeDefaultKey 가 null.
     */
    public Map<String, Object> list(WidgetDefListRequest request) {
        List<Map<String, Object>> defs = new ArrayList<>();
        for (WidgetDef d : defRepository.findAllByOrderByWidgetIdAsc()) defs.add(WidgetDefMaps.toPublicMap(d));

        WidgetUserContext user = userContextResolver.current();
        Set<String> keys = new LinkedHashSet<>();
        if (user.deptChain() != null) keys.addAll(user.deptChain());
        keys.add(WidgetDefaultLayout.COMPANY_KEY);
        WidgetDefaultLayouts.Found found = WidgetDefaultLayouts.firstExisting(layoutRepository, List.copyOf(keys));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("defs", defs);
        result.put("homeDefault", found == null ? null : WidgetDefaultLayouts.toItems(found.rows()));
        result.put("homeDefaultKey", found == null ? null : found.layoutKey());
        return result;
    }
}
