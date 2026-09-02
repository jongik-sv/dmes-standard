package com.dongkuk.dmes.cactus.web.inbound;

/**
 * 마스터 코드 변경 알림 이벤트.
 *
 * <p>mcm 모듈의 CRUD 컨트롤러/서비스가 등록·수정·삭제 후 발행하면,
 * {@link MasterCodeChangedEventListener} 가 {@code mcmMasterCodeLov} 캐시를 evict 한다.
 *
 * <p>cactus-core 에 두는 이유: 발행자 (mcm) 와 구독자 (cactus-core 의 캐시) 가
 * 같은 이벤트 타입을 공유해야 함. 인터페이스 격에 해당하므로 cross-cutting 영역인
 * cactus-core 에 위치.
 *
 * <p>분산 환경 주의: 본 이벤트는 동일 JVM 프로세스 내에서만 전파된다. mpn/mqc/mpp 가
 * 각자 별도 프로세스라면 그 모듈들의 캐시는 evict 되지 않음 — 5분 TTL 으로 자연 만료.
 * 즉시 일관성 필요 시 RabbitMQ/Redis Pub-Sub 으로 확장.
 *
 * @param groupCd 변경된 그룹 코드. {@code null} 이면 전체 evict.
 * @param itemCd  변경된 항목 코드. {@code null} 이면 그룹 단위 evict.
 * @param op      "CREATE" / "UPDATE" / "DELETE" / "BATCH"
 */
public record MasterCodeChangedEvent(String groupCd, String itemCd, String op) {

    public static MasterCodeChangedEvent all() {
        return new MasterCodeChangedEvent(null, null, "BATCH");
    }

    public static MasterCodeChangedEvent ofGroup(String groupCd, String op) {
        return new MasterCodeChangedEvent(groupCd, null, op);
    }

    public static MasterCodeChangedEvent of(String groupCd, String itemCd, String op) {
        return new MasterCodeChangedEvent(groupCd, itemCd, op);
    }
}
