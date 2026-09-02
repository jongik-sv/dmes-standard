package com.dongkuk.caravan.console.caravanhubconfig;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.dongkuk.caravan.console.exception.ConsoleException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * caravan-hub 설정(caravanHubConfig) 쓰기 명령 — rowStatus C/U/D 일괄 적용. (appHost AppHostCommandService 패턴)
 *
 * <p>OASIS 진입 서비스({@link ConsoleCaravanHubConfigService})는 메서드 파라미터 이름 바인딩을 위해
 * {@code @Transactional} 을 둘 수 없다(가이드 §6-B-1). 트랜잭션 쓰기 배치는 본 빈으로 분리한다.
 * {@code ConsoleCaravanHubConfigEntity} 는 CARAVANUSER EMF 매핑이므로 tx manager 한정자
 * {@code consoleTransactionManager} 가 필수(배치 원자성 — BR-004).</p>
 *
 * <p>Q-005: ftpPassword 는 마스킹({@link ConsoleCaravanHubConfigService#FTP_PASSWORD_MASK})/공란이면 기존 값 보존
 * (덮어쓰기 금지). 실제 새 비밀번호일 때만 갱신한다.</p>
 */
@Service
public class ConsoleCaravanHubConfigCommandService {

    private static final Logger log = LoggerFactory.getLogger(ConsoleCaravanHubConfigCommandService.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 아웃바운드/인바운드 DB 핸들러의 테이블명 검증(SQL Injection 방지)과 동일 규칙. */
    private static final Pattern TABLE_NAME = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");
    private static final Set<String> VALID_DIRECTIONS = Set.of("INBOUND", "OUTBOUND");
    private static final Set<String> VALID_TYPES = Set.of("DB", "HTTP", "FILE");

    private final ConsoleCaravanHubConfigJpaRepository caravanHubConfigJpaRepository;

    public ConsoleCaravanHubConfigCommandService(ConsoleCaravanHubConfigJpaRepository caravanHubConfigJpaRepository) {
        this.caravanHubConfigJpaRepository = caravanHubConfigJpaRepository;
    }

    /**
     * rowStatus(C/U/D) 일괄 적용. 단일 트랜잭션(배치 원자성 — BR-004).
     *
     * @param master 그리드 행. 각 행은 {@code rowStatus}(C/U/D) + 업무필드.
     * @return 처리한 행 수(C/U/D). unknown/null status·U 미존재 PK 제외.
     */
    @Transactional("consoleTransactionManager")
    public int applyChanges(List<Map<String, Object>> master) {
        if (master == null) {
            return 0;
        }
        int cnt = 0;
        for (Map<String, Object> change : master) {
            String rowStatus = (String) change.get("rowStatus");
            if (rowStatus == null) {
                continue;
            }
            String topicId = (String) change.get("topicId");
            String direction = (String) change.get("direction");
            switch (rowStatus) {
                case "C" -> {
                    validate(change, master);
                    caravanHubConfigJpaRepository.save(buildEntity(change));
                    cnt++;
                }
                case "U" -> {
                    // BR-005: PK(topicId/direction) 변경 불가 — 실제 갱신 시에만 cnt 증가.
                    Optional<ConsoleCaravanHubConfigEntity> existing =
                            caravanHubConfigJpaRepository.findById(new ConsoleCaravanHubConfigId(topicId, direction));
                    if (existing.isPresent()) {
                        validate(change, master);
                        applyUpdate(existing.get(), change);
                        caravanHubConfigJpaRepository.save(existing.get());
                        cnt++;
                    }
                }
                case "D" -> {
                    caravanHubConfigJpaRepository.deleteById(new ConsoleCaravanHubConfigId(topicId, direction));
                    cnt++;
                }
                default -> { /* unknown — skip */ }
            }
        }
        warnMissingOutbound(master);
        return cnt;
    }

    // ─────────────────────────── 저장 시점 검증 (C-5) ───────────────────────────

    /**
     * 설정 행 저장 전 검증. 실패 시 {@link ConsoleException} → 배치 전체 롤백(loud fail).
     *
     * <ol>
     *   <li>DIRECTION ∈ {INBOUND,OUTBOUND}, INTEGRATION_TYPE ∈ {DB,HTTP,FILE}</li>
     *   <li>타입별 필수필드: DB→DB_TABLE_NAME+DB_SCHEMA / HTTP→HTTP_URL / FILE→FTP_HOST+FILE_PATH</li>
     *   <li>DB_TABLE_NAME 식별자 정규식(핸들러와 동일) / HTTP_HEADERS 유효 JSON</li>
     *   <li>같은 토픽 INBOUND+OUTBOUND 가 같은 DB_SCHEMA.DB_TABLE_NAME → 무한 증폭 루프 하드 거부</li>
     * </ol>
     */
    private void validate(Map<String, Object> change, List<Map<String, Object>> master) {
        String topicId = str(change.get("topicId"));
        String direction = str(change.get("direction"));
        String type = str(change.get("integrationType"));
        String where = "[" + topicId + "/" + direction + "]";

        if (blank(topicId)) {
            throw new ConsoleException("TOPIC_ID 가 없습니다.");
        }
        if (!VALID_DIRECTIONS.contains(direction)) {
            throw new ConsoleException(where + " DIRECTION 은 INBOUND/OUTBOUND 여야 합니다: " + direction);
        }
        if (!VALID_TYPES.contains(type)) {
            throw new ConsoleException(where + " INTEGRATION_TYPE 은 DB/HTTP/FILE 여야 합니다: " + type);
        }

        switch (type) {
            case "DB" -> {
                String schema = str(change.get("dbSchema"));
                String table = str(change.get("dbTableName"));
                requireField(where, "DB_SCHEMA", schema);
                requireField(where, "DB_TABLE_NAME", table);
                if (!TABLE_NAME.matcher(table).matches()) {
                    throw new ConsoleException(where + " 유효하지 않은 DB_TABLE_NAME: " + table);
                }
                // 같은 토픽 반대방향이 같은 테이블(DB) 이면 INBOUND↔OUTBOUND 무한 증폭 루프.
                String opposite = "INBOUND".equals(direction) ? "OUTBOUND" : "INBOUND";
                Map<String, String> other = effectiveOpposite(topicId, opposite, master);
                if (other != null && "DB".equals(other.get("type"))
                        && eq(schema, other.get("schema")) && eq(table, other.get("table"))) {
                    throw new ConsoleException(where + " INBOUND/OUTBOUND 가 같은 테이블("
                            + schema + "." + table + ") 을 가리켜 무한 증폭 루프가 됩니다. 서로 다른 테이블로 분리하세요.");
                }
            }
            case "HTTP" -> {
                requireField(where, "HTTP_URL", str(change.get("httpUrl")));
                String headers = str(change.get("httpHeaders"));
                if (!blank(headers)) {
                    try {
                        OBJECT_MAPPER.readTree(headers);
                    } catch (Exception e) {
                        throw new ConsoleException(where + " HTTP_HEADERS 가 유효한 JSON 이 아닙니다: " + e.getMessage());
                    }
                }
            }
            case "FILE" -> {
                requireField(where, "FTP_HOST", str(change.get("ftpHost")));
                requireField(where, "FILE_PATH", str(change.get("filePath")));
            }
            default -> { /* VALID_TYPES 로 이미 걸러짐 */ }
        }
    }

    /**
     * 토픽의 반대방향 설정을 배치(우선) → DB 순으로 조회해 "효과적 상태" 를 반환한다.
     * (배치에서 삭제되면 {@code null}, C/U 면 그 값, 없으면 DB 값.)
     *
     * @return {@code {type, schema, table}} Map 또는 {@code null}
     */
    private Map<String, String> effectiveOpposite(String topicId, String oppositeDirection,
                                                  List<Map<String, Object>> master) {
        // 1) 같은 배치 안에서 반대방향 행 우선
        for (Map<String, Object> row : master) {
            if (topicId.equals(str(row.get("topicId"))) && oppositeDirection.equals(str(row.get("direction")))) {
                String rs = str(row.get("rowStatus"));
                if ("D".equals(rs)) {
                    return null;   // 삭제 예정 → 반대방향 없음
                }
                if ("C".equals(rs) || "U".equals(rs)) {
                    return Map.of("type", nz(str(row.get("integrationType"))),
                            "schema", nz(str(row.get("dbSchema"))), "table", nz(str(row.get("dbTableName"))));
                }
            }
        }
        // 2) DB 현재값
        return caravanHubConfigJpaRepository
                .findById(new ConsoleCaravanHubConfigId(topicId, oppositeDirection))
                .map(e -> Map.of("type", nz(e.getIntegrationType()),
                        "schema", nz(e.getDbSchema()), "table", nz(e.getDbTableName())))
                .orElse(null);
    }

    /**
     * OUTBOUND 설정이 없는 토픽에 대해 경고 로그(하드 거부 아님). caravan-hub 소비 시 "OUTBOUND 설정 없음"
     * 큐막기 위험을 사전 안내한다(판단3 — 경고 정도). 배치 내 삭제/추가를 반영한 효과적 상태로 판단.
     */
    private void warnMissingOutbound(List<Map<String, Object>> master) {
        Set<String> topics = new LinkedHashSet<>();
        for (Map<String, Object> row : master) {
            String t = str(row.get("topicId"));
            if (!blank(t)) {
                topics.add(t);
            }
        }
        for (String topicId : topics) {
            if (effectiveOpposite(topicId, "OUTBOUND", master) == null
                    && effectiveOpposite(topicId, "INBOUND", master) != null) {
                log.warn("[caravanHubConfig] 토픽 {} 에 OUTBOUND 설정이 없습니다 — caravan-hub 소비 시 큐막기 위험. "
                        + "OUTBOUND 설정을 추가하세요.", topicId);
            }
        }
    }

    private static void requireField(String where, String field, String value) {
        if (blank(value)) {
            throw new ConsoleException(where + " " + field + " 은(는) 필수입니다.");
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static boolean eq(String a, String b) {
        return nz(a).equals(nz(b));
    }

    private ConsoleCaravanHubConfigEntity buildEntity(Map<String, Object> change) {
        return ConsoleCaravanHubConfigEntity.builder()
                .topicId((String) change.get("topicId"))
                .direction((String) change.get("direction"))
                .integrationType((String) change.get("integrationType"))
                .pollingIntervalMs(toInteger(change.get("pollingIntervalMs")))
                .dbTableName((String) change.get("dbTableName"))
                .dbSchema((String) change.get("dbSchema"))
                .filePath((String) change.get("filePath"))
                .backupPath((String) change.get("backupPath"))
                .ftpHost((String) change.get("ftpHost"))
                .ftpPort(toInteger(change.get("ftpPort")))
                .ftpUser((String) change.get("ftpUser"))
                .ftpPassword(realPassword(change.get("ftpPassword")))
                .httpUrl((String) change.get("httpUrl"))
                .httpMethod((String) change.get("httpMethod"))
                .httpHeaders((String) change.get("httpHeaders"))
                .useYn((String) change.get("useYn"))
                .build();
    }

    /** BR-005: PK 2개(topicId/direction) 제외 14 컬럼 갱신. ftpPassword 는 마스킹/공란 시 보존. */
    private void applyUpdate(ConsoleCaravanHubConfigEntity entity, Map<String, Object> change) {
        entity.setIntegrationType((String) change.get("integrationType"));
        entity.setPollingIntervalMs(toInteger(change.get("pollingIntervalMs")));
        entity.setDbTableName((String) change.get("dbTableName"));
        entity.setDbSchema((String) change.get("dbSchema"));
        entity.setFilePath((String) change.get("filePath"));
        entity.setBackupPath((String) change.get("backupPath"));
        entity.setFtpHost((String) change.get("ftpHost"));
        entity.setFtpPort(toInteger(change.get("ftpPort")));
        entity.setFtpUser((String) change.get("ftpUser"));
        String pw = realPassword(change.get("ftpPassword"));   // 마스킹/공란이면 null → 기존 보존
        if (pw != null) {
            entity.setFtpPassword(pw);
        }
        entity.setHttpUrl((String) change.get("httpUrl"));
        entity.setHttpMethod((String) change.get("httpMethod"));
        entity.setHttpHeaders((String) change.get("httpHeaders"));
        entity.setUseYn((String) change.get("useYn"));
    }

    /** 마스킹 sentinel / 공란 → null (비밀번호 미변경). 실제 값이면 그대로. */
    private String realPassword(Object value) {
        if (value == null) {
            return null;
        }
        String s = String.valueOf(value);
        if (s.isBlank() || ConsoleCaravanHubConfigService.FTP_PASSWORD_MASK.equals(s)) {
            return null;
        }
        return s;
    }

    private Integer toInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Integer i) {
            return i;
        }
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
