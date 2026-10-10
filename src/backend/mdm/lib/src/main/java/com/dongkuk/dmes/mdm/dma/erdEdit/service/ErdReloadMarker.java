package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * DRAFT 삭제·새 DRAFT 를 구독자에게 알리는 표시(최종 검토 B2). 모델 JSON 이 명령 없이 통째로 바뀌므로 델타 대신 rev 하나와 표시 행을 남긴다.
 *
 * <p>호출자 트랜잭션 안에서만 부른다 — 모델 행을 잠그고({@link ErdModelStore#lockRev}, MANDATORY) rev 를 올린 뒤 표시 행을 쓰고, 알림은
 * 커밋 뒤에 한다. 잠금은 버전 행을 바꾸기 전에 잡는다: 명령 서비스와 같은 순서(모델 행 → 버전 행)라 서로 엇갈려 막히지 않는다.
 * 같은 트랜잭션에 합류하므로 연결을 하나 더 쓰지 않는다.
 */
@Component
public class ErdReloadMarker {

    public static final String DRAFT_DELETED = "DRAFT_DELETED";
    public static final String DRAFT_CREATED = "DRAFT_CREATED";
    /** TB_MDM_ERD_CMD_LOG.USER_ID 칸 크기. */
    static final int MAX_USER_ID = 50;

    private final ErdModelStore store;
    private final ErdCommandLogStore log;
    private final ErdEventHub hub;

    public ErdReloadMarker(ErdModelStore store, ErdCommandLogStore log, ErdEventHub hub) {
        this.store = store;
        this.log = log;
        this.hub = hub;
    }

    /** 모델 행을 잠근다(이미 잡았으면 그대로). 버전 행을 바꾸기 전에 불러 잠금 순서를 맞춘다. */
    public void lock(String modelId) {
        store.lockRev(modelId);
    }

    /** rev 를 하나 올리고 표시 행을 쓴 뒤, 커밋되면 표시 델타를 발행한다. 새 rev 를 돌려준다. */
    public long mark(String modelId, BigDecimal ver, String userId, String reason) {
        long rev = store.lockRev(modelId) + 1;
        store.setRev(modelId, rev);
        // 표시 행 USER_ID 는 50자다(감사 칼럼은 100자). 넘거나 비면 SYSTEM 으로 남긴다 — 표시 때문에 삭제·copy 가 S001 이 되지 않게.
        String who = userId == null || userId.isBlank() || userId.length() > MAX_USER_ID ? ErdDelta.MARKER_SOURCE : userId;
        log.insertMarker(modelId, rev, ver, who, reason);
        ErdDelta marker = new ErdDelta(modelId, rev, who, ErdDelta.MARKER_SESSION, ErdDelta.MARKER_SOURCE, List.of());
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                hub.publish(marker);
            }
        });
        return rev;
    }
}
