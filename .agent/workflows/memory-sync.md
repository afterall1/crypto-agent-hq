---
description: Session memory'yi %100 eksiksiz kaydet ve güncelle
---

# Memory Sync Workflow

Bu workflow, mevcut session'ın tüm context'ini memory architecture'a kaydeder.

## Prerequisites

// turbo-all

Aşağıdaki dizinlerin mevcut olması gerekir:
```bash
mkdir -p src/lib/memory/.snapshots src/lib/memory/.context
```

## Adımlar

### 1. Session Özeti Oluştur

Önce mevcut session'ın özet bilgilerini topla:
- Conversation ID
- Yapılan değişiklikler (dosya oluşturma, düzenleme, silme)
- Alınan kararlar
- Karşılaşılan hatalar ve çözümleri
- Öğrenilen bilgiler
- Mevcut task durumu

### 2. Git State Yakala

```bash
git log --oneline -5
```

Son commit bilgilerini kaydet:
- Son commit SHA
- Commit mesajı
- Branch adı

### 3. Pipeline Status Kontrol

```bash
gh run list --limit 1 --json databaseId,status,conclusion,displayTitle
```

Pipeline durumunu `pipeline-status.json` dosyasına kaydet:
```json
{
  "lastPipeline": {
    "runId": "{run-id}",
    "status": "success|failure|pending",
    "conclusion": "success|failure",
    "commit": "{sha}"
  },
  "stages": {
    "stage1_code_tests": { "status": "...", "duration": 0 },
    "stage2_simulation": { "status": "...", "duration": 0 },
    "stage3_security": { "status": "...", "duration": 0 }
  }
}
```

### 4. Session Snapshot Oluştur

Session snapshot dosyasını oluştur: `src/lib/memory/.snapshots/session-{timestamp}.json`

İçerik:
```json
{
  "id": "snapshot-{timestamp}",
  "conversationId": "{current-conversation-id}",
  "timestamp": "{ISO-timestamp}",
  "summary": "Session özeti",
  "decisions": [
    {
      "id": "dec-001",
      "title": "Karar başlığı",
      "description": "Detay",
      "rationale": "Neden bu karar alındı",
      "timestamp": "{ISO-timestamp}",
      "impact": "critical|high|medium|low"
    }
  ],
  "entities": [
    {
      "name": "EntityName",
      "type": "class|function|config|file",
      "path": "dosya/yolu.ts",
      "description": "Açıklama"
    }
  ],
  "filesModified": ["dosya1.ts", "dosya2.ts"],
  "errorsEncountered": [
    {
      "error": "Hata açıklaması",
      "resolution": "Çözüm",
      "timestamp": "{ISO-timestamp}"
    }
  ],
  "keyFacts": ["Önemli bilgi 1", "Önemli bilgi 2"],
  "toolCalls": {
    "write_to_file": 0,
    "run_command": 0,
    "view_file": 0
  },
  "statistics": {
    "totalMessages": 0,
    "totalToolCalls": 0,
    "filesCreated": 0,
    "filesModified": 0
  }
}
```

### 5. Resumable Context Güncelle

`src/lib/memory/.context/resumable.json` dosyasını güncelle:

```json
{
  "version": "2.1.0",
  "generatedAt": "{ISO-timestamp}",
  "conversationId": "{conversation-id}",
  "checksum": "sha256:{hash}",
  "hot": {
    "currentTask": "Mevcut görev",
    "taskStatus": "completed|in-progress|blocked",
    "lastUserMessage": "Son kullanıcı mesajı",
    "lastAssistantMessage": "Son asistan yanıtı",
    "activeFilesPaths": ["aktif/dosya/yolları"],
    "immediateContext": ["Anlık context bilgileri"],
    "pipelineStatus": "success|failure|pending",
    "lastCommit": "{sha}"
  },
  "warm": {
    "sessionSummary": "Session özeti",
    "recentDecisions": [...],
    "activeEntities": [...],
    "keyFacts": [...],
    "errorsEncountered": [...],
    "testResults": {
      "unit": { "passed": 0, "failed": 0 },
      "e2e": { "passed": 0, "failed": 0 }
    },
    "gitHistory": ["commit1", "commit2"]
  },
  "cold": {
    "snapshotPath": "src/lib/memory/.snapshots/session-{timestamp}.json",
    "totalMessages": 0,
    "totalEntities": 0,
    "totalDecisions": 0,
    "sessionDuration": 0
  },
  "tokenEstimates": {
    "hot": 300,
    "warm": 1000,
    "cold": 150,
    "total": 1450
  }
}
```

### 6. Test Coverage Kaydet (Eğer Varsa)

```bash
cat coverage/coverage-summary.json 2>/dev/null || echo "No coverage data"
```

### 7. Pipeline Status Dosyasını Güncelle

`src/lib/memory/.context/pipeline-status.json` dosyasını güncelle.

### 8. Task Durumunu Kaydet

`task.md` artifact'ını güncelle:
- Tamamlanan görevleri [x] olarak işaretle
- Devam eden görevleri [/] olarak işaretle
- Yeni görevleri ekle

### 9. Git Commit (Opsiyonel)

```bash
git add src/lib/memory/.context/ src/lib/memory/.snapshots/
git commit -m "chore: Memory sync - session snapshot saved"
git push
```

### 10. Doğrulama

Aşağıdaki kontrolleri yap:
```bash
# JSON validity check
cat src/lib/memory/.context/resumable.json | head -20
cat src/lib/memory/.context/pipeline-status.json | head -10

# File existence
ls -la src/lib/memory/.context/ src/lib/memory/.snapshots/
```

### 11. Özet Rapor

Kullanıcıya şu bilgileri raporla:

| Metric | Value |
|--------|-------|
| Snapshot ID | `snapshot-{timestamp}` |
| Messages | {count} |
| Decisions | {count} |
| Files Modified | {count} |
| Pipeline Status | {status} |
| Last Commit | {sha} |

---

## Önemli Notlar

- Bu workflow, session sonunda veya kritik değişikliklerden sonra çalıştırılmalı
- Tüm veriler atomic olarak kaydedilir
- Hata durumunda otomatik rollback yapılır
- Resumable context ile sonraki session'da devam edilebilir
- Pipeline status her sync'te güncellenir
- Token budgets context boyutunu optimize eder
