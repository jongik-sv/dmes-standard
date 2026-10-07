package com.dongkuk.dmes.mcm.widget.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessage;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.chat.service.WidgetChatWriter;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** {@link WidgetChatWriter} — MSG_SEQ 채번·인스턴스당 100개 유지·reset(사용자·인스턴스 격리)·바깥 트랜잭션과 따로 커밋, Oracle 시험 PDB. */
@SpringJUnitConfig(WidgetChatJpaTestConfig.class)
class WidgetChatWriterJpaTest {

    @Autowired WidgetChatWriter writer;
    @Autowired WidgetChatMessageRepository repository;
    @Autowired PlatformTransactionManager transactionManager;

    @BeforeEach
    void clean() {
        repository.deleteAllInBatch();
    }

    @Test
    @DisplayName("MSG_SEQ 는 사용자·인스턴스마다 최대+1 로 1부터 매기고, 4000자 넘는 본문도 저장된다")
    void assignsSeqPerUserAndInstance() {
        String longText = "가".repeat(5000);
        assertThat(writer.append("userA", "i1", "user", "q1", null).getMsgSeq()).isEqualTo(1);
        assertThat(writer.append("userA", "i1", "assistant", longText, "[{\"pageId\":\"p\",\"title\":\"t\"}]").getMsgSeq())
                .isEqualTo(2);
        assertThat(writer.append("userA", "i2", "user", "q", null).getMsgSeq()).isEqualTo(1);
        assertThat(writer.append("userB", "i1", "user", "q", null).getMsgSeq()).isEqualTo(1);

        List<WidgetChatMessage> a1 = repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "i1");
        assertThat(a1).extracting(WidgetChatMessage::getMsgSeq).containsExactly(1, 2);
        assertThat(a1.get(1).getContent()).hasSize(5000);
        assertThat(a1.get(1).getLinksJson()).contains("pageId");
    }

    @Test
    @DisplayName("인스턴스당 100개를 넘으면 오래된 것부터 지운다 — 다른 인스턴스·사용자는 그대로")
    void keepsLatestHundred() {
        for (int i = 1; i <= 100; i++) writer.append("userA", "i1", i % 2 == 1 ? "user" : "assistant", "m" + i, null);
        writer.append("userA", "i2", "user", "other", null);
        writer.append("userB", "i1", "user", "other", null);

        writer.append("userA", "i1", "user", "m101", null);
        writer.append("userA", "i1", "assistant", "m102", null);

        List<WidgetChatMessage> kept = repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "i1");
        assertThat(kept).hasSize(WidgetChatWriter.KEEP_PER_INSTANCE);
        assertThat(kept.get(0).getMsgSeq()).isEqualTo(3);
        assertThat(kept.get(99).getContent()).isEqualTo("m102");
        assertThat(repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "i2")).hasSize(1);
        assertThat(repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userB", "i1")).hasSize(1);
    }

    @Test
    @DisplayName("reset 은 그 사용자·인스턴스 기록만 지우고 지운 수를 돌려준다. 지운 뒤 번호는 1부터 다시")
    void resetDeletesOnlyOwnInstance() {
        writer.append("userA", "i1", "user", "q", null);
        writer.append("userA", "i1", "assistant", "a", null);
        writer.append("userA", "i2", "user", "q", null);
        writer.append("userB", "i1", "user", "q", null);

        assertThat(writer.reset("userA", "i1")).isEqualTo(2);

        assertThat(repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "i1")).isEmpty();
        assertThat(repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "i2")).hasSize(1);
        assertThat(repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userB", "i1")).hasSize(1);
        assertThat(writer.append("userA", "i1", "user", "again", null).getMsgSeq()).isEqualTo(1);
    }

    @Test
    @DisplayName("쓰기는 바깥 트랜잭션에 합류하지 않는다(REQUIRES_NEW) — 바깥이 롤백돼도 append·reset 결과는 남는다")
    void writesCommitIndependentlyOfOuterTransaction() {
        writer.append("userA", "i2", "user", "old", null);
        TransactionTemplate outer = new TransactionTemplate(transactionManager);

        outer.executeWithoutResult(st -> {
            writer.append("userA", "i1", "user", "q", null);
            writer.reset("userA", "i2");
            st.setRollbackOnly();
        });

        assertThat(repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "i1")).extracting(WidgetChatMessage::getContent)
                .containsExactly("q");
        assertThat(repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "i2")).isEmpty();
    }

    @Test
    @DisplayName("사용자 기록 합계가 상한을 넘으면 인스턴스와 관계없이 그 사용자의 가장 오래된 기록부터 지운다 — instId 를 바꿔도 합계는 상한")
    void capsUserTotalAcrossInstances() {
        WidgetChatWriter small = new WidgetChatWriter(repository, 5); // 트랜잭션은 시험이 감싼다(빈이 아니라 프록시가 없다)
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        writer.append("userB", "i1", "user", "other", null);

        tx.executeWithoutResult(s -> small.append("userA", "i1", "user", "a1", null));
        tx.executeWithoutResult(s -> small.append("userA", "i1", "assistant", "a2", null));
        tx.executeWithoutResult(s -> small.append("userA", "i2", "user", "b1", null));
        tx.executeWithoutResult(s -> small.append("userA", "i3", "user", "c1", null));
        tx.executeWithoutResult(s -> small.append("userA", "i4", "user", "d1", null));
        assertThat(repository.countByUserId("userA")).isEqualTo(5);

        for (int k = 10; k < 30; k++) { // 인스턴스 ID 를 바꿔 가며 20개 더
            String inst = "inst" + k;
            String text = "x" + k;
            tx.executeWithoutResult(s -> small.append("userA", inst, "user", text, null));
            assertThat(repository.countByUserId("userA")).isEqualTo(5);
        }

        assertThat(repository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "i1")).isEmpty(); // 가장 오래된 것부터 지워졌다
        assertThat(repository.findAll()).filteredOn(m -> "userA".equals(m.getUserId()))
                .extracting(WidgetChatMessage::getContent).containsExactlyInAnyOrder("x25", "x26", "x27", "x28", "x29");
        assertThat(repository.countByUserId("userB")).isEqualTo(1); // 다른 사용자는 그대로
    }

    @Test
    @DisplayName("사용자별 상한은 설정값(기본 300)을 쓰고, 0 이하면 기본값이다")
    void userHistoryLimitDefaults() {
        assertThat(writer.userHistoryLimit()).isEqualTo(WidgetChatWriter.DEFAULT_USER_HISTORY_LIMIT);
        assertThat(new WidgetChatWriter(repository, 0).userHistoryLimit()).isEqualTo(300);
        com.dongkuk.dmes.mcm.widget.chat.WidgetLlmProperties props = new com.dongkuk.dmes.mcm.widget.chat.WidgetLlmProperties();
        props.setUserHistoryLimit(50);
        assertThat(new WidgetChatWriter(repository, props).userHistoryLimit()).isEqualTo(50);
    }
}
