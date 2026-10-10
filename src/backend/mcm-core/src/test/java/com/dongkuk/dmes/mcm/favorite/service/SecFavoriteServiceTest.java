package com.dongkuk.dmes.mcm.favorite.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.favorite.dto.SecFavoriteSearchRequest;
import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavorite;
import com.dongkuk.dmes.mcm.favorite.entity.SecUserFavoriteFold;
import com.dongkuk.dmes.mcm.favorite.repository.SecUserFavoriteFoldRepository;
import com.dongkuk.dmes.mcm.favorite.repository.SecUserFavoriteRepository;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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

    // ── reorder (끌어서 순서 바꾸기) ─────────────────────────────────────────

    private static SecUserFavoriteFold folderSeq(String userId, String id, int seq) {
        SecUserFavoriteFold f = folder(userId, id);
        f.setFvtFoldSeq(seq);
        return f;
    }

    private static SecUserFavorite fav(String userId, String foldId, String fullId, String menuId, int seq) {
        SecUserFavorite f = new SecUserFavorite();
        f.setUserId(userId);
        f.setFvtFoldId(foldId);
        f.setFullId(fullId);
        f.setMenuId(menuId);
        f.setMenuSeq(1);
        f.setFvtSeq(seq);
        return f;
    }

    private static Map<String, Object> folderRow(String foldId) {
        return Map.of("fvtFoldId", foldId);
    }

    private static Map<String, Object> itemRow(String foldId, String fullId, String menuId) {
        return Map.of("fvtFoldId", foldId, "fullId", fullId, "menuId", menuId);
    }

    @Test
    @DisplayName("폴더 순서 저장 — FVT_FOLD_SEQ 를 요청 순서대로 1..n 으로 쓴다")
    @SuppressWarnings("unchecked")
    void reorderFolders() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        SecUserFavoriteFold f0 = folderSeq("userA", "FVT000", 0);
        SecUserFavoriteFold f1 = folderSeq("userA", "FVT001", 1);
        SecUserFavoriteFold f2 = folderSeq("userA", "FVT002", 2);
        when(folderRepository.findByUserIdOrderByFvtFoldSeq("userA")).thenReturn(List.of(f0, f1, f2));
        when(favoriteRepository.findByUserId("userA")).thenReturn(new ArrayList<>());

        service.reorderFavorites(List.of(folderRow("FVT002"), folderRow("FVT000"), folderRow("FVT001")));

        assertThat(f2.getFvtFoldSeq()).isEqualTo(1);
        assertThat(f0.getFvtFoldSeq()).isEqualTo(2);
        assertThat(f1.getFvtFoldSeq()).isEqualTo(3);
        ArgumentCaptor<List<SecUserFavoriteFold>> saved = ArgumentCaptor.forClass(List.class);
        verify(folderRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).containsExactlyInAnyOrder(f0, f1, f2);
        verify(favoriteRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("폴더 안 순서 저장 — 그 폴더 메뉴의 FVT_SEQ 만 1..m 으로 쓰고 다른 폴더는 건드리지 않는다")
    @SuppressWarnings("unchecked")
    void reorderItemsWithinFolder() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        SecUserFavorite a = fav("userA", "FVT000", "csa/a", "M_A", 1);
        SecUserFavorite b = fav("userA", "FVT000", "csa/b", "M_B", 2);
        SecUserFavorite c = fav("userA", "FVT000", "csa/c", "M_C", 3);
        SecUserFavorite other = fav("userA", "FVT001", "csa/x", "M_X", 1);
        when(folderRepository.findByUserIdOrderByFvtFoldSeq("userA"))
                .thenReturn(List.of(folderSeq("userA", "FVT000", 1), folderSeq("userA", "FVT001", 2)));
        when(favoriteRepository.findByUserId("userA")).thenReturn(new ArrayList<>(List.of(a, b, c, other)));

        service.reorderFavorites(List.of(
                itemRow("FVT000", "csa/c", "M_C"), itemRow("FVT000", "csa/a", "M_A")));

        assertThat(c.getFvtSeq()).isEqualTo(1);
        assertThat(a.getFvtSeq()).isEqualTo(2);
        assertThat(b.getFvtSeq()).isEqualTo(3); // 목록에 없던 메뉴는 뒤에
        assertThat(other.getFvtSeq()).isEqualTo(1);
        ArgumentCaptor<List<SecUserFavorite>> saved = ArgumentCaptor.forClass(List.class);
        verify(favoriteRepository).saveAll(saved.capture());
        assertThat(saved.getValue()).containsExactlyInAnyOrder(a, b, c);
        verify(folderRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("순서 저장 — 남의 폴더·다른 폴더의 메뉴를 가리키면 아무것도 쓰지 않고 INVALID_VALUE")
    void reorderRejectsForeignKeys() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(folderRepository.findByUserIdOrderByFvtFoldSeq("userA"))
                .thenReturn(List.of(folderSeq("userA", "FVT000", 1)));
        when(favoriteRepository.findByUserId("userA"))
                .thenReturn(new ArrayList<>(List.of(fav("userA", "FVT000", "csa/a", "M_A", 1))));

        for (List<Map<String, Object>> bad : List.of(
                List.of(folderRow("FVT000"), folderRow("FVT999")),                              // 없는 폴더
                List.of(itemRow("FVT001", "csa/a", "M_A")),                                     // 다른 폴더로 이동(범위 밖)
                List.of(itemRow("FVT000", "csa/victim", "M_V")),                                // 남의 메뉴
                List.of(itemRow("FVT000", "csa/a", "M_A"), itemRow("FVT000", "csa/a", "M_A")))) { // 중복
            assertThatThrownBy(() -> service.reorderFavorites(bad))
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        }
        verify(folderRepository, never()).saveAll(any());
        verify(favoriteRepository, never()).saveAll(any());
    }

    @Test
    @DisplayName("순서 저장 — 인증 정보가 없으면 AUTH_FAILED 이고 저장소를 읽지 않는다")
    void reorderRequiresAuthentication() {
        when(securityIdentity.currentUserId()).thenReturn(null);

        assertThatThrownBy(() -> service.reorderFavorites(List.of(folderRow("FVT000"))))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.AUTH_FAILED));
        verify(folderRepository, never()).findByUserIdOrderByFvtFoldSeq(anyString());
    }

    @Test
    @DisplayName("조회 — 메뉴 행은 폴더 순서(FVT_FOLD_SEQ) 다음 폴더 안 순서로 정렬한다")
    void searchSortsMenusByFolderSeqThenItemSeq() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        // 폴더 ID 사전순(FVT000 < FVT001)과 폴더 순서가 반대인 경우
        when(folderRepository.findByUserIdOrderByFvtFoldSeq("userA"))
                .thenReturn(List.of(folderSeq("userA", "FVT001", 1), folderSeq("userA", "FVT000", 2)));
        when(favoriteRepository.findByUserId("userA")).thenReturn(new ArrayList<>(List.of(
                fav("userA", "FVT000", "csa/a", "M_A", 1),
                fav("userA", "FVT001", "csa/y", "M_Y", 2),
                fav("userA", "FVT001", "csa/x", "M_X", 1))));
        when(menuCatalog.snapshot()).thenReturn(MenuCatalog.Snapshot.of(List.of(), List.of()));

        List<Map<String, Object>> rows = service.searchFavorites(search(null));

        assertThat(rows.stream().filter(r -> r.get("menuId") != null).map(r -> r.get("menuId")))
                .containsExactly("M_X", "M_Y", "M_A");
    }
}
