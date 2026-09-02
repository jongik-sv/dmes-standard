package com.dongkuk.caravan.core.offset;

import com.dongkuk.caravan.core.model.BrowseResult;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.stereotype.Service;

import java.text.SimpleDateFormat;
import java.time.Duration;
import java.util.*;

/**
 * Kafka 메시지 조회 서비스
 *
 * <p>Kafka 토픽의 메시지를 Offset 또는 시간 범위로 조회하는 기능을 제공합니다.
 * 디버깅, 모니터링, 메시지 내용 확인 등의 용도로 사용됩니다.</p>
 *
 * <h3>주요 기능</h3>
 * <ul>
 *   <li>Offset 범위 조회: 시작 Offset부터 끝 Offset까지의 메시지 조회</li>
 *   <li>시간 범위 조회: 특정 시간대의 메시지 조회</li>
 *   <li>단일 메시지 조회: 특정 Offset의 메시지 확인</li>
 * </ul>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * // Offset 범위로 조회
 * List<BrowseResult> messages = messageBrowser.browseByOffsetRange("my-topic", 100, 110);
 *
 * // 시간 범위로 조회 (최근 1시간, 최대 50건)
 * long now = System.currentTimeMillis();
 * List<BrowseResult> recentMessages = messageBrowser.browseByTimeRange(
 *     "my-topic", now - 3600000, now, 50);
 *
 * // 특정 Offset 메시지 확인
 * Optional<BrowseResult> message = messageBrowser.peekAtOffset("my-topic", 105);
 * }</pre>
 *
 * <h3>주의사항</h3>
 * <ul>
 *   <li>이 서비스는 별도의 Consumer를 생성하여 조회합니다.</li>
 *   <li>메인 Consumer Group의 Offset에 영향을 주지 않습니다.</li>
 *   <li>대량 조회 시 성능에 주의하세요.</li>
 * </ul>
 *
 * @author Caravan
 * @version 1.0.0
 * @see BrowseResult
 */
@Service
@RequiredArgsConstructor
public class MessageBrowser {

    private static final Logger log = LoggerFactory.getLogger(MessageBrowser.class);
    private static final int DEFAULT_PARTITION = 0;
    private static final Duration POLL_TIMEOUT = Duration.ofMillis(1000);

    private final ConsumerFactory<String, String> consumerFactory;

    /**
     * Offset 범위로 메시지를 조회합니다.
     *
     * <p>지정된 시작 Offset부터 끝 Offset까지의 메시지를 조회합니다.
     * 끝 Offset의 메시지도 결과에 포함됩니다.</p>
     *
     * <h4>사용 예시</h4>
     * <pre>{@code
     * // Offset 100부터 110까지 11개 메시지 조회
     * List<BrowseResult> messages = browser.browseByOffsetRange("my-topic", 100, 110);
     * for (BrowseResult msg : messages) {
     *     System.out.println(msg.getOffset() + ": " + msg.getValue());
     * }
     * }</pre>
     *
     * @param topic       조회할 토픽명
     * @param startOffset 시작 Offset (포함)
     * @param endOffset   끝 Offset (포함)
     * @return 조회된 메시지 목록 ({@link BrowseResult} 리스트)
     *         <ul>
     *           <li>Offset 순서대로 정렬됨</li>
     *           <li>조회 실패 시 빈 리스트 반환</li>
     *         </ul>
     */
    public List<BrowseResult> browseByOffsetRange(String topic, long startOffset, long endOffset) {
        log.info("메시지 조회 - topic: {}, offset: {} ~ {}", topic, startOffset, endOffset);

        List<BrowseResult> results = new ArrayList<>();

        try (Consumer<String, String> consumer = consumerFactory.createConsumer()) {
            TopicPartition tp = new TopicPartition(topic, DEFAULT_PARTITION);
            consumer.assign(Collections.singletonList(tp));
            consumer.seek(tp, startOffset);

            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(POLL_TIMEOUT);

                if (records.isEmpty()) {
                    break;
                }

                for (ConsumerRecord<String, String> record : records) {
                    if (record.offset() > endOffset) {
                        return results;
                    }

                    results.add(toBrowseResult(record));
                }
            }
        } catch (Exception e) {
            log.error("메시지 조회 실패 - topic: {}", topic, e);
        }

        return results;
    }

    /**
     * 시간 범위로 메시지를 조회합니다.
     *
     * <p>지정된 시작 시간부터 끝 시간까지의 메시지를 조회합니다.
     * 최대 조회 건수를 초과하면 조회를 중단합니다.</p>
     *
     * <h4>시간 형식</h4>
     * <p>타임스탬프는 Unix Epoch milliseconds 형식입니다.
     * {@code System.currentTimeMillis()}로 현재 시간을 얻을 수 있습니다.</p>
     *
     * <h4>사용 예시</h4>
     * <pre>{@code
     * // 최근 1시간 메시지 조회 (최대 100건)
     * long now = System.currentTimeMillis();
     * long oneHourAgo = now - 3600000;
     * List<BrowseResult> messages = browser.browseByTimeRange("my-topic", oneHourAgo, now, 100);
     * }</pre>
     *
     * @param topic         조회할 토픽명
     * @param fromTimestamp 시작 시간 (Unix Epoch milliseconds, 포함)
     * @param toTimestamp   끝 시간 (Unix Epoch milliseconds, 포함)
     * @param maxCount      최대 조회 건수
     * @return 조회된 메시지 목록 ({@link BrowseResult} 리스트)
     *         <ul>
     *           <li>시간순으로 정렬됨</li>
     *           <li>해당 시간대의 메시지가 없으면 빈 리스트 반환</li>
     *         </ul>
     */
    public List<BrowseResult> browseByTimeRange(String topic, long fromTimestamp, long toTimestamp, int maxCount) {
        log.info("메시지 조회 - topic: {}, time: {} ~ {}, max: {}",
            topic, fromTimestamp, toTimestamp, maxCount);

        List<BrowseResult> results = new ArrayList<>();

        try (Consumer<String, String> consumer = consumerFactory.createConsumer()) {
            TopicPartition tp = new TopicPartition(topic, DEFAULT_PARTITION);
            consumer.assign(Collections.singletonList(tp));

            // 시작 시간에 해당하는 offset 조회
            Map<TopicPartition, Long> timestampsToSearch = Collections.singletonMap(tp, fromTimestamp);
            Map<TopicPartition, org.apache.kafka.clients.consumer.OffsetAndTimestamp> offsetsForTimes = consumer.offsetsForTimes(timestampsToSearch);

            if (offsetsForTimes.get(tp) == null) {
                log.warn("해당 시간대의 메시지 없음 - topic: {}, from: {}", topic, fromTimestamp);
                return results;
            }

            long startOffset = offsetsForTimes.get(tp).offset();
            consumer.seek(tp, startOffset);

            while (results.size() < maxCount) {
                ConsumerRecords<String, String> records = consumer.poll(POLL_TIMEOUT);

                if (records.isEmpty()) {
                    break;
                }

                for (ConsumerRecord<String, String> record : records) {
                    if (record.timestamp() > toTimestamp) {
                        return results;
                    }

                    if (results.size() >= maxCount) {
                        return results;
                    }

                    results.add(toBrowseResult(record));
                }
            }
        } catch (Exception e) {
            log.error("메시지 조회 실패 - topic: {}", topic, e);
        }

        return results;
    }

    /**
     * 특정 Offset의 메시지를 조회합니다.
     *
     * <p>지정된 Offset의 단일 메시지만 조회합니다. 디버깅이나 문제 메시지 확인에 유용합니다.</p>
     *
     * <h4>사용 예시</h4>
     * <pre>{@code
     * // 에러 발생한 Offset 105번 메시지 확인
     * Optional<BrowseResult> message = browser.peekAtOffset("my-topic", 105);
     * message.ifPresent(msg -> {
     *     System.out.println("Key: " + msg.getKey());
     *     System.out.println("Value: " + msg.getValue());
     *     System.out.println("Time: " + msg.getTimestampStr());
     * });
     * }</pre>
     *
     * @param topic  조회할 토픽명
     * @param offset 조회할 Offset
     * @return 조회된 메시지를 담은 Optional
     *         <ul>
     *           <li>{@code Optional.of(BrowseResult)}: 메시지 발견 시</li>
     *           <li>{@code Optional.empty()}: 메시지 미발견 또는 조회 실패 시</li>
     *         </ul>
     */
    public Optional<BrowseResult> peekAtOffset(String topic, long offset) {
        log.info("메시지 조회 - topic: {}, offset: {}", topic, offset);

        try (Consumer<String, String> consumer = consumerFactory.createConsumer()) {
            TopicPartition tp = new TopicPartition(topic, DEFAULT_PARTITION);
            consumer.assign(Collections.singletonList(tp));
            consumer.seek(tp, offset);

            ConsumerRecords<String, String> records = consumer.poll(POLL_TIMEOUT);

            for (ConsumerRecord<String, String> record : records) {
                if (record.offset() == offset) {
                    return Optional.of(toBrowseResult(record));
                }
            }
        } catch (Exception e) {
            log.error("메시지 조회 실패 - topic: {}, offset: {}", topic, offset, e);
        }

        return Optional.empty();
    }

    private BrowseResult toBrowseResult(ConsumerRecord<String, String> record) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS");

        return BrowseResult.builder()
            .offset(record.offset())
            .partition(record.partition())
            .topic(record.topic())
            .key(record.key())
            .value(record.value())
            .timestamp(record.timestamp())
            .timestampStr(sdf.format(new Date(record.timestamp())))
            .build();
    }
}
