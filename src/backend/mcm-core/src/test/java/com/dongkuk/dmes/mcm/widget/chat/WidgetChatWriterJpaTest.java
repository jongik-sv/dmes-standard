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

/** {@link WidgetChatWriter} — MSG_SEQ 채번·인스턴스당 100개 유지·reset(사용자·인스턴스 격리)·바깥 트랜잭션과 따로 커밋, H2. */
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
}
