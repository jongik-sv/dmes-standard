package com.dongkuk.caravan.core.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ConsumerGroupDescription;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.GroupState;
import org.apache.kafka.common.TopicPartition;
import org.springframework.stereotype.Service;

/**
 * Consumer group / topic offset 정보를 AdminClient 로 조회.
 *
 * <p>모든 인스턴스에서 동일 응답 (Kafka broker 가 source of truth) — NGINX LB 뒤에서도 일관.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KafkaGroupQueryService {

    private final AdminClient adminClient;

    /**
     * 단일 토픽에 대한 그룹 상태 + offset + lag 조회.
     *
     * @param groupId Consumer group ID
     * @param topicId Topic 이름 (1 partition 가정)
     * @return 그룹 정보 (state/members/currentOffset/maxOffset/lag)
     */
    public GroupInfo describe(String groupId, String topicId) {
        String state = "UNKNOWN";
        int members = 0;
        long currentOffset = -1L;
        long maxOffset = -1L;

        try {
            ConsumerGroupDescription desc = adminClient.describeConsumerGroups(List.of(groupId))
                    .all().get().get(groupId);
            if (desc != null) {
                GroupState s = desc.groupState();
                state = s == null ? "UNKNOWN" : s.toString();
                members = desc.members().size();
            }
        } catch (ExecutionException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            log.warn("[GroupQuery] describeConsumerGroups 실패 — groupId={}, error={}",
                    groupId, e.getMessage());
        }

        TopicPartition tp = new TopicPartition(topicId, 0);

        try {
            Map<TopicPartition, OffsetAndMetadata> offsets =
                    adminClient.listConsumerGroupOffsets(groupId)
                            .partitionsToOffsetAndMetadata().get();
            OffsetAndMetadata om = offsets.get(tp);
            if (om != null) {
                currentOffset = om.offset();
            }
        } catch (ExecutionException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            log.warn("[GroupQuery] listConsumerGroupOffsets 실패 — groupId={}, error={}",
                    groupId, e.getMessage());
        }

        try {
            Map<TopicPartition, OffsetSpec> req = new HashMap<>();
            req.put(tp, OffsetSpec.latest());
            ListOffsetsResult.ListOffsetsResultInfo info =
                    adminClient.listOffsets(req).all().get().get(tp);
            if (info != null) {
                maxOffset = info.offset();
            }
        } catch (ExecutionException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            log.warn("[GroupQuery] listOffsets 실패 — topic={}, error={}",
                    topicId, e.getMessage());
        }

        long lag = (currentOffset >= 0 && maxOffset >= 0) ? maxOffset - currentOffset : -1L;

        return GroupInfo.builder()
                .state(state)
                .members(members)
                .currentOffset(currentOffset)
                .maxOffset(maxOffset)
                .lag(lag)
                .build();
    }

    /**
     * 그룹 상태/offset/lag 정보. 조회 실패 시 -1 또는 UNKNOWN.
     */
    @Getter
    @Builder
    public static class GroupInfo {
        private final String state;
        private final int members;
        private final long currentOffset;
        private final long maxOffset;
        private final long lag;
    }
}
