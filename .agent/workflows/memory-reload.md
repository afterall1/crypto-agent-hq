---
description: Yeni session açıldığında agent'ın proje context'ine %100 hakim olmasını sağlar
---

# Memory Reload Workflow

Bu workflow `/memory-reload` komutu ile çalıştırılır ve agent'ın yeni session'da önceki session'ın tüm context'ine sahip olmasını sağlar.

## Prerequisites

// turbo-all

Aşağıdaki dosyaların mevcut olması gerekir:
- `src/lib/memory/.context/resumable.json` - Son session'ın resumable context'i
- `src/lib/memory/.snapshots/*.json` - Session snapshot'ları

## Adımlar

### 1. Integrity Check

Context dosyalarının integrity'sini kontrol et:

```bash
ls -la src/lib/memory/.context/ src/lib/memory/.snapshots/
```

Dosyaların var olduğunu ve geçerli JSON formatında olduğunu doğrula.

### 2. Context Yükle

Session context'ini yükle ve agent'a injection yap:

```bash
cat src/lib/memory/.context/resumable.json
```

Bu dosya 3 tier içerir:
- **Hot Tier**: Immediate context (current task, last exchange, active files)
- **Warm Tier**: Session summary, decisions, entities, facts, topics
- **Cold Tier**: References to snapshot paths

### 3. Context Injection

Yüklenen context'i agent'ın çalışma hafızasına enjekte et.

Agent aşağıdaki bilgilere sahip olmalı:
- Current Task ve Status
- Son kullanıcı mesajı ve asistan yanıtı
- Aktif dosyalar listesi
- Session özeti
- Alınan kararlar
- Aktif entities
- Karşılaşılan ve çözülen hatalar

### 4. Verification

Context'in başarıyla yüklendiğini doğrula:

```bash
echo "Context reload verification..."
cat src/lib/memory/.context/resumable.json | head -30
```

### 5. Status Report

Reload işleminin sonucunu raporla:

**Başarılı Reload İçin**:
- ✅ Context dosyası okundu
- ✅ Hot/Warm/Cold tier'lar yüklendi
- ✅ Agent context'e sahip

**Hata Durumunda**:
- Fallback snapshot kullan
- Hata mesajını kullanıcıya bildir

## Expected Output

Başarılı bir reload sonrası agent şunları bilmeli:

1. **Mevcut Görev**: Ne üzerinde çalışılıyordu
2. **Son Durum**: Hangi aşamadaydık
3. **Aktif Dosyalar**: Hangi dosyalar üzerinde değişiklik yapılıyordu
4. **Alınan Kararlar**: Hangi teknik kararlar alındı
5. **Entities**: Hangi class/function/module'ler üzerinde çalışılıyor
6. **Hatalar**: Hangi hatalar çözüldü (tekrarı önlemek için)

## Token Budgets

| Tier | Max Tokens | İçerik |
|------|------------|--------|
| Hot | 500 | Current task, last exchange |
| Warm | 2000 | Summary, decisions, entities |
| Cold | 200 | References only |
| **Total** | **2700** | Optimized context |

## Notes

- Context pollutionı önlemek için sadece relevant bilgiler yüklenir
- Token budgetleri aşılırsa compression uygulanır
- Integrity check başarısız olursa fallback snapshot kullanılır
- Rollback imkanı için önceki state saklanır
