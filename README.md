# Đường Số — Web học toán (có backend + lưu dữ liệu thật)

Đây là bản nâng cấp có **máy chủ backend** và **cơ sở dữ liệu**, khác với bản demo tĩnh trước đó:

- Có đăng ký / đăng nhập tài khoản thật (mật khẩu được băm an toàn, không lưu dạng chữ thường).
- Điểm, chuỗi ngày học, tiến độ khoá học, mức độ thành thạo được **lưu trên máy chủ** (file `data.json`) — tải lại trang, tắt trình duyệt, hay mở lại vào hôm sau đều không mất dữ liệu.
- Nhiều người dùng khác nhau có thể đăng ký tài khoản riêng trên cùng một máy chủ.

Toàn bộ được viết bằng **Node.js thuần** (chỉ dùng thư viện có sẵn của Node: `http`, `fs`, `crypto`) — **không cần chạy `npm install`**, không cần kết nối Internet để cài đặt gì cả.

## Cách chạy

**Yêu cầu:** đã cài [Node.js](https://nodejs.org) (bản 18 trở lên) trên máy.

1. Mở terminal / command prompt tại thư mục này.
2. Chạy lệnh:
   ```
   node server.js
   ```
3. Thấy dòng `✅ Đường Số đang chạy tại: http://localhost:3000` nghĩa là đã thành công.
4. Mở trình duyệt, truy cập: **http://localhost:3000**
5. Bấm tab "Đăng ký" để tạo tài khoản đầu tiên, hoặc "Đăng nhập" nếu đã có tài khoản.

Để dừng máy chủ, quay lại terminal và nhấn `Ctrl + C`.

## Cấu trúc dự án

```
duong-so-app/
├── server.js         ← máy chủ backend (API + phục vụ giao diện)
├── data.json          ← cơ sở dữ liệu (tự động tạo khi chạy lần đầu)
├── public/
│   └── index.html      ← toàn bộ giao diện (HTML/CSS/JS)
└── README.md
```

## Các API hiện có

| Method | Đường dẫn                | Chức năng                                  |
|--------|---------------------------|---------------------------------------------|
| POST   | `/api/register`           | Tạo tài khoản mới                           |
| POST   | `/api/login`               | Đăng nhập, trả về token                     |
| POST   | `/api/logout`               | Đăng xuất                                   |
| GET    | `/api/me`                    | Lấy trạng thái học tập của tài khoản hiện tại |
| POST   | `/api/lesson/complete`       | Đánh dấu hoàn thành một bài giảng            |
| POST   | `/api/practice/answer`       | Ghi nhận kết quả một câu luyện tập           |

Tất cả API (trừ `register`/`login`) cần header `Authorization: Bearer <token>`.

## Giới hạn của bản demo này

- `data.json` là một file JSON đơn giản — phù hợp để demo hoặc dùng cá nhân/lớp học nhỏ. Nếu muốn dùng cho nhiều người dùng đồng thời ở quy mô lớn, nên thay bằng cơ sở dữ liệu thật (PostgreSQL, MySQL, MongoDB...).
- Phiên đăng nhập (session token) lưu trong bộ nhớ máy chủ — nếu khởi động lại `server.js`, mọi người sẽ cần đăng nhập lại (nhưng dữ liệu học tập trong `data.json` vẫn còn nguyên).
- Chưa có mã hoá HTTPS — phù hợp chạy trên máy cá nhân (`localhost`); nếu triển khai công khai lên Internet, nên đặt sau một reverse proxy có HTTPS (ví dụ Nginx + Let's Encrypt) hoặc dùng dịch vụ hosting có sẵn HTTPS.

## Muốn triển khai thật lên Internet?

Bạn có thể đưa `server.js` này lên các nền tảng như Render, Railway, hoặc một VPS bất kỳ có Node.js — chỉ cần đảm bảo thư mục có quyền ghi file (để `data.json` hoạt động), hoặc thay phần lưu trữ bằng một cơ sở dữ liệu thật nếu cần mở rộng.
"# toan-hoc" 
"# toan-hoc" 
