package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.support.ScreenUsageJpaTestConfig;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 통계 슬라이스 공통 JPA 테스트 기반 — H2 저장소는 실제, 메뉴·사용자·부서는 mock, 시계는 2026-10-03 10:00 고정.
 * 쿼리 클래스는 하위 테스트가 {@code new} 로 만든다(ScreenUsageJpaTestConfig 는 고치지 않는다).
 * 슬라이스는 이 파일을 고치지 않는다 — 더 필요한 것이 있으면 메인에 보고한다.
 */
@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)
abstract class ScreenUsageStatJpaTestBase {

    static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    /** 오늘 = 2026-10-03, 지금 10:00 */
    static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 3, 10, 0);
    static final String PATH = "공통관리 > 시스템관리";
    static final String USER = "csa/commUserMng";
    static final String MENU = "csa/commMenuMng";
    static final String ROLE = "csa/commRoleMng";
    static final String PERM = "csa/commPermMng";
    static final String HIDDEN = "csa/hiddenScreen";

    @Autowired ScreenUsageLogRepository logRepository;
    @Autowired ScreenUsageDayRepository dayRepository;
    @Autowired ScreenUsageDayWriter dayWriter;

    final ScreenMenuCatalog menuCatalog = mock(ScreenMenuCatalog.class);
    final SecUserRepository secUserRepository = mock(SecUserRepository.class);
    final DeptInfoRepository deptInfoRepository = mock(DeptInfoRepository.class);
    final Map<String, MenuInfo> menus = new LinkedHashMap<>();
    ScreenUsageStatSupport support;

    @BeforeEach
    void setUpBase() {
        logRepository.deleteAllInBatch();
        dayRepository.deleteAllInBatch();
        menus.clear();
        addMenu(USER, "사용자 관리", true);
        addMenu(MENU, "메뉴 관리", true);
        addMenu(ROLE, "역할 관리", true);
        addMenu(HIDDEN, "숨김 화면", false);
        when(menuCatalog.load()).thenReturn(menus);
        when(secUserRepository.findAllById(any())).thenReturn(List.of(user("userA", "김철수"), user("userB", "이영희")));
        when(deptInfoRepository.findAllById(any())).thenReturn(List.of(dept("D100", "생산관리팀")));
        support = new ScreenUsageStatSupport(dayRepository, logRepository, menuCatalog, secUserRepository,
                deptInfoRepository, Clock.fixed(NOW.atZone(SEOUL).toInstant(), SEOUL));
    }

    /** menuCatalog.load() 가 돌려주는 가변 맵에 메뉴를 더한다(같은 맵 참조라 다시 스텁하지 않아도 된다). */
    void addMenu(String pageId, String menuNm, boolean viewable) {
        menus.put(pageId, new MenuInfo(pageId, menuNm, PATH, viewable));
    }

    static SecUser user(String id, String nm) {
        SecUser u = new SecUser();
        u.setUserId(id);
        u.setUserNm(nm);
        return u;
    }

    static DeptInfo dept(String cd, String nm) {
        DeptInfo d = new DeptInfo();
        d.setDeptCd(cd);
        d.setDeptNm(nm);
        return d;
    }

    static ScreenUsageStatRequest req(String fromDt, String toDt) {
        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        r.setFromDt(fromDt);
        r.setToDt(toDt);
        return r;
    }

    ScreenUsageLog save(String userId, String deptCd, String pageId, String kind, LocalDateTime at, long ms) {
        return logRepository.save(log(userId, deptCd, pageId, kind, at, ms));
    }

    /** 2026-10-03 02:00 집계 → 10-02 까지 확정. */
    void rollupAtTwoAm() {
        new ScreenUsageRollup(logRepository, dayRepository, dayWriter,
                Clock.fixed(LocalDateTime.of(2026, 10, 3, 2, 0).atZone(SEOUL).toInstant(), SEOUL)).rollup();
    }
}
