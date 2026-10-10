---
title: Hızlı Başlangıç
description: İlk sağlayıcınızı yapılandırın ve OpenAI Codex'i üç komutta OpenRelay üzerinden yönlendirin.
---

Bu kılavuz, yeni bir kurulumdan başlayarak Codex'i OpenAI harici bir model
üzerinde çalıştırmanızı sağlar.

## 1. Kurulum sihirbazını çalıştırın

```bash
orl init
```

`orl init` adım adım size rehberlik eder:

1. **Bir sağlayıcı seçin** — yerleşik kayıt defterindeki 103 önayardan birini
   veya bir temel URL ile adaptör yazmak için `custom` seçeneğini belirleyin.
2. **API anahtarı** — bir anahtar yapıştırın veya `${ANTHROPIC_API_KEY}` gibi
   bir ortam değişkenine başvurun.
3. **Varsayılan model** — anahtar, yerel ve özel sağlayıcılar için önayarı kabul
   edin veya bir model kimliği girin.
4. **Proxy portu** — varsayılan olarak `10100`.
5. **Codex'e enjekte edilsin mi?** — normal bir geri döngü kurulumunda
   OpenRelay, `$CODEX_HOME/config.toml` (varsayılan `~/.codex/config.toml`)
   dosyasına bir kök `openai_base_url` ekler, böylece Codex'in yerleşik `openai`
   sağlayıcısı proxy'yi hedefler. Uzak/LAN bağlantıları bunun yerine bir API
   kimlik doğrulama başlığına sahip özel bir sağlayıcı girdisi kullanır.
6. **Otomatik başlatma dolgusu (shim) kurulsun mu?** — etkinleştirildiğinde,
   `codex` başlatıldığında önce `orl ensure` çalışır.

Sonuç `$OPENCODEX_HOME/config.json` (varsayılan `~/.opencodex/config.json`)
dosyasına kaydedilir.

:::note[GPT-5.6 dağıtım girdileri]
Mevcut kararlı sürüm; ChatGPT doğrudan geçişi, OpenAI API anahtarı, OpenRouter
ve deneysel Cursor adaptörü için GPT-5.6 Sol/Terra/Luna modellerini tohumlar.
Bunlar yalnızca yukarı akış hesabının erişimi olduğunda çalışır. OpenAI API
anahtarı ve OpenRouter önayarları 922.000 tokenlik kullanılabilir bir bağlam
penceresi bildirir; Cursor kendi adaptör meta verilerini korur.
:::

## 2. Proxy'yi başlatın

```bash
orl start            # varsayılan port 10100
orl start --port 8080
```

Başlatıldığında OpenRelay:

- PID'sini `~/.opencodex/ocx.pid` dosyasına yazar (ve iki kez başlamayı
  reddeder),
- Sağlayıcının desteklediği durumlarda canlı modelleri keşfeder ve **yerel ile
  yönlendirilen girdileri Codex'in model kataloğuna senkronize eder**,
- `http://localhost:<port>/v1` üzerinde dinler.

İstenen port meşgulse `orl start` durur ve portu neyin tuttuğunu bildirir: orada bir
OpenRelay yanıt veriyorsa önce `orl stop` çalıştırın veya `orl start --port <port>` ile
boş bir portta başlatın. Kendiliğinden başka bir porta geçmez; önceki davranış, iki
proxy'nin yan yana çalışmasına ve Codex'in daha yeni olana yönlendirilmesine neden oluyordu.

Kontrol edin:

```bash
orl status
orl gui       # kontrol panelini canlı port üzerinde açın
```

## 3. Codex'i kullanın

Codex artık OpenRelay ile şeffaf bir şekilde konuşur:

```bash
codex "Okunabilirlik için bu fonksiyonu yeniden düzenle"
```

Yönlendirilen belirli bir modeli hedeflemek için Codex'in model seçicisinin
gösterdiği `saglayici/model` biçimini kullanın:

```bash
codex -m "anthropic/claude-opus-5" "Bu yığın izini (stack trace) açıkla"
codex -m "ollama-cloud/glm-5.2"      "Bir SQL geçişi yaz"
```

## Alt ajan modellerini seçin (isteğe bağlı)

Yeni bir yapılandırma, Codex'in alt ajan seçicisinde beş yerel model sunar:
`gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` ve `gpt-6-astra`. En
fazla beş yerel veya yönlendirilmiş modeli değiştirmek veya yeniden sıralamak
için `orl gui`'yi açın. Kontrol paneli ayrıca tercih edilen bir alt ajan
modelini ve akıl yürütme çabasını ayarlayabilir. v1/base/v2 seçmek ve rehberlik,
yerel varsayılanlar ve geri dönüşün ne zaman geçerli olduğunu anlamak için [Alt
Ajan Arayüzü](/tr/guides/sub-agent-surface/) sayfasına bakın.

## Anahtar yapıştırmak yerine giriş yapma

Bazı sağlayıcılar gerçek hesap girişini (OAuth, otomatik yenilenen) destekler:

```bash
orl login xai          # veya: anthropic, kimi, kiro, google-antigravity, cursor
orl logout xai
```

OpenAI'nin kendisi **hiçbir anahtara** ihtiyaç duymaz — varsayılan sağlayıcı
mevcut `codex login` kimlik bilgilerinizi doğrudan iletir (bkz.
[Sağlayıcılar](/tr/guides/providers/)).

## Durdurma ve geri yükleme

```bash
orl stop          # proxy'yi durdurun ve yerel Codex'i geri yükleyin
orl restore       # durdurmadan yerel Codex'i geri yükleyin (takma ad: orl eject)
orl restore back  # Codex'i hala çalışan proxy üzerinden tekrar yönlendirin
```

## Sonraki Adımlar

- [Nasıl Çalışır](/tr/getting-started/how-it-works/) — her isteğe ne olur?
- [Sağlayıcılar](/tr/guides/providers/) — kimlik doğrulamanın her yolu.
- [Yapılandırma](/tr/reference/configuration/) — tam `config.json` referansı.
