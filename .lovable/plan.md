## مشکل

در لاگ سرور خطای زیر دیده می‌شود:

```
Conflicting configuration paths were found for the following routes: "/", "/".
Conflicting files:
 /dev-server/src/routes/_authenticated.tsx
 /dev-server/src/routes/index.tsx
```

هم `_authenticated.tsx` (لایه‌ی pathless با `beforeLoad` که در صورت نبود session به `/login` ریدایرکت می‌کند) و هم `index.tsx` (که به `/dashboard` یا `/login` ریدایرکت می‌کند) هر دو مسیر `/` را ادعا می‌کنند. این باعث می‌شود router-generator خراب شود و چانک محصولات (و چند صفحه‌ی دیگر) با خطای `Importing a module script failed` در مرورگر بارگذاری نشود. به همین دلیل صفحه‌ی «محصولات» باز نمی‌شود.

## راه‌حل

1. حذف فایل `src/routes/index.tsx` به‌عنوان مسیر جدا، و انتقال منطق ریدایرکت داخل `_authenticated.tsx`:
   - `_authenticated.tsx` کاربر بدون session را به `/login` می‌فرستد (همان کار فعلی).
   - یک فایل جدید `src/routes/_authenticated/index.tsx` ساخته می‌شود که فقط به `/dashboard` ریدایرکت می‌کند. این‌طور `/` برای کاربر لاگین‌شده مستقیماً داشبورد را نشان می‌دهد و تداخل مسیر برطرف می‌شود.

2. اطمینان از باقی‌ماندن `<Outlet />` در `_authenticated.tsx` (که هست).

3. بعد از اعمال تغییر، dev server خودش `routeTree.gen.ts` را بازتولید می‌کند و خطای generator از بین می‌رود؛ سپس صفحه‌ی محصولات و سایر صفحات بدون «Importing a module script failed» باز خواهند شد.

## بررسی نهایی

- باز کردن `/products` در preview و مطمئن‌شدن از نبود ارور در کنسول.
- چک کردن `/dashboard`, `/orders`, `/inventory` که هنوز سالم هستند.
