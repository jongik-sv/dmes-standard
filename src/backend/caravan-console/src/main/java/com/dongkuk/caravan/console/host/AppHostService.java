package com.dongkuk.caravan.console.host;

import com.dongkuk.caravan.console.config.ConsoleProperties;
import com.dongkuk.caravan.console.host.dto.AppHostResponse;
import com.dongkuk.caravan.console.host.dto.AppHostSearchRequest;
import com.dongkuk.caravan.console.host.exception.RemoteHostException;
import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

/**
 * BIZ_SYSTEM → app_host_url 매핑 조회 + 호스트 관리(appHost) OASIS 서비스.
 *
 * <p>v3: caravan-console 가 caravan internal class import 0 + 각 모듈 WAS REST 호출 패턴이라
 * 어느 모듈이 어느 host 에 있는지 본 서비스로 lookup. {@code TB_CARAVAN_APPHOST} 가 SoT.</p>
 *
 * <p>OASIS 진입(호스트 관리 화면): {@code services/caravanConsole/appHost.bpmn} 의 serviceTask
 * {@code camunda:class="appHostService"} 가 {@link #search}/{@link #save} 를 호출.
 * 쓰기 트랜잭션은 {@link AppHostCommandService} 로 위임(가이드 §6-B-1 — 진입 메서드 무 @Transactional).</p>
 *
 * <p>caravan-console 인스턴스의 {@code console.works-code} yml property 가 자기 공장 식별 — SELECT 시
 * 자동 필터. 같은 BIZ_SYSTEM 도 공장별 별개 host 가능.</p>
 */
@Service("appHostService")
public class AppHostService {

    private final AppHostJpaRepository appHostJpaRepository;
    private final ConsoleProperties consoleProperties;
    private final AppHostCommandService appHostCommandService;

    public AppHostService(AppHostJpaRepository appHostJpaRepository,
                          ConsoleProperties consoleProperties,
                          AppHostCommandService appHostCommandService) {
        this.appHostJpaRepository = appHostJpaRepository;
        this.consoleProperties = consoleProperties;
        this.appHostCommandService = appHostCommandService;
    }

    /**
     * 단일 BIZ_SYSTEM 의 host URL 조회.
     * @throws RemoteHostException 매핑 미등록 시
     */
    public String getHostUrl(String bizSystem) {
        // C-6: 대소문자 무관 조회 — getHostUrlMap 의 CASE_INSENSITIVE 맵을 재사용한다.
        //   topic BIZ_SYSTEM("HUB1") 과 APP_HOST_ID("hub1") 의 casing 차이가 "호스트 미등록" 으로
        //   이어지지 않도록 한다(DB collation 에 의존하지 않음).
        String url = getHostUrlMap().get(bizSystem);
        if (url == null) {
            throw new RemoteHostException(
                    "호스트 미등록: bizSystem=" + bizSystem + ", worksCd=" + consoleProperties.worksCode());
        }
        return url;
    }

    /** 본 caravan-console 인스턴스 공장의 전체 호스트 row. 호스트 관리 화면 + 대시보드용. */
    public List<AppHostEntity> getAllHostsByWorks() {
        return appHostJpaRepository.findByWorksCdOrderByAppHostId(consoleProperties.worksCode());
    }

    /**
     * BIZ_SYSTEM → URL 매핑 — 대시보드 등에서 host iterate 시 사용.
     * 같은 BIZ_SYSTEM row 가 여럿이면 첫 매칭 row 사용 (DataInitializer 시드는 1:1 가정).
     */
    public Map<String, String> getHostUrlMap() {
        // C-6: 대소문자 무관 매핑. topic BIZ_SYSTEM 과 APP_HOST_ID 의 casing 차이(hub1/HUB1)가
        //   조용히 UNKNOWN(상태 미확인)/미등록을 유발하지 않도록 CASE_INSENSITIVE 키로 반환한다.
        //   같은 id 의 casing 변형은 첫 row 유지(DataInitializer 시드 1:1 가정).
        Map<String, String> map = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (AppHostEntity host : getAllHostsByWorks()) {
            map.putIfAbsent(host.getAppHostId(), host.getAppHostUrl());
        }
        return map;
    }

    /**
     * 조회 (BPMN action=search) — 호스트 관리 화면 검색.
     *
     * <p>worksCd 미지정 시 caravan-console 인스턴스의 자기 공장 (console.works-code) 으로 자동 필터.
     * 다른 공장의 호스트도 보려면 worksCd 명시 (admin 운영 화면).</p>
     *
     * @return {@code { list: List<AppHostResponse>, cnt: int }} — BPMN output=result → data.result.
     */
    public Map<String, Object> search(AppHostSearchRequest request) {
        String defaultWorksCd = consoleProperties.worksCode();
        Specification<AppHostEntity> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            String worksCd = request.getWorksCd() != null && !request.getWorksCd().isBlank()
                    ? request.getWorksCd() : defaultWorksCd;
            predicates.add(cb.equal(root.get("worksCd"), worksCd));
            if (request.getAppHostId() != null && !request.getAppHostId().isBlank()) {
                predicates.add(cb.like(root.get("appHostId"), "%" + request.getAppHostId() + "%"));
            }
            if (request.getAppHostNm() != null && !request.getAppHostNm().isBlank()) {
                predicates.add(cb.like(root.get("appHostNm"), "%" + request.getAppHostNm() + "%"));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        List<AppHostResponse> list = appHostJpaRepository.findAll(spec, Sort.by("appHostId")).stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("cnt", list.size());
        return result;
    }

    /**
     * 저장 (BPMN action=save) — 호스트 관리 화면 일괄 저장 (rowStatus C/U/D) + 자동 재조회.
     *
     * <p>쓰기 배치(원자성)는 {@link AppHostCommandService#applyChanges}({@code @Transactional}) 위임.
     * 저장 후 {@link #search} 재호출하여 갱신 목록 동봉(As-Is 자동 재조회 패턴).</p>
     *
     * @param request 재조회 검색 조건(params 바인딩)
     * @param master  그리드 행(rowStatus C/U/D) — body {@code grids.master.rows} 자동 바인딩
     * @return {@code { list, cnt, cnt_save }}
     */
    public Map<String, Object> save(AppHostSearchRequest request, List<Map<String, Object>> master) {
        int cntSave = appHostCommandService.applyChanges(master);
        Map<String, Object> result = search(request);
        result.put("cnt_save", cntSave);
        return result;
    }

    private AppHostResponse toResponse(AppHostEntity entity) {
        return AppHostResponse.builder()
                .appHostId(entity.getAppHostId())
                .worksCd(entity.getWorksCd())
                .appHostNm(entity.getAppHostNm())
                .appHostUrl(entity.getAppHostUrl())
                .build();
    }
}
