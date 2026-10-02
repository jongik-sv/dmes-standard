package com.dongkuk.dmes.mcm.widget.chat.service;

import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessage;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 챗봇 기록 쓰기의 트랜잭션 경계(스펙 §4.5·§5). OASIS 서비스 빈({@link WidgetChatService})에는 {@code @Transactional} 을 붙일 수
 * 없어(CGLIB 프록시가 파라미터명 메타데이터를 잃는다, BackEnd 표준 §6-B-1) 원자성이 필요한 쓰기를 이 빈에 모은다 — A 의
 * {@code SecWidgetTabWriter} 와 같은 방식.
 * <p>모든 쓰기는 {@code REQUIRES_NEW} — 부르는 쪽에 트랜잭션이 있어도 합류하지 않고 호출마다 바로 커밋한다. OASIS 는 서비스
 * 전체를 txBiz 하나로 감싸고 예외면 롤백하므로, 합류하면 공급자 실패 때 사용자 메시지까지 사라진다(스펙 §9.2 위반).
 * LLM 을 기다리는 동안 트랜잭션을 잡지 않는 것은 서비스가 바깥 트랜잭션을 내려놓고(NOT_SUPPORTED) 부르기 때문이다 — 로컬
 * SQLite 에서는 바깥 트랜잭션이 먼저 읽기만 해도 이 커밋이 SQLITE_BUSY 로 막히므로, 바깥 트랜잭션 안에서 부르지 않는다.
 */
@Component("widgetChatWriter")
public class WidgetChatWriter {

    /** 인스턴스당 남기는 기록 수. */
    public static final int KEEP_PER_INSTANCE = 100;

    private final WidgetChatMessageRepository repository;

    @Autowired
    public WidgetChatWriter(WidgetChatMessageRepository repository) {
        this.repository = repository;
    }

    /**
     * 메시지 하나를 MSG_SEQ = 그 인스턴스 최대+1 로 넣고, 같은 트랜잭션에서 100개를 넘는 오래된 기록을 지운다.
     * 번호는 넣기만 하고 앞에서부터 지우므로 늘 이어진다 — 「최근 100개」 = MSG_SEQ 가 (새 번호 − 100) 보다 큰 행.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public WidgetChatMessage append(String userId, String instId, String roleTp, String content, String linksJson) {
        Integer max = repository.findMaxMsgSeq(userId, instId);
        int seq = max == null ? 1 : max + 1;
        WidgetChatMessage m = new WidgetChatMessage();
        m.setUserId(userId);
        m.setInstId(instId);
        m.setMsgSeq(seq);
        m.setRoleTp(roleTp);
        m.setContent(content);
        m.setLinksJson(linksJson);
        WidgetChatMessage saved = repository.save(m);
        if (seq > KEEP_PER_INSTANCE) {
            repository.deleteUpTo(userId, instId, seq - KEEP_PER_INSTANCE);
        }
        return saved;
    }

    /** [새 대화] — 그 사용자·인스턴스 기록 전부. 지운 수. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int reset(String userId, String instId) {
        return repository.deleteAllOf(userId, instId);
    }
}
