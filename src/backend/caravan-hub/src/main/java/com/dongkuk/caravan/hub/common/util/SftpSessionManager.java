package com.dongkuk.caravan.hub.common.util;

import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SFTP 세션 캐싱 공통 유틸리티.
 *
 * <p>INBOUND({@link com.dongkuk.caravan.hub.inbound.file.FileInboundHandler})와
 * OUTBOUND({@link com.dongkuk.caravan.hub.outbound.file.FileOutboundHandler}) 모두 사용하는
 * SFTP 세션 관리 컴포넌트이다.</p>
 *
 * <h3>세션 캐싱 전략</h3>
 * <ul>
 *   <li>캐시 키: {@code "호스트:포트:유저"} (예: {@code "10.10.90.156:22:sftpuser"})</li>
 *   <li><b>세션</b>: TCP 연결 + SSH 핸드셰이크 비용이 크므로 캐싱하여 재사용</li>
 *   <li><b>채널</b>: 비용이 작고 스레드 안전하지 않으므로 매번 새로 생성/닫기</li>
 * </ul>
 *
 * <h3>스레드 안전성</h3>
 * <p>{@link #getOrCreateSession}은 {@code synchronized} 메서드로,
 * 동시에 여러 스레드가 같은 호스트로 세션을 만들려고 하면 하나만 생성된다.</p>
 *
 * <h3>오류 처리</h3>
 * <p>채널 사용 시 {@code JSchException}이 발생하면 호출자가 {@link #removeSession}을 호출하여
 * 캐시에서 제거해야 다음 폴링 때 재연결된다.</p>
 *
 * @see com.dongkuk.caravan.hub.inbound.file.FileInboundHandler
 * @see com.dongkuk.caravan.hub.outbound.file.FileOutboundHandler
 */
@Component
@Slf4j
public class SftpSessionManager {

    /** SFTP 세션 캐시. 키: {@code "호스트:포트:유저"}, 값: JSch {@link Session} */
    private final ConcurrentHashMap<String, Session> sessionCache = new ConcurrentHashMap<>();

    /**
     * 캐시된 SFTP 세션을 가져오거나, 없으면 새로 생성한다.
     *
     * <p>처리 순서:</p>
     * <ol>
     *   <li>캐시에서 세션 조회</li>
     *   <li>세션이 있고 연결 상태이면 그대로 반환</li>
     *   <li>세션이 있지만 끊어졌으면 제거 후 새로 생성</li>
     *   <li>세션이 없으면 새로 생성하여 캐시에 저장</li>
     * </ol>
     *
     * <p>{@code StrictHostKeyChecking=no}로 설정하여 known_hosts 검증을 건너뛴다.
     * 연결 타임아웃은 10초이다.</p>
     *
     * @param host     SFTP 호스트
     * @param port     SFTP 포트
     * @param user     SFTP 사용자
     * @param password SFTP 비밀번호
     * @return 연결된 SFTP 세션. 생성 실패 시 {@code null}
     */
    public synchronized Session getOrCreateSession(String host, int port, String user, String password) {
        String cacheKey = host + ":" + port + ":" + user;
        Session session = sessionCache.get(cacheKey);

        // 세션이 유효한지 확인
        if (session != null && session.isConnected()) {
            return session;
        }

        // 기존 세션이 있지만 끊어진 경우 제거
        if (session != null) {
            sessionCache.remove(cacheKey);
            try {
                session.disconnect();
            } catch (Exception ignored) {}
        }

        try {
            // 새 세션 생성
            JSch jsch = new JSch();
            session = jsch.getSession(user, host, port);
            session.setPassword(password);
            session.setConfig("StrictHostKeyChecking", "no");
            session.setConfig("PreferredAuthentications", "password");
            session.connect(10000); // 10초 타임아웃

            sessionCache.put(cacheKey, session);
            log.info("SFTP 세션 생성 - {}", cacheKey);

            return session;

        } catch (JSchException e) {
            log.error("SFTP 세션 생성 실패 - {}", cacheKey, e);
            return null;
        }
    }

    /**
     * 캐시에서 SFTP 세션을 제거한다.
     *
     * <p>SFTP 채널 사용 중 {@code JSchException}이 발생했을 때 호출하여
     * 다음 폴링에서 새 세션이 생성되도록 한다.</p>
     *
     * @param host SFTP 호스트
     * @param port SFTP 포트
     * @param user SFTP 사용자
     */
    public void removeSession(String host, int port, String user) {
        String cacheKey = host + ":" + port + ":" + user;
        Session session = sessionCache.remove(cacheKey);
        if (session != null) {
            try {
                session.disconnect();
            } catch (Exception ignored) {}
            log.debug("SFTP 세션 캐시 제거 - {}", cacheKey);
        }
    }

    /**
     * 애플리케이션 종료 시 캐시에 남아있는 모든 SFTP 세션을 disconnect한다.
     *
     * <p>Spring 컨테이너 종료 시 {@code @PreDestroy}에 의해 자동 호출된다.</p>
     */
    @PreDestroy
    public void destroy() {
        log.info("SFTP 세션 정리 시작 - 세션 수: {}", sessionCache.size());

        for (String key : sessionCache.keySet()) {
            try {
                Session session = sessionCache.get(key);
                if (session != null && session.isConnected()) {
                    session.disconnect();
                }
            } catch (Exception e) {
                log.warn("SFTP 세션 종료 오류 - {}", key, e);
            }
        }
        sessionCache.clear();

        log.info("SFTP 세션 정리 완료");
    }
}
