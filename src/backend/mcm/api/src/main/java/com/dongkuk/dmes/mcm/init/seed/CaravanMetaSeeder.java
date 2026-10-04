package com.dongkuk.dmes.mcm.init.seed;

import com.dongkuk.caravan.console.host.AppHostEntity;
import com.dongkuk.caravan.console.host.AppHostJpaRepository;
import com.dongkuk.caravan.console.caravanhubconfig.ConsoleCaravanHubConfigEntity;
import com.dongkuk.caravan.console.caravanhubconfig.ConsoleCaravanHubConfigJpaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * caravan-console 메타(TB_MCM_APPHOST / TB_MCM_MOM_KAFKA_SERAI_CONFIG) 시드 (2026-10-04 DataInitializer 분할).
 *
 * <p>두 저장소는 cactus secondary EMF(caravan.db / CARAVANUSER) 소속이라 {@code DataInitializer.run()} 의 트랜잭션과
 * 별개 경계로 저장된다. 저장소 빈이 없으면(secondary EMF 비활성) skip 한다.
 */
public final class CaravanMetaSeeder {

    private static final Logger log = LoggerFactory.getLogger("com.dongkuk.dmes.mcm.init.DataInitializer");

    private final AppHostJpaRepository appHostJpaRepository;
    private final ConsoleCaravanHubConfigJpaRepository consoleCaravanHubConfigJpaRepository;

    /** 저장소는 둘 다 null 일 수 있다(빈 미등록 환경). */
    public CaravanMetaSeeder(AppHostJpaRepository appHostJpaRepository,
                             ConsoleCaravanHubConfigJpaRepository consoleCaravanHubConfigJpaRepository) {
        this.appHostJpaRepository = appHostJpaRepository;
        this.consoleCaravanHubConfigJpaRepository = consoleCaravanHubConfigJpaRepository;
    }

    /**
     * v4 Phase 4-B (2026-05-13) — TB_MCM_APPHOST 시드 단순화.
     *
     * <p>v3: 모듈별 5 row (mcm/mls/mpn/mpp/mqc) — caravan-console 가 모듈 WAS 직접 호출하던 패턴.
     * <p>v4: <b>caravan-hub 인스턴스 row 만</b> — caravan-console 는 caravan-hub VIP 한 곳만 호출 (v4 §3 정본). 모듈은 caravan-hub 통한
     * 메시지 발행만 (CaravanHubIntegrationClient). caravan-console 콘솔의 토픽/메시지/대시보드는 caravan API 응답을 caravan-hub 가
     * 그대로 반환하므로 모듈 호스트 매핑 무의미.
     *
     * <p>local: 단일 'hub1' row (LB VIP 또는 단일 인스턴스). 운영: hub1/hub2/hub3 멀티 인스턴스 가능.
     *
     * <p>v4 결정 #14 (2026-05-13) — AppHostEntity 가 cactus secondary EMF (caravan.db / CARAVANUSER) 매핑이라
     * {@link AppHostJpaRepository} 사용. Repository 는 {@code ConsoleSecondaryJpaConfig} 가 secondary EMF 로 wiring.
     *
     * <p>secondary EMF 비활성 환경 (Repository 빈 미등록) 에서는 skip.
     */
    public void initAppHostData() {
        if (appHostJpaRepository == null) {
            log.info("[DataInitializer] AppHostJpaRepository 미활성 — TB_MCM_APPHOST 시드 skip (secondary EMF 비활성 환경)");
            return;
        }
        // v4 §8-1 — caravan-hub 인스턴스 row 만. WORKS_CD='p' (caravan-console caravan-console.works-code yml property 와 정합).
        // appHostId 는 caravan-hub 의 biz-system(application.yml: HUB1) 과 정확히 일치해야 한다.
        //   ConsoleTopicService.getTopicsWithStatus() 가 hostUrlMap.containsKey(topic.bizSystem) 로 case-sensitive 매핑하고,
        //   AppHostService.getHostUrl(bizSystem)=findByAppHostIdAndWorksCd(bizSystem,..) 이므로 대소문자 불일치 시
        //   토픽 상태 UNKNOWN + 컨슈머 제어 "호스트 미등록" 이 된다. (SoT = caravan-hub biz-system)
        List<AppHostEntity> hosts = List.of(
                AppHostEntity.builder()
                        .appHostId("HUB1")
                        .worksCd("p")
                        .appHostNm("caravan-hub EAI 게이트웨이")
                        .appHostDesc("caravan-hub EAI hub — caravan 라이브러리 유일 호스트 (v4 §3)")
                        .appHostUrl("http://localhost:8200")
                        .build()
        );
        appHostJpaRepository.saveAll(hosts);
    }

    /**
     * v4 Phase 4-C (2026-05-13) — SERAI_CONFIG 시드 (PoC 토픽별 INTEGRATION_TYPE 등록).
     *
     * <p>v4 §6-1 — 각 토픽이 INBOUND/OUTBOUND × DB/HTTP/FILE 4 조합 중 어느 패턴인지 운영자가 등록.
     * caravan-hub 가 부팅 시점에 본 테이블 read → 토픽별 라우팅 결정.
     *
     * <p>PoC 3 row (mls 제외 — §11 별 트랙):
     * <ul>
     *   <li>{@code MMPPMERPTT01} INBOUND DB — mpp 가 IF_MMPPMERPTT01 INSERT → caravan-hub 60초 polling → Kafka publish</li>
     *   <li>{@code MMCMMERPTT02} INBOUND HTTP — mcm 이 CaravanHubIntegrationClient.send() → caravan-hub sync REST → Kafka publish</li>
     *   <li>{@code MMQCMMPNTT01} OUTBOUND DB — caravan-hub 가 Kafka 수신 → IF_MMQCMMPNTT01 INSERT → mpn 60초 polling</li>
     * </ul>
     *
     * <p>secondary EMF 비활성 환경 (Repository 빈 미등록) 에서는 skip.
     */
    public void initCaravanHubConfigData() {
        if (consoleCaravanHubConfigJpaRepository == null) {
            log.info("[DataInitializer] ConsoleCaravanHubConfigJpaRepository 미활성 — SERAI_CONFIG 시드 skip");
            return;
        }
        List<ConsoleCaravanHubConfigEntity> configs = List.of(
                ConsoleCaravanHubConfigEntity.builder()
                        .topicId("MMPPMERPTT01")
                        .direction("INBOUND")
                        .integrationType("DB")
                        .pollingIntervalMs(60000)
                        .dbTableName("IF_MMPPMERPTT01")
                        .useYn("Y")
                        .build(),
                ConsoleCaravanHubConfigEntity.builder()
                        .topicId("MMCMMERPTT02")
                        .direction("INBOUND")
                        .integrationType("HTTP")
                        .httpUrl("http://localhost:8200/caravanHubApi/v1/send")
                        .httpMethod("POST")
                        .useYn("Y")
                        .build(),
                ConsoleCaravanHubConfigEntity.builder()
                        .topicId("MMQCMMPNTT01")
                        .direction("OUTBOUND")
                        .integrationType("DB")
                        .pollingIntervalMs(60000)
                        .dbTableName("IF_MMQCMMPNTT01")
                        .useYn("Y")
                        .build()
        );
        consoleCaravanHubConfigJpaRepository.saveAll(configs);
        log.info("[DataInitializer] SERAI_CONFIG 시드 완료 — {} row (PoC)", configs.size());
    }
}
