package com.dongkuk.dmes.mcm.widget.collect.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.time.Instant;
import org.springframework.data.domain.Persistable;

/**
 * 정시 수집 회차 — 스펙 2026-10-05 정시 수집 §3. PK (WIDGET_ID, SLOT). 수집 시작 때 STATUS=RUN 으로 먼저 넣어(PK 위반이면 다른 인스턴스가
 * 이미 잡은 시각) 중복 수집을 막고, 끝나면 OK·FAIL 로 바꾼다.
 * 키가 직접 정한 값이라 Spring Data {@code save} 가 merge(있으면 덮어쓰기)로 흐르지 않도록 {@link Persistable} 로 새 행이면 늘 insert(persist)
 * 한다 — 같은 PK 를 두 번 넣으면 덮어쓰지 않고 무결성 예외가 난다.
 */
@Entity
@Table(name = "TB_MCM_WIDGET_COLLECT_RUN", schema = "MCMAPUSER")
@IdClass(WidgetCollectRunId.class)
public class WidgetCollectRun extends McmAuditEntity implements Persistable<WidgetCollectRunId> {

    public static final String STATUS_RUN = "RUN";
    public static final String STATUS_OK = "OK";
    public static final String STATUS_FAIL = "FAIL";
    public static final int MSG_MAX = 200;

    @Id
    @Column(name = "WIDGET_ID", length = 40, nullable = false)
    private String widgetId;

    @Id
    @Column(name = "SLOT", length = 12, nullable = false)
    private String slot;

    @Column(name = "STATUS", length = 4, nullable = false)
    private String status;

    @Column(name = "ITEM_CNT")
    private Integer itemCnt;

    @Column(name = "MSG", length = MSG_MAX)
    private String msg;

    @Column(name = "STARTED_AT")
    private Instant startedAt;

    @Column(name = "ENDED_AT")
    private Instant endedAt;

    @Transient
    private boolean isNew = true;

    public WidgetCollectRun() {}

    public static WidgetCollectRun start(String widgetId, String slot, Instant startedAt) {
        WidgetCollectRun run = new WidgetCollectRun();
        run.widgetId = widgetId;
        run.slot = slot;
        run.status = STATUS_RUN;
        run.itemCnt = 0;
        run.startedAt = startedAt;
        return run;
    }

    @Override
    public WidgetCollectRunId getId() { return new WidgetCollectRunId(widgetId, slot); }

    @Override
    public boolean isNew() { return isNew; }

    @PostLoad
    @PostPersist
    void markNotNew() { this.isNew = false; }

    public String getWidgetId() { return widgetId; }
    public void setWidgetId(String widgetId) { this.widgetId = widgetId; }
    public String getSlot() { return slot; }
    public void setSlot(String slot) { this.slot = slot; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getItemCnt() { return itemCnt; }
    public void setItemCnt(Integer itemCnt) { this.itemCnt = itemCnt; }
    public String getMsg() { return msg; }
    public void setMsg(String msg) { this.msg = msg; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getEndedAt() { return endedAt; }
    public void setEndedAt(Instant endedAt) { this.endedAt = endedAt; }
}
