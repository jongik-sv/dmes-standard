package com.dongkuk.dmes.mcm.widget.layout.service;

import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 기본 배치 쓰기의 트랜잭션 경계. OASIS 서비스 빈({@link CommWidgetLayoutService})에는 {@code @Transactional} 을 붙일 수 없어
 * (CGLIB 프록시가 파라미터명 메타데이터를 잃는다, BackEnd 표준 §6-B-1) 원자성이 필요한 쓰기를 이 빈에 모은다
 * (A 의 {@code SecWidgetTabWriter} 와 같은 방식).
 */
@Component("widgetLayoutWriter")
public class WidgetLayoutWriter {

    /** 검증을 마친 기본 배치 위젯 값. */
    public record LayoutItem(String instId, String widgetId, int posX, int posY, int sizeW, int sizeH, String lockYn) {}

    private final WidgetDefaultLayoutRepository layoutRepository;

    @Autowired
    public WidgetLayoutWriter(WidgetDefaultLayoutRepository layoutRepository) {
        this.layoutRepository = layoutRepository;
    }

    /** 한 키의 배치를 통째로 바꾼다 — 지우고 다시 넣기(스펙 §5.2 saveLayout). */
    @Transactional
    public void replace(String layoutKey, List<LayoutItem> items) {
        layoutRepository.deleteByLayoutKey(layoutKey);
        layoutRepository.flush();
        layoutRepository.saveAll(items.stream().map(i -> {
            WidgetDefaultLayout e = new WidgetDefaultLayout();
            e.setLayoutKey(layoutKey);
            e.setInstId(i.instId());
            e.setWidgetId(i.widgetId());
            e.setPosX(i.posX());
            e.setPosY(i.posY());
            e.setSizeW(i.sizeW());
            e.setSizeH(i.sizeH());
            e.setLockYn(i.lockYn());
            return e;
        }).toList());
    }

    /** 한 키의 배치를 지운다. 없으면 아무것도 하지 않는다. */
    @Transactional
    public void delete(String layoutKey) {
        layoutRepository.deleteByLayoutKey(layoutKey);
    }
}
