package com.dongkuk.caravan.hub.inbound.file;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.Vector;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.dongkuk.caravan.core.alert.AlertEvent;
import com.dongkuk.caravan.core.alert.AlertNotifier;
import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.producer.KafkaMessageProducer;
import com.dongkuk.caravan.hub.common.util.SftpSessionManager;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * SFTP FILE INBOUND 폴 처리 핸들러 (구 {@code SftpPollingService} 로직 이식).
 *
 * <p>Camel timer 라우트({@code inbound-file-<topic>})가 주기마다 {@link #pollAndSend(Map)} 를 호출한다.
 * 스케줄링/생명주기는 {@link FileInboundRouteManager} 가 CamelContext 로 관리하고, 본 핸들러는 검증된
 * JSch 기반 SFTP 로직({@link SftpSessionManager} 공유, {@code .txt} 필터, 라인분해, 백업이동)을 그대로 유지한다.</p>
 *
 * <p>{@code SftpSessionManager} 는 OUTBOUND({@code FileOutboundHandler})와 공유하므로 삭제하지 않는다.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileInboundHandler {

    private final KafkaMessageProducer kafkaMessageProducer;
    private final SftpSessionManager sftpSessionManager;
    private final AlertNotifier alertNotifier;
    private final CaravanProperties caravanProperties;

    /** 이동(백업/격리) 실패로 원본이 잔존해 재폴 대상인 파일 — 알림 dedup(파일당 1회)용 in-memory 추적. */
    private final Set<String> stuckFiles = ConcurrentHashMap.newKeySet();

    /**
     * SFTP 서버에서 {@code .txt} 파일을 폴링하여 라인별로 Kafka 로 발행하고 백업 폴더로 이동한다.
     *
     * @param config FILE INBOUND 설정(FTP_HOST/PORT/USER/PASSWORD, FILE_PATH, BACKUP_PATH, TOPIC_ID)
     */
    public void pollAndSend(Map<String, Object> config) {
        String topicId = (String) config.get("TOPIC_ID");
        String sftpHost = (String) config.get("FTP_HOST");
        int sftpPort = getIntValue(config, "FTP_PORT", 22);
        String sftpUser = (String) config.get("FTP_USER");
        String sftpPassword = (String) config.get("FTP_PASSWORD");
        String filePath = (String) config.get("FILE_PATH");
        String backupPath = (String) config.get("BACKUP_PATH");

        ChannelSftp channelSftp = null;
        try {
            Session session = sftpSessionManager.getOrCreateSession(sftpHost, sftpPort, sftpUser, sftpPassword);
            if (session == null) {
                log.error("SFTP 세션 획득 실패 - Host: {}, Port: {}", sftpHost, sftpPort);
                return;
            }

            channelSftp = (ChannelSftp) session.openChannel("sftp");
            channelSftp.connect(5000);

            @SuppressWarnings("unchecked")
            Vector<ChannelSftp.LsEntry> files = channelSftp.ls(filePath);
            if (files == null || files.isEmpty()) {
                return;
            }

            log.debug("SFTP 폴링 시작 - Topic: {}, Path: {}, FileCount: {}", topicId, filePath, files.size());

            for (ChannelSftp.LsEntry entry : files) {
                String fileName = entry.getFilename();
                if (".".equals(fileName) || "..".equals(fileName)) {
                    continue;
                }
                if (entry.getAttrs().isDir()) {
                    continue;
                }
                if (!fileName.endsWith(".txt")) {
                    continue;
                }
                processFile(channelSftp, topicId, filePath, backupPath, fileName);
            }
        } catch (JSchException e) {
            sftpSessionManager.removeSession(sftpHost, sftpPort, sftpUser);
            log.error("SFTP 연결 오류 - Topic: {}", topicId, e);
        } catch (SftpException e) {
            log.error("SFTP 폴링 오류 - Topic: {}", topicId, e);
        } catch (Exception e) {
            sftpSessionManager.removeSession(sftpHost, sftpPort, sftpUser);
            log.error("SFTP 폴링 오류 - Topic: {}", topicId, e);
        } finally {
            if (channelSftp != null && channelSftp.isConnected()) {
                channelSftp.disconnect();
            }
        }
    }

    private void processFile(ChannelSftp channelSftp, String topicId,
                             String filePath, String backupPath, String fileName) {
        String remotePath = filePath + "/" + fileName;
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (InputStream is = channelSftp.get(remotePath)) {
                byte[] buffer = new byte[8192];
                int len;
                while ((len = is.read(buffer)) != -1) {
                    baos.write(buffer, 0, len);
                }
            }

            String content = baos.toString(StandardCharsets.UTF_8.name());
            if (content.trim().isEmpty()) {
                log.warn("빈 파일 스킵 - Path: {}", remotePath);
                finalizeFile(channelSftp, topicId, remotePath, backupPath, fileName, 0, 0);
                return;
            }

            String[] lines = content.split("\n");
            int successCount = 0;
            int failCount = 0;
            for (String line : lines) {
                String trimmedLine = line.trim();
                if (trimmedLine.isEmpty()) {
                    continue;
                }
                try {
                    sendToKafka(topicId, trimmedLine);
                    successCount++;
                } catch (Exception e) {
                    failCount++;
                    log.error("Kafka 전송 실패 - Topic: {}, Line: {}", topicId, trimmedLine, e);
                }
            }
            log.info("파일 처리 완료 - Topic: {}, File: {}, Success: {}, Fail: {}",
                    topicId, fileName, successCount, failCount);

            finalizeFile(channelSftp, topicId, remotePath, backupPath, fileName, successCount, failCount);
        } catch (Exception e) {
            log.error("파일 처리 실패 - Topic: {}, File: {}", topicId, fileName, e);
        }
    }

    /**
     * 파일 후처리 — 전건 성공이면 백업 이동, 한 건이라도 실패면 <b>에러 폴더 격리 + 운영자 알림</b>(H-14).
     *
     * <p>부분 실패에도 무조건 백업 이동하던 기존 동작은 <b>실패 라인 무음 유실</b>을 낳았다. 이제:
     * <ul>
     *   <li>실패 0 → 백업 폴더 이동(정상). 이동 실패 시 원본 잔존 → 다음 폴 <b>중복 발행 위험</b>이므로 알림.</li>
     *   <li>실패 ≥1 → {@code <backup>/error} 폴더로 격리(재폴 안 됨 = 중복 없음, 원본 보존 = 유실 없음) + 알림.</li>
     * </ul>
     * 이동(rename) 자체가 실패해 원본이 잔존하는 경우는 파일당 1회만 알림({@link #stuckFiles} dedup).
     */
    void finalizeFile(ChannelSftp channelSftp, String topicId, String remotePath,
                      String backupPath, String fileName, int successCount, int failCount) {
        if (failCount == 0) {
            String backupTarget = backupPath + "/" + fileName;
            if (tryRename(channelSftp, remotePath, backupTarget)) {
                stuckFiles.remove(remotePath);
            } else {
                alertStuck(topicId, remotePath, fileName, successCount, failCount,
                        "백업 이동 실패 — 원본 잔존, 다음 폴 중복 발행 위험");
            }
            return;
        }

        // 부분/전체 실패 → 에러 폴더 격리
        String errorDir = backupPath + "/error";
        ensureDir(channelSftp, errorDir);
        String errorTarget = errorDir + "/" + fileName;
        if (tryRename(channelSftp, remotePath, errorTarget)) {
            stuckFiles.remove(remotePath);
            log.error("[FileInbound] 부분 실패 → 에러 폴더 격리 - File: {}, 성공: {}, 실패: {}, 격리: {}",
                    fileName, successCount, failCount, errorTarget);
            safeAlert(AlertEvent.fileInboundFailed(caravanProperties.getBizSystem(), topicId, fileName,
                    successCount, failCount, "에러 폴더 격리됨 — 운영자 확인/재처리 필요"));
        } else {
            alertStuck(topicId, remotePath, fileName, successCount, failCount,
                    "격리 이동 실패 — 원본 잔존, 재처리/중복 위험");
        }
    }

    /** 이동 실패로 원본이 잔존하는 경우의 알림 — 파일당 1회(dedup)만 발송해 폴 스팸 방지. */
    private void alertStuck(String topicId, String remotePath, String fileName,
                            int successCount, int failCount, String detail) {
        if (stuckFiles.add(remotePath)) {
            log.error("[FileInbound] {} - File: {}", detail, remotePath);
            safeAlert(AlertEvent.fileInboundFailed(caravanProperties.getBizSystem(), topicId, fileName,
                    successCount, failCount, detail));
        }
    }

    /** rename 이동 시도. 성공 true / 실패 false(원본 잔존). */
    private boolean tryRename(ChannelSftp channelSftp, String sourcePath, String targetPath) {
        try {
            channelSftp.rename(sourcePath, targetPath);
            log.debug("파일 이동 완료 - {} -> {}", sourcePath, targetPath);
            return true;
        } catch (SftpException e) {
            log.warn("파일 이동 실패 - {} -> {}: {}", sourcePath, targetPath, e.getMessage());
            return false;
        }
    }

    /** 에러 폴더가 없으면 생성(best-effort). 없으면 격리 rename 이 실패하므로 선행 보장. */
    private void ensureDir(ChannelSftp channelSftp, String dir) {
        try {
            channelSftp.stat(dir);   // 존재하면 통과
        } catch (SftpException notExist) {
            try {
                channelSftp.mkdir(dir);
                log.info("[FileInbound] 에러 폴더 생성 - {}", dir);
            } catch (SftpException e) {
                log.error("[FileInbound] 에러 폴더 생성 실패 - {} (격리 이동 실패 가능)", dir, e);
            }
        }
    }

    /** 알림 발송(never-throw) — 알림 실패가 폴링을 막지 않도록 예외를 삼킨다. */
    private void safeAlert(AlertEvent event) {
        try {
            alertNotifier.send(event);
        } catch (Exception e) {
            log.warn("[ALERT] FILE 인바운드 알림 발송 실패: {}", e.getMessage());
        }
    }

    private void sendToKafka(String topicId, String interfaceMsg) {
        String transactionCode = extractTransactionCode(interfaceMsg);
        kafkaMessageProducer.send(topicId, transactionCode, interfaceMsg);
    }

    /**
     * {@code INTERFACE_MSG} 첫 번째 파이프({@code |}) 앞을 TRANSACTION_CODE 로 추출(없으면 전체).
     *
     * @param interfaceMsg 파이프 구분 메시지
     * @return TRANSACTION_CODE
     * @throws IllegalArgumentException 메시지가 null/빈 문자열이거나 TC 추출 불가 시
     */
    static String extractTransactionCode(String interfaceMsg) {
        if (interfaceMsg == null || interfaceMsg.isEmpty()) {
            throw new IllegalArgumentException("INTERFACE_MSG가 없습니다");
        }
        String transactionCode = interfaceMsg.contains("|") ? interfaceMsg.split("\\|")[0] : interfaceMsg;
        if (transactionCode == null || transactionCode.isEmpty()) {
            throw new IllegalArgumentException("TRANSACTION_CODE를 추출할 수 없습니다");
        }
        return transactionCode;
    }

    private int getIntValue(Map<String, Object> map, String key, int defaultValue) {
        Object value = map.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
