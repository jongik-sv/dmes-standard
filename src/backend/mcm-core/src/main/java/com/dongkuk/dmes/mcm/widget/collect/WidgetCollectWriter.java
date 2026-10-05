package com.dongkuk.dmes.mcm.widget.collect;

import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectData;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectDataId;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRun;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRunId;
import com.dongkuk.dmes.mcm.widget.collect.repository.WidgetCollectDataRepository;
import com.dongkuk.dmes.mcm.widget.collect.repository.WidgetCollectRunRepository;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 정시 수집 쓰기의 트랜잭션 경계(스펙 2026-10-05 정시 수집 §3) — 수집기가 자기 호출이 아닌 이 빈을 거쳐야 {@code @Transactional} 프록시가 걸린다.
 * 한 메서드가 한 트랜잭션이라, 수집기는 외부 호출(HTTP·SQL)을 하는 동안 DB 트랜잭션을 쥐지 않는다.
 */
@Component
public class WidgetCollectWriter {

    private final WidgetCollectRunRepository runRepository;
    private final WidgetCollectDataRepository dataRepository;

    @Autowired
    public WidgetCollectWriter(WidgetCollectRunRepository runRepository, WidgetCollectDataRepository dataRepository) {
        this.runRepository = runRepository;
        this.dataRepository = dataRepository;
    }

    /**
     * 이 (정의, 시각)을 잡는다 — RUN 행을 먼저 넣는다. 이미 있으면 false(다른 인스턴스·이전 시도가 잡은 시각이라 건너뛴다).
     * 동시에 두 인스턴스가 넣으면 뒤의 insert 가 PK 위반({@code DataIntegrityViolationException})을 던진다 — 호출자가 건너뜀으로 처리한다.
     */
    @Transactional
    public boolean tryStart(String widgetId, String slot, Instant startedAt) {
        if (runRepository.existsById(new WidgetCollectRunId(widgetId, slot))) return false;
        runRepository.saveAndFlush(WidgetCollectRun.start(widgetId, slot, startedAt));
        return true;
    }

    /** 항목 하나를 넣는다. 같은 PK 가 이미 있으면 넣지 않고 false(PK 위반은 무시한다). */
    @Transactional
    public boolean insertItem(String widgetId, String slot, CollectItem item) {
        if (dataRepository.existsById(new WidgetCollectDataId(widgetId, slot, item.key()))) return false;
        dataRepository.saveAndFlush(new WidgetCollectData(widgetId, slot, item.key(), item.num(), item.txt()));
        return true;
    }

    /** 회차를 OK·FAIL 로 끝낸다. msg 는 200자로 자른다. */
    @Transactional
    public void finish(String widgetId, String slot, String status, int itemCnt, String msg, Instant endedAt) {
        WidgetCollectRun run = runRepository.findById(new WidgetCollectRunId(widgetId, slot)).orElseThrow();
        run.setStatus(status);
        run.setItemCnt(itemCnt);
        run.setMsg(msg == null ? null : msg.length() > WidgetCollectRun.MSG_MAX ? msg.substring(0, WidgetCollectRun.MSG_MAX) : msg);
        run.setEndedAt(endedAt);
        runRepository.save(run);
    }

    /** SLOT 이 slot 보다 작은 값·회차를 지운다(보관 기간 밖). 지운 DATA·RUN 행 수 합. */
    @Transactional
    public int purgeBefore(String slot) {
        return dataRepository.deleteBySlotBefore(slot) + runRepository.deleteBySlotBefore(slot);
    }
}
