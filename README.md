# Key Panel (test)

Basit test paneli — kurucu kullanıcıları ve key üretimi gösterir.

Başlamak için:

```powershell
cd C:\Users\Deniz\hile\workspace\key-panel
npm install
npm start

# sonra tarayıcıda http://localhost:3000 aç
```

Test kullanıcıları:
- kullanıcı: `kurucu` şifre: `kurucu123` (display: @QUARTZ)
- kullanıcı: `kurucu2` şifre: `kurucu123` (display: @CARDCINS)
Test kullanıcıları:
- kullanıcı: `QUARTZ` şifre: `1234` (display: @QUARTZ)
- kullanıcı: `CARDCINS` şifre: `1234` (display: @CARDCINS)

Notlar:
- İlk çalıştırmada `data/db.json` içindeki `passwordPlain` alanları sunucu tarafından hashlenip saklanır.
- Founder (`founder`) rolü tüm yetkilere sahiptir. `founder` yeni kullanıcı ekleyebilir ve maksimum süreyi değiştirebilir.

## Yayına Alma (Deployment)

### 🚀 EN KOLAY YÖNTEM: NGROK (Terminalden Link Alma)
### 🌍 KALICI VE ÜCRETSİZ YÖNTEM: RENDER.COM

Vercel gibi servislerle uğraşmadan, kendi bilgisayarındaki siteyi anında internete açmak için:
Vercel'in dosya hatalarıyla uğraşmadan, sitenizi 7/24 açık tutmak için en iyi yöntem **Render** kullanmaktır.

1. Terminalde `npm start` yazıp sunucuyu başlat.
2. Yeni bir terminal aç ve şu komutu yaz:
  ```powershell
  npx ngrok http 3000
  ```
- Ekranda çıkan `Forwarding` karşısındaki `https://....ngrok-free.app` linkini kopyalayın.
- **Bu linki kime atarsanız atın, panelinize girebilir!** (Bilgisayarınız açık olduğu sürece).
1. Kodlarınızı **GitHub**'a yükleyin.
2. **render.com** adresine gidip üye olun.
3. **"New + "** butonuna basıp **"Web Service"** seçin.
4. GitHub reponuzu bağlayın.
5. Ayarları şöyle yapın:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. **Environment Variables** kısmına MongoDB linkinizi ekleyin:
   - Key: `MONGODB_URI`
   - Value: `mongodb+srv://...` (Linkiniz)
7. **Create Web Service** butonuna basın. Bitti!
