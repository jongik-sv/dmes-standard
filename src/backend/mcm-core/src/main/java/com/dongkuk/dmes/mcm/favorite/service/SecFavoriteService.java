package com.dongkuk.dmes.mcm.favorite.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.favorite.dto.SecFavoriteFolderRequest;
import com.dongkuk.dmes.mcm.favorite.dto.SecFavoriteSearchRequest;
import com.dongkuk.dmes.mcm.favorite.dto.SecFavoriteToggleRequest;
import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavorite;
import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavoriteFold;
import com.dongkuk.dmes.mcm.favorite.repository.SecUserFavoriteFoldRepository;
import com.dongkuk.dmes.mcm.favorite.repository.SecUserFavoriteRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 즐겨찾기 도메인 서비스 — DMES Section 정본 2테이블 모델
 * ({@code TB_MCM_SEC_USER_FAVORITE} 메뉴 + {@code TB_MCM_SEC_USER_FAVORITE_FOLD} 폴더).
 *
 * <p>BPMN 액션:
 * <ul>
 *   <li>{@code search} — 폴더 + 메뉴를 FE 가 기대하는 병합 행(lvl 0=폴더 / 1=메뉴)으로 반환 (menu/obj enrich).</li>
 *   <li>{@code save}   — 그리드 다건 C/U/D (폴더 관리 + 메뉴 순서). lvl/menuId 로 두 테이블에 분기.</li>
 *   <li>{@code toggle} — portal-shell 별 버튼. 미등록이면 (폴더 선택/신규/기본) 후 추가, 등록돼 있으면 제거.</li>
 * </ul>
 *
 * <p>매칭 키 = {@code componentPath}({@code ${parentMenuId}/${objectId}}, = mui {@code FULL_ID} 등가).
 * URL(formUrl) 문자열 조립 매칭을 폐기하고 메뉴 안정 식별자로 매칭한다. {@code FULL_ID} 컬럼에 이 값을 저장.
 *
 * <p>{@code @Transactional} 미부착(클래스): 붙이면 CGLIB 프록시가 javac {@code -parameters} 메타데이터를
 * 잃어 oasis {@code StrictMethodResolver} 가 파라미터명을 null 로 인식 → search 까지 깨진다(기존 주석 보존).
 * 쓰기 원자성은 Repository 의 {@code @Modifying @Transactional} 및 단건 save 로 확보.
 */
@Service("secFavoriteService")
public class SecFavoriteService {

    private static final String DEFAULT_FOLDER_ID = "FVT000";
    private static final String DEFAULT_FOLDER_NM = "즐겨찾기";

    private final SecUserFavoriteRepository favoriteRepository;
    private final SecUserFavoriteFoldRepository folderRepository;
    private final SecMenuRepository secMenuRepository;
    private final SecObjRepository secObjRepository;

    /** IDOR 차단 — toggle 시 request body 의 userId 대신 인증 컨텍스트 userId 강제. */
    private final SecurityIdentity securityIdentity;

    @Autowired
    public SecFavoriteService(SecUserFavoriteRepository favoriteRepository,
                              SecUserFavoriteFoldRepository folderRepository,
                              SecMenuRepository secMenuRepository,
                              SecObjRepository secObjRepository,
                              SecurityIdentity securityIdentity) {
        this.favoriteRepository = favoriteRepository;
        this.folderRepository = folderRepository;
        this.secMenuRepository = secMenuRepository;
        this.secObjRepository = secObjRepository;
        this.securityIdentity = securityIdentity;
    }

    // ──────────────────────────────────────────────────────────── search

    public List<Map<String, Object>> searchFavorites(SecFavoriteSearchRequest request) {
        String userId = request.getUserId();
        if (userId == null || userId.isBlank()) {
            return List.of();
        }

        List<SecUserFavoriteFold> folders = folderRepository.findByUserIdOrderByFvtFoldSeq(userId);
        List<SecUserFavorite> favorites = favoriteRepository.findByUserId(userId);
        if (folders.isEmpty() && favorites.isEmpty()) {
            return List.of();
        }

        // 신규 SecMenu 는 복합 PK 라 findById 단일 불가 → 메모리 인덱스 (MENU_ID 기준 최초 1행).
        Map<String, SecMenu> menuById = new HashMap<>();
        for (SecMenu m : secMenuRepository.findAll()) {
            menuById.putIfAbsent(m.getMenuId(), m);
        }
        Map<String, SecObj> objById = new HashMap<>();
        for (SecObj o : secObjRepository.findAll()) {
            objById.put(o.getObjectId(), o);
        }

        List<Map<String, Object>> result = new ArrayList<>(folders.size() + favorites.size());

        // 폴더 행 (lvl=0) — FE adaptFavoriteRow 의 isFolder = (menuId 없음 && fvtFoldId 있음).
        for (SecUserFavoriteFold f : folders) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id",         f.getFvtFoldId());
            row.put("userId",     f.getUserId());
            row.put("menuId",     null);
            row.put("fvtFoldId",  f.getFvtFoldId());
            row.put("fvtFoldNm",  f.getFvtFoldNm());
            row.put("fvtFoldSeq", f.getFvtFoldSeq());
            row.put("lvl",        0);
            row.put("parentFold", null);
            result.add(row);
        }

        // 메뉴 행 (lvl=1) — 폴더/순서 정렬.
        favorites.sort(Comparator
                .comparing(SecUserFavorite::getFvtFoldId, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(SecUserFavorite::getFvtSeq, Comparator.nullsLast(Comparator.naturalOrder())));
        for (SecUserFavorite f : favorites) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id",            f.getFvtFoldId() + "/" + f.getMenuId());
            row.put("userId",        f.getUserId());
            row.put("menuId",        f.getMenuId());
            row.put("menuSeq",       f.getMenuSeq());
            row.put("fvtFoldId",     f.getFvtFoldId());
            row.put("parentFold",    f.getFvtFoldId());
            row.put("fvtSeq",        f.getFvtSeq());
            row.put("fullId",        f.getFullId());
            row.put("componentPath", f.getFullId()); // FULL_ID = componentPath (FE pageId 조립용)
            row.put("lvl",           1);

            SecMenu menu = menuById.get(f.getMenuId());
            String objectId = menu != null ? menu.getObjectId() : null;
            SecObj obj = objectId != null ? objById.get(objectId) : null;
            row.put("menuNm",  menu != null ? menu.getMenuNm() : null);
            row.put("sysCd",   obj != null  ? obj.getSystemCode() : null);
            row.put("objId",   obj != null  ? obj.getObjectId()   : null);
            row.put("formUrl", obj != null  ? obj.getFormUrl()    : null);
            result.add(row);
        }
        return result;
    }

    // ──────────────────────────────────────────────────────────── toggle

    public Map<String, Object> toggleFavorite(SecFavoriteToggleRequest request) {
        String userId = resolveUserId(request);
        String pageId = request.getPageId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        if (pageId == null || pageId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "pageId 는 필수입니다.");
        }
        int colon = pageId.indexOf(':');
        if (colon <= 0 || colon == pageId.length() - 1) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "pageId 는 'moduleId:componentPath' 형식이어야 합니다: " + pageId);
        }
        String targetSysCd = pageId.substring(0, colon);
        String targetComponentPath = pageId.substring(colon + 1);

        SecMenu menu = findMenuByComponentPath(targetSysCd, targetComponentPath);
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

        boolean alreadyFavorited =
                !favoriteRepository.findByUserIdAndFullIdAndMenuId(userId, fullId, menuId).isEmpty();
        if (alreadyFavorited) {
            favoriteRepository.deleteByUserIdAndFullIdAndMenuId(userId, fullId, menuId);
            result.put("favorited", false);
            return result;
        }

        // 추가 — 대상 폴더 결정 (선택/신규/기본).
        String fvtFoldId = resolveTargetFolder(userId, request);
        Integer maxSeq = favoriteRepository.maxFvtSeqByUserIdAndFold(userId, fvtFoldId);
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;

        SecUserFavorite row = new SecUserFavorite();
        row.setUserId(userId);
        row.setFvtFoldId(fvtFoldId);
        row.setFullId(fullId);
        row.setMenuId(menuId);
        row.setMenuSeq(menuSeq);
        row.setFvtSeq(nextSeq);
        favoriteRepository.save(row);

        result.put("favorited", true);
        result.put("fvtFoldId", fvtFoldId);
        return result;
    }

    /** sysCd + componentPath({@code parentMenuId/objectId}) 로 활성 메뉴 매칭 — 기본 화면과 같은 {@link PortalPageMenuMatcher} 규칙. */
    private SecMenu findMenuByComponentPath(String targetSysCd, String targetComponentPath) {
        return PortalPageMenuMatcher.findMenuByComponentPath(
                secMenuRepository.findAll(), secObjRepository.findAll(), targetSysCd, targetComponentPath);
    }

    /** 추가 대상 폴더: 선택(fvtFoldId) → 신규(fvtFoldNm) → 기본("즐겨찾기"). 신규/기본은 폴더 행 생성. */
    private String resolveTargetFolder(String userId, SecFavoriteToggleRequest request) {
        String chosenFoldId = request.getFvtFoldId();
        if (chosenFoldId != null && !chosenFoldId.isBlank()) {
            return chosenFoldId;
        }
        String newFoldNm = request.getFvtFoldNm();
        if (newFoldNm != null && !newFoldNm.isBlank()) {
            return createFolder(userId, newFoldNm.trim());
        }
        return ensureDefaultFolder(userId);
    }

    private String createFolder(String userId, String name) {
        Integer maxSeq = folderRepository.maxFoldSeqByUserId(userId);
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        String foldId = "FVT" + String.format("%03d", nextSeq);
        SecUserFavoriteFold fold = new SecUserFavoriteFold();
        fold.setUserId(userId);
        fold.setFvtFoldId(foldId);
        fold.setFvtFoldNm(name);
        fold.setFvtFoldSeq(nextSeq);
        folderRepository.save(fold);
        return foldId;
    }

    private String ensureDefaultFolder(String userId) {
        List<SecUserFavoriteFold> folders = folderRepository.findByUserIdOrderByFvtFoldSeq(userId);
        if (!folders.isEmpty()) {
            return folders.get(0).getFvtFoldId();
        }
        SecUserFavoriteFold fold = new SecUserFavoriteFold();
        fold.setUserId(userId);
        fold.setFvtFoldId(DEFAULT_FOLDER_ID);
        fold.setFvtFoldNm(DEFAULT_FOLDER_NM);
        fold.setFvtFoldSeq(0);
        folderRepository.save(fold);
        return DEFAULT_FOLDER_ID;
    }

    // ──────────────────────────────────────────────────────────── folder add/delete (sidebar 그룹 관리)

    /** action=addFolder — 사이드바 그룹 추가. 폴더명 중복 거부, FVT_FOLD_ID 서버 채번. */
    public Map<String, Object> addFolder(SecFavoriteFolderRequest request) {
        String userId = resolveFolderUserId(request);
        String name = request.getFvtFoldNm();
        if (name == null || name.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "폴더명은 필수입니다.");
        }
        String trimmed = name.trim();
        boolean duplicate = folderRepository.findByUserIdOrderByFvtFoldSeq(userId).stream()
                .anyMatch(f -> trimmed.equals(f.getFvtFoldNm()));
        if (duplicate) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "중복된 폴더명입니다: " + trimmed);
        }
        String foldId = createFolder(userId, trimmed);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fvtFoldId", foldId);
        result.put("fvtFoldNm", trimmed);
        return result;
    }

    /** action=deleteFolder — 사이드바 그룹 삭제. 폴더 + 하위 즐겨찾기 일괄 제거. */
    public Map<String, Object> deleteFolder(SecFavoriteFolderRequest request) {
        String userId = resolveFolderUserId(request);
        String fvtFoldId = request.getFvtFoldId();
        if (fvtFoldId == null || fvtFoldId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "fvtFoldId 는 필수입니다.");
        }
        favoriteRepository.deleteByUserIdAndFvtFoldId(userId, fvtFoldId);
        folderRepository.deleteByUserIdAndFvtFoldId(userId, fvtFoldId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fvtFoldId", fvtFoldId);
        result.put("deleted", true);
        return result;
    }

    private String resolveFolderUserId(SecFavoriteFolderRequest request) {
        String authenticatedUserId = securityIdentity.currentUserId();
        String userId = (authenticatedUserId != null && !authenticatedUserId.isBlank())
                ? authenticatedUserId
                : request.getUserId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        return userId;
    }

    // ──────────────────────────────────────────────────────────── save (grid)

    /**
     * 그리드 다건 C/U/D — 폴더 관리(생성/이름변경/삭제) + 메뉴 순서/이동.
     * 행 분류: {@code lvl==0} 또는 menuId 공백 → 폴더(FOLD 테이블), 그 외 → 메뉴(FAVORITE 테이블).
     * userId 는 인증 컨텍스트로 강제(IDOR).
     */
    public int saveFavorites(List<Map<String, Object>> master) {
        if (master == null) {
            return 0;
        }
        String userId = securityIdentity.currentUserId();
        List<ErrorDetail> errors = new ArrayList<>();
        int count = 0;

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> row = master.get(i);
            String rowKey = (String) row.get("rowKey");
            String rowStatus = (String) row.get("rowStatus");
            String menuId = asString(row.get("menuId"));
            Integer lvl = asInt(row.get("lvl"));
            String fvtFoldId = asString(row.get("fvtFoldId"));
            boolean isFolder = (lvl != null && lvl == 0) || menuId == null || menuId.isBlank();

            if (fvtFoldId == null || fvtFoldId.isBlank()) {
                errors.add(ErrorDetail.ofGrid("master", rowKey, i, "fvtFoldId", "E001", "폴더 ID는 필수입니다."));
                continue;
            }

            if ("D".equals(rowStatus)) {
                if (isFolder) {
                    favoriteRepository.deleteByUserIdAndFvtFoldId(userId, fvtFoldId); // 하위 메뉴 정리
                    folderRepository.deleteByUserIdAndFvtFoldId(userId, fvtFoldId);
                } else {
                    String fullId = asString(row.get("fullId"));
                    if (fullId != null && !fullId.isBlank()) {
                        favoriteRepository.deleteByUserIdAndFullIdAndMenuId(userId, fullId, menuId);
                    }
                }
                count++;
                continue;
            }

            if ("C".equals(rowStatus) || "U".equals(rowStatus)) {
                if (isFolder) {
                    SecUserFavoriteFold fold = new SecUserFavoriteFold();
                    fold.setUserId(userId);
                    fold.setFvtFoldId(fvtFoldId);
                    fold.setFvtFoldNm(asString(row.get("fvtFoldNm")));
                    fold.setFvtFoldSeq(asIntOrZero(row.get("fvtFoldSeq")));
                    folderRepository.save(fold);
                } else {
                    String fullId = asString(row.get("fullId"));
                    if (fullId == null || fullId.isBlank()) {
                        errors.add(ErrorDetail.ofGrid("master", rowKey, i, "fullId", "E001", "fullId는 필수입니다."));
                        continue;
                    }
                    SecUserFavorite fav = new SecUserFavorite();
                    fav.setUserId(userId);
                    fav.setFvtFoldId(fvtFoldId);
                    fav.setFullId(fullId);
                    fav.setMenuId(menuId);
                    fav.setMenuSeq(asIntOrZero(row.get("menuSeq")));
                    fav.setFvtSeq(asIntOrZero(row.get("fvtSeq")));
                    favoriteRepository.save(fav);
                }
                count++;
            }
        }

        if (!errors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.", errors);
        }
        return count;
    }

    // ──────────────────────────────────────────────────────────── helpers

    private String resolveUserId(SecFavoriteToggleRequest request) {
        String authenticatedUserId = securityIdentity.currentUserId();
        return (authenticatedUserId != null && !authenticatedUserId.isBlank())
                ? authenticatedUserId
                : request.getUserId(); // 미인증(테스트) fallback — 운영 미발생
    }

    private static String asString(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer asInt(Object o) {
        if (o instanceof Number n) return n.intValue();
        if (o instanceof String s && !s.isBlank()) {
            try { return Integer.parseInt(s.trim()); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }

    private static Integer asIntOrZero(Object o) {
        Integer v = asInt(o);
        return v == null ? 0 : v;
    }

    private static Integer parseIntOrZero(String s) {
        if (s == null || s.isBlank()) return 0;
        try { return Integer.parseInt(s.trim()); }
        catch (NumberFormatException e) { return 0; }
    }
}
