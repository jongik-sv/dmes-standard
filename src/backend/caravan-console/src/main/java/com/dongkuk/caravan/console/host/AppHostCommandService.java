package com.dongkuk.caravan.console.host;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 호스트 관리(appHost) 쓰기 명령 — rowStatus C/U/D 일괄 적용.
 *
 * <p>OASIS 진입 서비스({@link AppHostService})는 메서드 파라미터 이름 바인딩을 위해
 * {@code @Transactional} 을 둘 수 없다(가이드 §6-B-1 — CGLIB proxy 가 ParameterName 을 null 로
 * 만들어 OASIS 인자 바인딩 실패). 따라서 트랜잭션이 필요한 쓰기 배치는 별도 빈으로 분리해
 * 여기서 {@code @Transactional("consoleTransactionManager")} 로 처리한다.</p>
 *
 * <p>{@code AppHostEntity} 는 caravan/CARAVANUSER EMF 매핑이므로 tx manager 한정자
 * {@code consoleTransactionManager} 가 필수(기본 primary tx manager 와 EMF 불일치 회피).
 * As-Is {@code saveHosts} 의 배치 원자성을 그대로 보존한다.</p>
 */
@Service
public class AppHostCommandService {

    private final AppHostJpaRepository appHostJpaRepository;

    public AppHostCommandService(AppHostJpaRepository appHostJpaRepository) {
        this.appHostJpaRepository = appHostJpaRepository;
    }

    /**
     * rowStatus(C/U/D) 일괄 적용. 단일 트랜잭션(배치 원자성).
     *
     * @param master 그리드 행 목록. 각 행은 {@code rowStatus}(C/U/D) + 업무필드.
     * @return 처리한 행 수(C/U/D). unknown/null status 는 제외.
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
            String appHostId = (String) change.get("appHostId");
            String worksCd = (String) change.get("worksCd");
            switch (rowStatus) {
                case "C" -> {
                    appHostJpaRepository.save(buildEntity(change));
                    cnt++;
                }
                case "U" -> {
                    // 실제 갱신이 일어난 경우에만 cnt 증가 (PK 미존재 시 과대계상 방지).
                    Optional<AppHostEntity> existing =
                            appHostJpaRepository.findById(new AppHostId(appHostId, worksCd));
                    if (existing.isPresent()) {
                        AppHostEntity entity = existing.get();
                        entity.setAppHostNm((String) change.get("appHostNm"));
                        entity.setAppHostUrl((String) change.get("appHostUrl"));
                        appHostJpaRepository.save(entity);
                        cnt++;
                    }
                }
                case "D" -> {
                    appHostJpaRepository.deleteById(new AppHostId(appHostId, worksCd));
                    cnt++;
                }
                default -> { /* unknown — skip */ }
            }
        }
        return cnt;
    }

    private AppHostEntity buildEntity(Map<String, Object> change) {
        return AppHostEntity.builder()
                .appHostId((String) change.get("appHostId"))
                .worksCd((String) change.get("worksCd"))
                .appHostNm((String) change.get("appHostNm"))
                .appHostUrl((String) change.get("appHostUrl"))
                .build();
    }
}
