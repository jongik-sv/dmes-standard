package com.dongkuk.dmes.mcm;

import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

// 스캔 정책 (2026-05-20):
//   cactus 는 자체 AutoConfig (CactusAuthAutoConfiguration 등) 가 책임 — 여기서 스캔 금지.
//     · SecUser/SecUserRepository: cactus.auth.enabled=true 일 때 CactusAuthAutoConfiguration 단일 등록
//     · MasterCode Entity/Repository: MasterCodeJpaAutoConfiguration 책임
//   caravan-console 는 자체 ComponentScan 이 없어 호스트가 ComponentScan 책임 (자동 설정은 JPA/Alias/CaravanHub 만)
//     · Repository 는 ConsoleJpaAutoConfiguration 이 등록 (yml caravan-console.repository.emf-bean 명시 필수)
//     · caravan-console 의 *AutoConfiguration 클래스들은 ComponentScan 에서 제외 — imports 메커니즘으로만 등록
//       (double-discovery 회피, auto-config sorter 순서 보장)
//
// caravan 의존 제거 (2026-05-12) — @EnableKafka / "com.dongkuk.caravan" 컴포넌트 스캔 / caravan.datasource
// 동적 override 모두 제거. caravan 라이브러리는 caravan-hub 호스트에서만 사용 (v4 정본).
@SpringBootApplication
@ComponentScan(
        basePackages = {
                // mcm-core 라이브러리(권한·메뉴·즐겨찾기·코드·롤그룹·감사)와 본 런처가 같은 root 패키지를 쓴다.
                "com.dongkuk.dmes.mcm",
                "com.dongkuk.caravan.console"         // caravan-console 컨트롤러/서비스 빈 (caravan-console 자체 ComponentScan 없음)
        },
        excludeFilters = {
                @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = AutoConfiguration.class),
                @ComponentScan.Filter(type = FilterType.REGEX, pattern = ".*AutoConfiguration$")
        }
)
@EnableJpaRepositories(
        basePackages = {
                "com.dongkuk.dmes.mcm"                 // mcm-core 라이브러리 + 런처 JPA Repositories
                // ⚠️ "com.dongkuk.dmes.cactus" 포함 금지 (CactusAuthAutoConfiguration 자체 등록 — R-EMF)
                // ⚠️ "com.dongkuk.caravan.console.{host,caravanhubconfig,topic}" 포함 금지 —
                //    caravan-console 의 ConsoleJpaAutoConfiguration 이 자체 @EnableJpaRepositories 로 등록
        }
)
@EntityScan(basePackages = {
        "com.dongkuk.dmes.mcm"             // mcm-core 라이브러리 엔티티 (SecRole/SecMenu/RevokedToken/AuditLog) + 런처 엔티티
        // ⚠️ "com.dongkuk.dmes.cactus.security.auth" 포함 금지 — CactusAuthAutoConfiguration 의 @EntityScan 이 단일 소유
        // ⚠️ "com.dongkuk.caravan.console.{host,caravanhubconfig,topic}" 포함 금지 —
        //    cactus 의 if EMF (cactusEntityManagerFactoryIf) 가 매핑
        //    (yml cactus.jpa.extras.if.packages-to-scan 에서 등록, 1.0.21+)
})
public class McmApplication {

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(McmApplication.class);

        // 프로파일 미지정 bootRun/IDE 폴백 → local. (2026-07-07 JNDI 전환 설계 §4-2)
        // defaultProperties 는 최저 우선순위 — -Dspring.profiles.active / --spring.profiles.active 지정 시 무시된다.
        // main() 경로에만 적용되므로 WAR(ServletInitializer) 배포에서 -D 누락 시엔 폴백 없이 fail-fast.
        // 2026-10-07 oracle-1007 — local 은 로컬 Oracle PDB 다(application-local.yml). 옛 SQLite 파일 경로 덮어쓰기
        //   (LocalSqliteDataSource·cactusExtrasLocalSqlite)는 걷어냈다.
        application.setDefaultProperties(Map.of("spring.profiles.default", "local"));

        application.run(args);
    }
}
