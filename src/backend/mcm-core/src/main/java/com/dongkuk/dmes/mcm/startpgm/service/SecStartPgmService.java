package com.dongkuk.dmes.mcm.startpgm.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.favorite.service.PortalPageMenuMatcher;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import com.dongkuk.dmes.mcm.startpgm.dto.SecStartPgmSearchRequest;
import com.dongkuk.dmes.mcm.startpgm.dto.SecStartPgmToggleRequest;
import com.dongkuk.dmes.mcm.startpgm.entity.SecUserStartPgm;
import com.dongkuk.dmes.mcm.startpgm.repository.SecUserStartPgmRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 기본 화면 도메인 서비스 — {@code TB_MCM_SEC_USER_START_PGM}. 포털을 처음 시작할 때 자동으로 여는 사용자별 화면 목록.
 * 즐겨찾기({@code SecFavoriteService})와 같은 방식으로 관리하되 폴더 없는 평면 목록이다.
 *
 * <p>BPMN({@code secStartPgm}) 액션:
 * <ul>
 *   <li>{@code search} — 본인 기본 화면을 START_SEQ 순으로 반환 (menu/obj enrich).</li>
 *   <li>{@code toggle} — 탭 우클릭 '기본 화면 등록/해제'·사이드바 해제 버튼. 미등록이면 맨 뒤에 추가, 등록돼 있으면 제거.</li>
 * </ul>
 *
 * <p>매칭 키 = {@code componentPath}({@code ${parentMenuId}/${objectId}}) — {@link PortalPageMenuMatcher} 공용 규칙.
 *
 * <p>userId 는 두 액션 모두 인증 컨텍스트({@link SecurityIdentity#currentUserId()})로 강제한다(IDOR 차단).
 * request body 의 userId 는 인증 컨텍스트가 없을 때(단위 테스트)만 쓴다.
 *
 * <p>{@code @Transactional} 미부착(클래스): 붙이면 CGLIB 프록시가 javac {@code -parameters} 메타데이터를 잃어
 * oasis {@code StrictMethodResolver} 가 파라미터명을 null 로 인식한다(SecFavoriteService 와 같은 이유).
 * 쓰기 원자성은 Repository 의 {@code @Modifying @Transactional} 및 단건 save 로 확보한다.
 */
@Service("secStartPgmService")
public class SecStartPgmService {

    private final SecUserStartPgmRepository startPgmRepository;
    /** SEC_MENU·SEC_OBJ 전수 목록 캐시 (읽기 전용 엔티티). */
    private final MenuCatalog menuCatalog;
    private final SecurityIdentity securityIdentity;

    @Autowired
    public SecStartPgmService(SecUserStartPgmRepository startPgmRepository,
                              MenuCatalog menuCatalog,
                              SecurityIdentity securityIdentity) {
        this.startPgmRepository = startPgmRepository;
        this.menuCatalog = menuCatalog;
        this.securityIdentity = securityIdentity;
    }

    // ──────────────────────────────────────────────────────────── search

    public List<Map<String, Object>> searchStartPgms(SecStartPgmSearchRequest request) {
        String userId = resolveUserId(request.getUserId());
        if (userId == null || userId.isBlank()) {
            return List.of();
        }
        List<SecUserStartPgm> rows = startPgmRepository.findByUserIdOrderByStartSeqAsc(userId);
        if (rows.isEmpty()) {
            return List.of();
        }

        // 메모리 인덱스 (MENU_ID 기준 최초 1행 / OBJECT_ID) — 메뉴 카탈로그 캐시의 같은 스냅샷.
        MenuCatalog.Snapshot catalog = menuCatalog.snapshot();
        Map<String, SecMenu> menuById = catalog.menusById();
        Map<String, SecObj> objById = catalog.objectsById();

        List<Map<String, Object>> result = new ArrayList<>(rows.size());
        for (SecUserStartPgm s : rows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id",            s.getMenuId() + "/" + s.getFullId());
            row.put("userId",        s.getUserId());
            row.put("menuId",        s.getMenuId());
            row.put("menuSeq",       s.getMenuSeq());
            row.put("fullId",        s.getFullId());
            row.put("componentPath", s.getFullId()); // FULL_ID = componentPath (FE pageId 조립용)
            row.put("startSeq",      s.getStartSeq());

            SecMenu menu = menuById.get(s.getMenuId());
            String objectId = menu != null ? menu.getObjectId() : null;
            SecObj obj = objectId != null ? objById.get(objectId) : null;
            row.put("menuNm",  menu != null ? menu.getMenuNm() : null);
            row.put("sysCd",   obj != null  ? obj.getSystemCode() : null);
            row.put("objId",   obj != null  ? obj.getObjectId()   : null);
            result.add(row);
        }
        return result;
    }

    // ──────────────────────────────────────────────────────────── toggle

    public Map<String, Object> toggleStartPgm(SecStartPgmToggleRequest request) {
        String userId = resolveUserId(request.getUserId());
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        String pageId = request.getPageId();
        String[] parts = PortalPageMenuMatcher.splitPageId(pageId);

        MenuCatalog.Snapshot catalog = menuCatalog.snapshot();
        SecMenu menu = PortalPageMenuMatcher.findMenuByComponentPath(
                catalog.menus(), catalog.objects(), parts[0], parts[1]);
        if (menu == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "해당 페이지에 매칭되는 메뉴가 없습니다: " + pageId);
        }

        String fullId = menu.getParentMenuId() + "/" + menu.getObjectId(); // = componentPath
        String menuId = menu.getMenuId();
        Integer menuSeq = parseIntOrZero(menu.getMenuSeq());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pageId", pageId);
        result.put("menuId", menuId);

        boolean registered =
                !startPgmRepository.findByUserIdAndFullIdAndMenuId(userId, fullId, menuId).isEmpty();
        if (registered) {
            startPgmRepository.deleteByUserIdAndFullIdAndMenuId(userId, fullId, menuId);
            result.put("registered", false);
            return result;
        }

        Integer maxSeq = startPgmRepository.maxStartSeqByUserId(userId);
        SecUserStartPgm row = new SecUserStartPgm();
        row.setUserId(userId);
        row.setFullId(fullId);
        row.setMenuId(menuId);
        row.setMenuSeq(menuSeq);
        row.setStartSeq((maxSeq == null ? 0 : maxSeq) + 1);
        startPgmRepository.save(row);

        result.put("registered", true);
        return result;
    }

    // ──────────────────────────────────────────────────────────── helpers

    /** 인증 컨텍스트 userId 우선. 비어 있을 때(단위 테스트)만 request 값을 쓴다 — 운영에서는 발생하지 않는다. */
    private String resolveUserId(String requestUserId) {
        String authenticatedUserId = securityIdentity.currentUserId();
        return (authenticatedUserId != null && !authenticatedUserId.isBlank())
                ? authenticatedUserId
                : requestUserId;
    }

    private static Integer parseIntOrZero(String s) {
        if (s == null || s.isBlank()) return 0;
        try { return Integer.parseInt(s.trim()); }
        catch (NumberFormatException e) { return 0; }
    }
}
