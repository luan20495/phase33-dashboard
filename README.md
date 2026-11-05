# XWeb Phase 3.3 — Release Board

Dashboard báo cáo tiến độ Phase 3.3 bằng tiếng Việt, responsive cho desktop/mobile.

- `index.html`: giao diện với bộ lọc đợt, trạng thái, cờ, rủi ro, tích hợp và tìm kiếm.
- `status.json`: snapshot thông tin đã xác minh, cập nhật thủ công theo bằng chứng QA/SEC/PROD.

## Xem dashboard

Chạy một web server tĩnh trong thư mục repo, ví dụ `python3 -m http.server 8080`, rồi mở `http://localhost:8080`.

## Cập nhật

Cập nhật `status.json` sau khi có bằng chứng mới. **Không coi merge DEV là đã lên PROD.** Mỗi lần cập nhật cần ghi `asOf` theo giờ Việt Nam (Asia/Ho_Chi_Minh). Hiện chưa có lịch cron hoặc GitHub Action tự động.

## Bảo mật

**Repo hiện là PUBLIC.** Chỉ đưa trạng thái tổng hợp đã được phép công khai. Không commit tài khoản, mật khẩu, token, endpoint nội bộ, log nhạy cảm, lỗ hổng chưa xử lý hoặc số liệu tài chính chi tiết. Nếu cần bảng đầy đủ nội bộ, hãy chuyển repo sang PRIVATE và thiết kế cơ chế xác thực cho hosting.
