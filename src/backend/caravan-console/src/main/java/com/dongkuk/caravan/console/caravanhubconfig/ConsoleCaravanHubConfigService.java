package com.dongkuk.caravan.console.caravanhubconfig;

import com.dongkuk.caravan.console.caravanhubconfig.dto.CaravanHubConfigResponse;
import com.dongkuk.caravan.console.caravanhubconfig.dto.CaravanHubConfigSearchRequest;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

/**
 * caravan-hub 설정(caravanHubConfig) OASIS 서비스.
 *
 * <p>OASIS 진입: {@code services/caravanConsole/caravanHubConfig.bpmn} 의 serviceTask
 * {@code camunda:class="caravanHubConfigService"} 가 {@link #search}/{@link #save} 호출.
 * 쓰기 트랜잭션은 {@link ConsoleCaravanHubConfigCommandService} 위임(가이드 §6-B-1 — 진입 메서드 무 @Transactional).</p>
 *
 * <p>복합 PK = (TOPIC_ID, DIRECTION). direction 표준값 = INBOUND/OUTBOUND (Q-003, DB/시드 정본).</p>
 */
@Service("caravanHubConfigService")
public class ConsoleCaravanHubConfigService {

    /** Q-005 — ftpPassword 응답 마스킹 sentinel. 저장 시 이 값이면 기존 비밀번호 보존(덮어쓰기 금지). */
    public static final String FTP_PASSWORD_MASK = "********";

    private final ConsoleCaravanHubConfigJpaRepository caravanHubConfigJpaRepository;
    private final ConsoleCaravanHubConfigCommandService caravanHubConfigCommandService;

    public ConsoleCaravanHubConfigService(ConsoleCaravanHubConfigJpaRepository caravanHubConfigJpaRepository,
                                 ConsoleCaravanHubConfigCommandService caravanHubConfigCommandService) {
        this.caravanHubConfigJpaRepository = caravanHubConfigJpaRepository;
        this.caravanHubConfigCommandService = caravanHubConfigCommandService;
    }

    /**
     * 조회 (BPMN action=search) — direction(eq) ∧ topicId(LIKE) ∧ useYn(eq), 미입력 skip (BR-002).
     * 정렬 topicId, direction 오름차순 (BR-003).
     *
     * @return {@code { list: List<CaravanHubConfigResponse>, cnt }} — BPMN output=result → data.result.
     */
    public Map<String, Object> search(CaravanHubConfigSearchRequest request) {
        Specification<ConsoleCaravanHubConfigEntity> spec = Specification.where(
                        ConsoleCaravanHubConfigSpecification.directionEquals(request.getDirection()))
                .and(ConsoleCaravanHubConfigSpecification.topicIdLike(request.getTopicId()))
                .and(ConsoleCaravanHubConfigSpecification.useYnEquals(request.getUseYn()));
        List<CaravanHubConfigResponse> list = caravanHubConfigJpaRepository.findAll(spec, Sort.by("topicId", "direction"))
                .stream().map(this::toResponse).collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("cnt", list.size());
        return result;
    }

    /**
     * 저장 (BPMN action=save) — rowStatus C/U/D 일괄 + 자동 재조회.
     *
     * <p>쓰기 배치(원자성)는 {@link ConsoleCaravanHubConfigCommandService#applyChanges} 위임 후 {@link #search} 재호출.</p>
     *
     * @param request 재조회 검색 조건(params)
     * @param master  그리드 행(rowStatus C/U/D) — body {@code grids.master.rows} 자동 바인딩
     */
    public Map<String, Object> save(CaravanHubConfigSearchRequest request, List<Map<String, Object>> master) {
        int cntSave = caravanHubConfigCommandService.applyChanges(master);
        Map<String, Object> result = search(request);
        result.put("cnt_save", cntSave);
        return result;
    }

    private CaravanHubConfigResponse toResponse(ConsoleCaravanHubConfigEntity entity) {
        return CaravanHubConfigResponse.builder()
                .topicId(entity.getTopicId())
                .direction(entity.getDirection())
                .integrationType(entity.getIntegrationType())
                .pollingIntervalMs(entity.getPollingIntervalMs())
                .dbTableName(entity.getDbTableName())
                .dbSchema(entity.getDbSchema())
                .filePath(entity.getFilePath())
                .backupPath(entity.getBackupPath())
                .ftpHost(entity.getFtpHost())
                .ftpPort(entity.getFtpPort())
                .ftpUser(entity.getFtpUser())
                .ftpPassword(maskPassword(entity.getFtpPassword()))
                .httpUrl(entity.getHttpUrl())
                .httpMethod(entity.getHttpMethod())
                .httpHeaders(entity.getHttpHeaders())
                .useYn(entity.getUseYn())
                .build();
    }

    /** Q-005 — 비밀번호 존재 시 마스킹값으로 치환(평문 미전송). 없으면 null. */
    private String maskPassword(String raw) {
        return (raw == null || raw.isBlank()) ? null : FTP_PASSWORD_MASK;
    }
}
