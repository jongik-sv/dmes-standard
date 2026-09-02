package com.dongkuk.dmes.mcm.audit.repository;

import com.dongkuk.dmes.mcm.audit.entity.KeyStore;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface KeyStoreRepository extends JpaRepository<KeyStore, String> {
    List<KeyStore> findByActive(String active);
    Optional<KeyStore> findFirstByActiveOrderByCreatedAtDesc(String active);
}
