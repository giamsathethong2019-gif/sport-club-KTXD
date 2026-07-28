# Google Sheets Setup

Mục tiêu: giữ dữ liệu đăng ký bền vững trên Google Sheets, nhưng vẫn giữ nguyên link Render hiện tại.

## 1) Tạo Google Sheet

1. Tạo một Google Sheet mới.
2. Đặt tab đầu tiên tên là `Registrations`.
3. Dòng 1 dán các cột sau:

```text
id,timestamp,fullName,phone,jerseyNumber,jerseySize,position,health,height,weight,speed,stamina,technique,tactic,physical,diet,transport,notes
```

## 2) Tạo Service Account

1. Vào Google Cloud Console.
2. Tạo một project hoặc dùng project hiện có.
3. Bật Google Sheets API.
4. Tạo Service Account.
5. Tạo key JSON và tải file về.
6. Lấy 3 giá trị quan trọng:
   - `client_email`
   - `private_key`
   - `spreadsheet_id`

## 3) Chia sẻ Sheet

Chia sẻ Google Sheet cho `client_email` của service account với quyền `Editor`.

## 4) Cấu hình Render

Trong Render service hiện tại, thêm Environment Variables:

```text
GOOGLE_SHEETS_SPREADSHEET_ID=...
GOOGLE_SHEETS_CLIENT_EMAIL=...
GOOGLE_SHEETS_PRIVATE_KEY=...
GOOGLE_SHEETS_TAB_NAME=Registrations
```

Lưu ý:
- `GOOGLE_SHEETS_PRIVATE_KEY` phải giữ nguyên xuống dòng. Trong Render thường cần dán dạng một dòng có `\n`.
- Nếu key bị lỗi, app vẫn chạy bằng cache local, nhưng dữ liệu mới sẽ không đẩy lên Sheets.

## 5) Redeploy

Sau khi lưu biến môi trường, redeploy service trên Render.

## 6) Kiểm tra

Mở trang:

```text
https://sport-club-ktxd.onrender.com/
```

Nếu đã đúng, banner nguồn dữ liệu sẽ hiện:
- `Nguồn chính: Google Sheets`

## 7) Chuyển 8 người cũ sang Sheet

Khi Sheets được cấu hình đúng, app sẽ tự đẩy 8 người hiện có từ `registrations.json` lên tab `Registrations` nếu sheet đang trống.
