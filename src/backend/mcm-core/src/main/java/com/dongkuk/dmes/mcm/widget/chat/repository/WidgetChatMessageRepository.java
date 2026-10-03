package com.dongkuk.dmes.mcm.widget.chat.repository;

import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessage;
import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessageId;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** {@code MCMAPUSER.TB_MCM_SEC_USER_WIDGET_CHAT} — 스펙 2026-10-02-widget-admin-generic §4.5. 늘 (userId, instId) 로 묶어 읽는다(IDOR). */
public interface WidgetChatMessageRepository extends JpaRepository<WidgetChatMessage, WidgetChatMessageId> {

    /** history — 오래된 순 전부. */
    List<WidgetChatMessage> findByUserIdAndInstIdOrderByMsgSeqAsc(String userId, String instId);

    /** 문맥 — 최근 20개(새것부터). 호출자가 뒤집어 쓴다. */
    List<WidgetChatMessage> findTop20ByUserIdAndInstIdOrderByMsgSeqDesc(String userId, String instId);

    @Query("select max(m.msgSeq) from WidgetChatMessage m where m.userId = :userId and m.instId = :instId")
    Integer findMaxMsgSeq(@Param("userId") String userId, @Param("instId") String instId);

    /** msgSeq 가 maxSeq 이하인 오래된 기록을 지운다(100개 유지). 트랜잭션은 호출하는 Writer 가 연다. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from WidgetChatMessage m where m.userId = :userId and m.instId = :instId and m.msgSeq <= :maxSeq")
    int deleteUpTo(@Param("userId") String userId, @Param("instId") String instId, @Param("maxSeq") int maxSeq);

    /** 사용자 기록 수(모든 인스턴스 합계) — 사용자별 저장 상한. */
    long countByUserId(String userId);

    /** 사용자 기록을 오래된 순(C_AT, 인스턴스, MSG_SEQ)으로 — 사용자별 상한을 넘은 만큼 앞에서부터 지운다. */
    List<WidgetChatMessage> findByUserIdOrderByCreatedAtAscInstIdAscMsgSeqAsc(String userId, Pageable pageable);

    /** reset — 그 인스턴스 기록 전부. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from WidgetChatMessage m where m.userId = :userId and m.instId = :instId")
    int deleteAllOf(@Param("userId") String userId, @Param("instId") String instId);
}
