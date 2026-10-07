package com.dongkuk.dmes.mcm.widget.collect;

import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectData;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectDataId;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRun;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRunId;
import com.dongkuk.dmes.mcm.widget.collect.repository.WidgetCollectDataRepository;
import com.dongkuk.dmes.mcm.widget.collect.repository.WidgetCollectRunRepository;
import jakarta.persistence.PersistenceException;
import java.time.Instant;
import java.util.List;
import java.util.function.ToIntFunction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 정시 수집 쓰기의 트랜잭션 경계(스펙 2026-10-05 정시 수집 §3) — 수집기가 자기 호출이 아닌 이 빈을 거쳐야 {@code @Transactional} 프록시가 걸린다.
 * 한 메서드가 한 트랜잭션이라, 수집기는 외부 호출(HTTP·SQL)을 하는 동안 DB 트랜잭션을 쥐지 않는다.
 */
@Component
public class WidgetCollectWriter {

    private static final Logger log = LoggerFactory.getLogger(WidgetCollectWriter.class);

    private final WidgetCollectRunRepository runRepository;
    private final WidgetCollectDataRepository dataRepository;

    @Autowired
    public WidgetCollectWriter(WidgetCollectRunRepository runRepository, WidgetCollectDataRepository dataRepository) {
        this.runRepository = runRepository;
        this.dataRepository = dataRepository;
    }

    /**
     * 이 (정의, 시각)을 잡는다 — 확인 없이 RUN 행을 바로 insert 한다(먼저 읽고 넣으면 두 인스턴스가 모두 통과하는 틈이 생긴다).
     * PK 위반이면 다른 인스턴스·이전 시도가 이미 잡은 시각이라 false(건너뜀). 다른 DB 오류도 다시 해 보지 않고 경고 로그만 남긴 채
     * false 로 건너뛴다(다음 분에 다시 잡는다). 트랜잭션은 저장소 호출 하나가 맡는다(여기서 묶으면 위반이 롤백 표식을 남긴다).
     */
    public boolean tryStart(String widgetId, String slot, Instant startedAt) {
        try {
            runRepository.saveAndFlush(WidgetCollectRun.start(widgetId, slot, startedAt));
            return true;
        } catch (DataIntegrityViolationException e) {
            // PK 중복이면 다른 인스턴스·이전 시도가 이미 잡은 시각이라 정상 건너뜀(로그 없음). 행이 없는데 위반이면 다른 제약(NOT NULL·길이·CHECK)이다.
            if (!runRepository.existsById(new WidgetCollectRunId(widgetId, slot))) {
                log.warn("정시 수집 회차 잡기 무결성 오류(PK 중복 아님) defId={} 원인={}", widgetId, e.getClass().getSimpleName());
            }
            return false;
        } catch (DataAccessException | PersistenceException e) {
            log.warn("정시 수집 회차 잡기 실패 defId={} 원인={}", widgetId, e.getClass().getSimpleName());
            return false;
        }
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

    /**
     * SLOT 이 cutoff 보다 작은(보관 기간 밖) 값·회차를 한 덩어리(최대 약 limit 행씩) 지운다. 한 번에 모두 지우면 긴 트랜잭션·언두가 쌓이므로
     * n 번째 행의 SLOT 까지만 지운다(같은 SLOT 의 행은 함께 지우므로 덩어리가 limit 를 조금 넘을 수 있고 한 SLOT 은 최대 정의 50 x 항목 50 행이다).
     * 호출자가 0 이 나올 때까지 되풀이한다.
     *
     * @return 이번 덩어리에서 지운 DATA·RUN 행 수 합(0 이면 더 지울 것이 없다)
     */
    @Transactional
    public int purgeChunk(String cutoffSlot, int limit) {
        return chunk(dataRepository.findSlotsBefore(cutoffSlot, PageRequest.of(limit - 1, 1)), cutoffSlot,
                dataRepository::deleteBySlotAtMost, dataRepository::deleteBySlotBefore)
                + chunk(runRepository.findSlotsBefore(cutoffSlot, PageRequest.of(limit - 1, 1)), cutoffSlot,
                runRepository::deleteBySlotAtMost, runRepository::deleteBySlotBefore);
    }

    /** boundary 가 있으면(limit 행 넘게 있다) 그 SLOT 이하만, 없으면 cutoff 미만 전부 지운다. */
    private static int chunk(List<String> boundary, String cutoffSlot, ToIntFunction<String> atMost, ToIntFunction<String> before) {
        return boundary.isEmpty() ? before.applyAsInt(cutoffSlot) : atMost.applyAsInt(boundary.get(0));
    }
}
