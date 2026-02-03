---
description: Yeni session açıldığında agent'ın proje context'ine %100 hakim olmasını sağlar
---

# Memory Reload Workflow

Bu workflow `/memory-reload` komutu ile çalıştırılır ve agent'ın yeni session'da önceki session'ın tüm context'ine sahip olmasını sağlar.

## Prerequisites

// turbo-all

Aşağıdaki dosyaların mevcut olması gerekir:
- `src/lib/memory/.context/resumable.json` - Son session'ın resumable context'i
- `src/lib/memory/.context/pipeline-status.json` - CI/CD pipeline durumu
- `src/lib/memory/.snapshots/*.json` - Session snapshot'ları

## Adımlar

### 1. Integrity Check

Context dosyalarının integrity'sini kontrol et:

```bash
ls -la src/lib/memory/.context/ src/lib/memory/.snapshots/
```

JSON validity kontrolü:
```bash
cat src/lib/memory/.context/resumable.json | head -5
```

Checksum doğrulama (eğer mevcutsa):
- `resumable.json` içindeki checksum alanını kontrol et
- Eşleşmezse WARNING ver ama devam et

### 2. Context Yükle

Session context'ini yükle ve agent'a injection yap:

```bash
cat src/lib/memory/.context/resumable.json
```

Bu dosya 3 tier içerir:

| Tier | Max Tokens | İçerik |
|------|------------|--------|
| **Hot** | 300 | Current task, last exchange, pipeline status, last commit |
| **Warm** | 1000 | Summary, decisions, entities, test results, git history |
| **Cold** | 150 | Snapshot references, statistics |

### 3. Pipeline Status Yükle

```bash
cat src/lib/memory/.context/pipeline-status.json
```

Pipeline durumunu agent context'ine ekle:
- Son pipeline run ID
- Stage durumları (success/failure)
- Test sonuçları (unit/e2e passed/failed)
- Security check sonuçları

### 4. Git State Kontrol

```bash
git log --oneline -3
git status --short
```

Git durumunu analiz et:
- Son commit SHA ile kayıtlı SHA karşılaştır
- Uncommitted değişiklikler var mı kontrol et
- Branch kontrolü yap

### 5. Context Injection

Yüklenen context'i agent'ın çalışma hafızasına enjekte et.

Agent aşağıdaki bilgilere sahip olmalı:

**Hot Context (Immediate)**:
- Current Task ve Status
- Son kullanıcı mesajı ve asistan yanıtı
- Pipeline status (success/failure/pending)
- Last commit SHA
- Aktif dosyalar listesi

**Warm Context (Session)**:
- Session özeti
- Alınan kararlar (decisions)
- Aktif entities (class/function/config)
- Key facts
- Karşılaşılan ve çözülen hatalar
- Test sonuçları (unit: X passed, e2e: Y passed)
- Son 5 git commit

**Cold Context (References)**:
- Snapshot dosya yolu
- Total messages/entities/decisions
- Session süresi

### 6. Verification

Context'in başarıyla yüklendiğini doğrula:

```bash
echo "=== Context Reload Verification ==="
echo "Resumable.json version:"
cat src/lib/memory/.context/resumable.json | grep '"version"'

echo "Pipeline status:"
cat src/lib/memory/.context/pipeline-status.json | grep '"status"' | head -1

echo "Last snapshot:"
ls -t src/lib/memory/.snapshots/*.json | head -1
```

### 7. Fallback Strategies

**Eğer resumable.json bozuksa:**
1. Son snapshot'tan recovery dene
2. `ls -t src/lib/memory/.snapshots/*.json | head -1` ile en son snapshot'u bul
3. Snapshot'tan context oluştur

**Eğer pipeline-status.json yoksa:**
1. GitHub API'den çek: `gh run list --limit 1 --json status,conclusion`
2. Varsayılan değerlerle devam et

**Eğer hiçbir dosya yoksa:**
1. Kullanıcıya WARNING ver
2. Fresh start olarak devam et

### 8. Status Report

Reload işleminin sonucunu raporla:

#### Başarılı Reload

| Check | Status |
|-------|--------|
| Context dosyası okundu | ✅ |
| Checksum doğrulandı | ✅ |
| Hot/Warm/Cold tier'lar yüklendi | ✅ |
| Pipeline status yüklendi | ✅ |
| Git state senkronize | ✅ |
| Agent context'e sahip | ✅ |

#### Hata Durumunda

| Check | Status | Action |
|-------|--------|--------|
| Context bozuk | ⚠️ | Fallback snapshot kullan |
| Pipeline status eksik | ⚠️ | GitHub API'den çek |
| Checksum mismatch | ⚠️ | WARNING ver, devam et |

## Expected Output

Başarılı bir reload sonrası agent şunları bilmeli:

1. **Mevcut Görev**: Ne üzerinde çalışılıyordu
2. **Son Durum**: Hangi aşamadaydık
3. **Pipeline Status**: CI/CD durumu (success/failure)
4. **Git State**: Son commit ve branch
5. **Test Results**: Unit ve E2E test durumları
6. **Aktif Dosyalar**: Hangi dosyalar üzerinde değişiklik yapılıyordu
7. **Alınan Kararlar**: Hangi teknik kararlar alındı
8. **Entities**: Hangi class/function/module'ler üzerinde çalışılıyor
9. **Hatalar**: Hangi hatalar çözüldü (tekrarı önlemek için)

## Token Budgets

| Tier | Max Tokens | İçerik |
|------|------------|--------|
| Hot | 300 | Current task, last exchange, pipeline, commit |
| Warm | 1000 | Summary, decisions, entities, tests, git |
| Cold | 150 | References only |
| **Total** | **1450** | Optimized context |

## Notes

- Context pollutionı önlemek için sadece relevant bilgiler yüklenir
- Token budgetleri aşılırsa compression uygulanır
- Integrity check başarısız olursa fallback snapshot kullanılır
- Rollback imkanı için önceki state saklanır
- Pipeline status her reload'da güncellenir
- Git state ile memory state senkronizasyonu kontrol edilir
