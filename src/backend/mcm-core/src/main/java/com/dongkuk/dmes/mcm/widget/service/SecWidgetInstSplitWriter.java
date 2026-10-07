package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessage;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemo;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemoId;
import com.dongkuk.dmes.mcm.widget.memo.repository.WidgetMemoRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 개인 탭 위젯의 instId 를 새로 발급하면서 그 위젯의 메모·대화를 새 instId 로 <b>복사</b>하는 트랜잭션 경계
 * (스펙 2026-10-07-widget-fixed-tabs §4, 고정 탭 위젯과 같은 instId 를 쓰는 개인 탭 위젯의 메모·대화 분리).
 * 옛 instId 의 메모·대화 행은 지우지 않는다 — 고정 탭 위젯이 계속 쓴다. 한 트랜잭션이라 중간에 실패하면 모두 되돌아가고,
 * 이미 나뉜 위젯(옛 instId 행이 없음)은 건너뛰므로 두 번 불러도 같은 결과다. 복사는 메모 사용자당 100개·대화 사용자별 상한 검사를 거치지 않으므로
 * 상한을 넘을 수 있다(넘으면 새 메모 저장·새 대화 때 각 Writer 가 평소대로 막거나 오래된 대화부터 정리한다).
 */
@Component("secWidgetInstSplitWriter")
public class SecWidgetInstSplitWriter {

    /** 개인 탭 {@code tabId} 의 위젯 {@code fromInstId} 를 {@code toInstId} 로 바꾼다. */
    public record Split(String tabId, String fromInstId, String toInstId) {}

    private final SecUserWidgetRepository widgetRepository;
    private final WidgetMemoRepository memoRepository;
    private final WidgetChatMessageRepository chatRepository;

    @Autowired
    public SecWidgetInstSplitWriter(SecUserWidgetRepository widgetRepository, WidgetMemoRepository memoRepository,
                                    WidgetChatMessageRepository chatRepository) {
        this.widgetRepository = widgetRepository;
        this.memoRepository = memoRepository;
        this.chatRepository = chatRepository;
    }

    /**
     * 목록의 위젯마다 (1) 옛 instId 의 메모·대화를 (userId, 새 instId) 로 복사하고 (2) 위젯 행의 INST_ID 만 새 값으로 바꾼다(행 삭제 없음,
     * 감사 칸 U_AT·U_USR_ID 갱신). 위젯 행이 이미 없으면(다른 요청이 먼저 나눔) 그 항목은 건너뛴다. 새 instId 쪽에 이미 메모·대화가
     * 있으면 덮어쓰지 않는다. 부르는 쪽은 OASIS 바깥 트랜잭션을 내려놓고 부른다({@link SecWidgetTabWriter#moveTabs} 와 같은 이유).
     * @return 실제로 나눈 위젯 수
     */
    @Transactional
    public int splitInstIds(String userId, List<Split> splits) {
        int done = 0;
        Instant now = Instant.now();
        for (Split s : splits) {
            if (widgetRepository.renameInstId(userId, s.tabId(), s.fromInstId(), s.toInstId(), now) == 0) continue;
            copyMemo(userId, s.fromInstId(), s.toInstId());
            copyChat(userId, s.fromInstId(), s.toInstId());
            done++;
        }
        return done;
    }

    private void copyMemo(String userId, String from, String to) {
        WidgetMemo src = memoRepository.findById(new WidgetMemoId(userId, from)).orElse(null);
        if (src == null || memoRepository.existsById(new WidgetMemoId(userId, to))) return;
        WidgetMemo copy = new WidgetMemo();
        copy.setUserId(userId);
        copy.setInstId(to);
        copy.setDefId(src.getDefId());
        copy.setFmt(src.getFmt());
        copy.setContent(src.getContent());
        copy.setTitle(src.getTitle());
        copy.setCreatedAt(src.getCreatedAt()); // 원본 C_AT 유지(U_AT 은 저장 시각으로 새로 찍힌다)
        memoRepository.save(copy);
    }

    private void copyChat(String userId, String from, String to) {
        if (chatRepository.findMaxMsgSeq(userId, to) != null) return;
        List<WidgetChatMessage> copies = new ArrayList<>();
        for (WidgetChatMessage m : chatRepository.findByUserIdAndInstIdOrderByMsgSeqAsc(userId, from)) {
            WidgetChatMessage c = new WidgetChatMessage();
            c.setUserId(userId);
            c.setInstId(to);
            c.setMsgSeq(m.getMsgSeq());
            c.setRoleTp(m.getRoleTp());
            c.setContent(m.getContent());
            c.setLinksJson(m.getLinksJson());
            c.setCreatedAt(m.getCreatedAt()); // 원본 C_AT 유지 — 사용자별 상한 정리가 C_AT 오래된 순이라 복사본이 원본을 밀어내지 않게
            copies.add(c);
        }
        chatRepository.saveAll(copies);
    }
}
