package com.dongkuk.caravan.console.host;

import com.dongkuk.caravan.console.audit.ConsoleAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Application Host 마스터 (TB_CARAVAN_APPHOST) — caravan-hub 인스턴스 매핑 SoT.
 *
 * <p>v4 §3 정본 — caravan-console 가 caravan-hub VIP 한 곳만 호출. 운영자가 호스트 관리 화면 (console/app-host) 에서 caravan-hub 인스턴스
 * 등록/수정. caravan-hub 멀티 인스턴스 (serai1/serai2/serai3) 의 LB 매핑.
 *
 * <p>복합 PK ({@code APP_HOST_ID} + {@code WORKS_CD}) — 같은 인스턴스 ID 라도 공장별 별개 URL 가능.
 * caravan-console 인스턴스의 {@code console.works-code} yml property 가 자기 공장 식별자.
 *
 * <p>호스트가 결정한 EMF 에 매핑. mcm 호스트 기준 cactus 의 if EMF
 * ({@code cactusEntityManagerFactoryIf}, alias {@code consoleEntityManagerFactory}) 사용 —
 * local sqlite {@code caravan-if.db} / 운영 CARAVANUSER schema 보관.
 *
 * <p>TABLE/TB_CARAVAN_APPHOST.md 명세 정합:
 * <ul>
 *   <li>{@link ConsoleAuditEntity} 상속 — audit 9컬럼 (C_USR_ID/C_AT/C_SVC_ID/C_PGM_ID/U_USR_ID/U_AT/U_SVC_ID/U_PGM_ID/VER) 자동 매핑</li>
 *   <li>{@code APP_HOST_DESC} 컬럼 추가</li>
 * </ul>
 */
@Entity
@Table(name = "TB_CARAVAN_APPHOST")
@IdClass(AppHostId.class)
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class AppHostEntity extends ConsoleAuditEntity {

    @Id
    @Column(name = "APP_HOST_ID", length = 50)
    private String appHostId;

    @Id
    @Column(name = "WORKS_CD", length = 20)
    private String worksCd;

    @Column(name = "APP_HOST_NM", length = 200, nullable = false)
    private String appHostNm;

    @Column(name = "APP_HOST_DESC", length = 500)
    private String appHostDesc;

    @Column(name = "APP_HOST_URL", length = 500, nullable = false)
    private String appHostUrl;
}
