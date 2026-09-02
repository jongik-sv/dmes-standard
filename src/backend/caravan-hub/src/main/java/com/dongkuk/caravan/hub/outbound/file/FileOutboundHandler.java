package com.dongkuk.caravan.hub.outbound.file;

import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.hub.common.util.SftpSessionManager;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Map;

/**
 * OUTBOUND FILE(SFTP) 처리 핸들러.
 *
 * <p>Kafka에서 수신한 메시지를 SFTP 서버에 텍스트 파일로 생성한다.
 * INBOUND의 {@link com.dongkuk.caravan.hub.inbound.file.FileInboundHandler}와
 * 동일한 {@link SftpSessionManager}를 사용하여 같은 호스트/포트/유저에 대해 세션이 공유된다.</p>
 *
 * <h3>파일명 규칙</h3>
 * <pre>{@code {TOPIC_ID}_{yyyyMMddHHmmss}_{UUID앞8자리}.txt}</pre>
 * <p>예: {@code MMPPMMCMTT01_20260205105500_840d4999.txt}</p>
 * <p>UUID 앞 8자리는 {@code KAFKA_KEYDATA}에서 하이픈 제거 후 추출한다.</p>
 *
 * <h3>파일 내용</h3>
 * <p>{@code INTERFACE_MSG} 값이 그대로 파일 내용이 된다 (UTF-8 인코딩).</p>
 *
 * @see com.dongkuk.caravan.hub.outbound.OutboundDispatchRoute
 * @see SftpSessionManager
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class FileOutboundHandler {

    private final SftpSessionManager sftpSessionManager;

    /**
     * Kafka 수신 메시지를 SFTP 서버에 파일로 업로드한다.
     *
     * <p>처리 순서:</p>
     * <ol>
     *   <li>config에서 {@code FILE_PATH}, {@code FTP_HOST}, {@code FTP_PORT}, {@code FTP_USER}, {@code FTP_PASSWORD} 추출</li>
     *   <li>context에서 {@code INTERFACE_ID}, {@code KAFKA_KEYDATA}, {@code INTERFACE_MSG} 추출</li>
     *   <li>필수값 검증</li>
     *   <li>{@link #generateFileName}으로 파일명 생성</li>
     *   <li>{@link #uploadToSftp}로 SFTP 파일 업로드</li>
     * </ol>
     *
     * @param context Caravan이 제공하는 Kafka 메시지 컨텍스트
     * @param config  OUTBOUND 설정 정보 ({@code FILE_PATH}, SFTP 접속 정보 포함)
     * @throws IllegalStateException 필수 설정이 없거나 SFTP 업로드 실패 시
     */
    public void handle(KafkaMessageContext context, Map<String, Object> config) {
        // 1. 설정 정보 추출
        String filePath = (String) config.get("FILE_PATH");
        String ftpHost = (String) config.get("FTP_HOST");
        int ftpPort = getIntValue(config, "FTP_PORT", 22);
        String ftpUser = (String) config.get("FTP_USER");
        String ftpPassword = (String) config.get("FTP_PASSWORD");

        // 2. 원본 메시지에서 필드 추출
        String topicId = context.getInterfaceId();
        String kafkaKeydata = context.getKafkaKeyData();
        String interfaceMsg = context.getInterfaceMsg();

        // 3. 필수값 검증
        if (filePath == null || filePath.isEmpty()) {
            throw new IllegalStateException("FILE_PATH 설정이 없습니다");
        }
        if (ftpHost == null || ftpHost.isEmpty()) {
            throw new IllegalStateException("FTP_HOST 설정이 없습니다");
        }
        if (interfaceMsg == null || interfaceMsg.isEmpty()) {
            throw new IllegalStateException("INTERFACE_MSG가 없습니다");
        }

        // 4. 파일명 생성
        String fileName = generateFileName(topicId, kafkaKeydata);

        // 5. SFTP 파일 업로드
        uploadToSftp(ftpHost, ftpPort, ftpUser, ftpPassword, filePath, fileName, interfaceMsg);

        log.info("SFTP 파일 생성 완료 - Topic: {}, File: {}/{}", topicId, filePath, fileName);
    }

    /**
     * SFTP 업로드용 파일명을 생성한다.
     *
     * <p>형식: {@code {TOPIC_ID}_{yyyyMMddHHmmss}_{UUID앞8자리}.txt}</p>
     * <p>UUID 앞 8자리는 {@code KAFKA_KEYDATA}에서 하이픈을 제거한 뒤 앞 8자를 추출한다.
     * {@code KAFKA_KEYDATA}가 {@code null}이거나 8자 미만이면 {@code System.currentTimeMillis()} 기반 대체값을 사용한다.</p>
     *
     * @param topicId       Kafka 토픽 ID
     * @param kafkaKeydata  Kafka 메시지 키 (UUID 형식)
     * @return 생성된 파일명 (예: {@code MMPPMMCMTT01_20260205105500_840d4999.txt})
     */
    private String generateFileName(String topicId, String kafkaKeydata) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMddHHmmss");
        String timestamp = sdf.format(new Date());

        String uuid;
        if (kafkaKeydata != null && kafkaKeydata.length() >= 8) {
            uuid = kafkaKeydata.replace("-", "").substring(0, 8);
        } else {
            uuid = String.valueOf(System.currentTimeMillis() % 100000000);
        }

        return String.format("%s_%s_%s.txt", topicId, timestamp, uuid);
    }

    /**
     * SFTP 서버에 파일을 업로드한다.
     *
     * <p>{@link SftpSessionManager}를 통해 세션 캐싱으로 연결을 재사용하며,
     * 채널은 스레드 안전성을 위해 매번 새로 생성한다.</p>
     *
     * <p>{@code JSchException} 발생 시 세션 캐시에서 제거하여 다음 호출에서 재연결되도록 한다.</p>
     *
     * @param host       SFTP 호스트
     * @param port       SFTP 포트
     * @param user       SFTP 사용자
     * @param password   SFTP 비밀번호
     * @param remotePath SFTP 원격 디렉토리 경로
     * @param fileName   업로드할 파일명
     * @param content    파일 내용 (UTF-8 인코딩)
     * @throws IllegalStateException SFTP 세션 획득 실패, 연결 오류, 업로드 오류 시
     */
    private void uploadToSftp(String host, int port, String user, String password,
                              String remotePath, String fileName, String content) {
        ChannelSftp channelSftp = null;

        try {
            // 1. 세션 가져오기 (캐시 또는 새로 생성)
            Session session = sftpSessionManager.getOrCreateSession(host, port, user, password);

            if (session == null) {
                throw new IllegalStateException("SFTP 세션 획득 실패 - Host: " + host + ", Port: " + port);
            }

            // 2. 채널은 매번 새로 생성 (안정성)
            channelSftp = (ChannelSftp) session.openChannel("sftp");
            channelSftp.connect(5000);

            // 3. 파일 업로드
            String fullPath = remotePath + "/" + fileName;
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            channelSftp.put(new ByteArrayInputStream(bytes), fullPath);

            log.debug("SFTP 파일 업로드 완료 - Path: {}", fullPath);

        } catch (JSchException e) {
            sftpSessionManager.removeSession(host, port, user);
            throw new IllegalStateException("SFTP 연결 오류: " + e.getMessage(), e);
        } catch (SftpException e) {
            throw new IllegalStateException("SFTP 파일 업로드 오류: " + e.getMessage(), e);
        } finally {
            if (channelSftp != null && channelSftp.isConnected()) {
                channelSftp.disconnect();
            }
        }
    }

    /**
     * Map에서 int 값을 추출한다.
     *
     * @param map          데이터 Map
     * @param key          추출할 키
     * @param defaultValue 값이 없거나 변환 실패 시 반환할 기본값
     * @return 키에 해당하는 int 값. 없거나 변환 실패 시 기본값
     */
    private int getIntValue(Map<String, Object> map, String key, int defaultValue) {
        Object value = map.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
