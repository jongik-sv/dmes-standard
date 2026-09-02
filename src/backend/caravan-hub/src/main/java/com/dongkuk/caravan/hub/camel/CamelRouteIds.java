package com.dongkuk.caravan.hub.camel;

/**
 * Camel 라우트 ID 명명 규약.
 *
 * <p>라우트 ID 는 로그·{@link CamelRouteControlService} 제어·모니터링의 키가 되므로 규약을 고정한다.</p>
 * <ul>
 *   <li><b>정적 라우트</b>: {@code inbound-http}, {@code outbound-dispatch}, {@code outbound-http/db/file}.</li>
 *   <li><b>동적 라우트</b>(토픽/설정 단위 생성): {@code inbound-db-<topicId>}, {@code inbound-file-<topicId>}.
 *       폴링 주기 실시간 반영(D11)은 해당 라우트만 {@code removeRoute}+{@code addRoute} 로 교체한다.</li>
 * </ul>
 */
public final class CamelRouteIds {

    private CamelRouteIds() {
    }

    /** 인바운드 HTTP 수신 라우트(단일). {@code camel-servlet} → {@code /caravanHubApi/v1/send} (P3). */
    public static final String INBOUND_HTTP = "inbound-http";

    /** 인바운드 DB 폴링 라우트 ID 접두사. 실제 ID = {@code inbound-db-<topicId>} (P3). */
    public static final String INBOUND_DB_PREFIX = "inbound-db-";

    /** 인바운드 FILE(SFTP) 폴링 라우트 ID 접두사. 실제 ID = {@code inbound-file-<topicId>} (P3). */
    public static final String INBOUND_FILE_PREFIX = "inbound-file-";

    /** 아웃바운드 진입 라우트({@code direct:}). BusinessStart 브릿지가 여기로 전달 (P4). */
    public static final String OUTBOUND_DISPATCH = "outbound-dispatch";

    /** 아웃바운드 HTTP 전송 라우트 (P4). */
    public static final String OUTBOUND_HTTP = "outbound-http";

    /** 아웃바운드 DB insert 라우트 (P4). */
    public static final String OUTBOUND_DB = "outbound-db";

    /** 아웃바운드 FILE(SFTP) 전송 라우트 (P4). */
    public static final String OUTBOUND_FILE = "outbound-file";

    /**
     * 동적 인바운드 DB 라우트 ID 생성.
     *
     * @param topicId 토픽 ID
     * @return {@code inbound-db-<topicId>}
     */
    public static String inboundDb(String topicId) {
        return INBOUND_DB_PREFIX + topicId;
    }

    /**
     * 동적 인바운드 FILE 라우트 ID 생성.
     *
     * @param topicId 토픽 ID
     * @return {@code inbound-file-<topicId>}
     */
    public static String inboundFile(String topicId) {
        return INBOUND_FILE_PREFIX + topicId;
    }
}
