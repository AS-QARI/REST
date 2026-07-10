# REST API with Supabase

REST API مع Supabase للإدارة والتخزين.

## خطوات الإعداد

### 1. تثبيت المكتبات
```bash
npm install
```

### 2. إعداد متغيرات البيئة
انسخ `.env.example` إلى `.env`:
```bash
cp .env.example .env
```

### 3. إضافة بيانات Supabase
اذهب إلى لوحة Supabase وأضف:
- **SUPABASE_URL**: رابط المشروع من Settings > API
- **SUPABASE_ANON_KEY**: المفتاح العام من Settings > API

ملف `.env`:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
PORT=3000
```

### 4. تشغيل السيرفر
```bash
npm start
```

أو للتطوير مع تحديث تلقائي:
```bash
npm run dev
```

### 5. اختبار الاتصال
افتح في المتصفح:
```
http://localhost:3000/api/health
```

يجب أن تحصل على استجابة نجاح إذا تم الاتصال بـ Supabase بنجاح ✅