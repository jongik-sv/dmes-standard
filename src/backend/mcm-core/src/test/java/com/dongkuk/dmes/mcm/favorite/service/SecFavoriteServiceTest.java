package com.dongkuk.dmes.mcm.favorite.service;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.favorite.dto.SecFavoriteSearchRequest;
import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavoriteFold;
import com.dongkuk.dmes.mcm.favorite.repository.SecUserFavoriteFoldRepository;
import com.dongkuk.dmes.mcm.favorite.repository.SecUserFavoriteRepository;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** {@link SecFavoriteService} 조회 사용자 격리 — 요청 body 의 userId 로 다른 사용자 즐겨찾기를 읽지 못한다(IDOR). */
@ExtendWith(MockitoExtension.class)
class SecFavoriteServiceTest {

    @Mock SecUserFavoriteRepository favoriteRepository;
    @Mock SecUserFavoriteFoldRepository folderRepository;
    @Mock MenuCatalog menuCatalog;
    @Mock SecurityIdentity securityIdentity;

    @InjectMocks SecFavoriteService service;

    private static SecFavoriteSearchRequest search(String userId) {
        SecFavoriteSearchRequest req = new SecFavoriteSearchRequest();
        req.setUserId(userId);
        return req;
    }

    private static SecUserFavoriteFold folder(String userId, String id) {
        SecUserFavoriteFold f = new SecUserFavoriteFold();
        f.setUserId(userId);
        f.setFvtFoldId(id);
        f.setFvtFoldNm("즐겨찾기");
        f.setFvtFoldSeq(0);
        return f;
    }

    @Test
    @DisplayName("인증 사용자가 있으면 요청 userId(다른 사용자)를 무시하고 본인 즐겨찾기만 조회한다")
    void searchUsesAuthenticatedUser() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(folderRepository.findByUserIdOrderByFvtFoldSeq("userA")).thenReturn(List.of(folder("userA", "FVT000")));
        when(favoriteRepository.findByUserId("userA")).thenReturn(new ArrayList<>()); // 서비스가 정렬하므로 가변 목록
        when(menuCatalog.snapshot()).thenReturn(MenuCatalog.Snapshot.of(List.of(), List.of())); // 이전 findAll mock 기본값(빈 목록)과 같은 뜻

        List<Map<String, Object>> rows = service.searchFavorites(search("userB"));

        assertThat(rows).extracting(r -> r.get("userId")).containsOnly("userA");
        verify(folderRepository, never()).findByUserIdOrderByFvtFoldSeq("userB");
        verify(favoriteRepository, never()).findByUserId("userB");
    }

    @Test
    @DisplayName("인증 사용자도 요청 userId 도 없으면 빈 목록이고 저장소를 읽지 않는다")
    void searchWithoutUser() {
        when(securityIdentity.currentUserId()).thenReturn(null);

        assertThat(service.searchFavorites(search(null))).isEmpty();
        verify(folderRepository, never()).findByUserIdOrderByFvtFoldSeq(anyString());
        verify(favoriteRepository, never()).findByUserId(anyString());
    }
}
