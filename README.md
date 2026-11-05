# XWeb Phase 3.3 — Release Board

Dashboard báo cáo tiến độ Phase 3.3 bằng tiếng Việt, responsive cho desktop/mobile.

**Xem dashboard:** https://luan20495.github.io/phase33-dashboard/

- `index.html`: giao diện với bộ lọc đợt, trạng thái, cờ, rủi ro, tích hợp và tìm kiếm.
- `status.json`: snapshot 19 hạng mục, trạng thái có nguồn đối chiếu.

## Lịch cập nhật

Đã bật tác vụ ChatGPT **XWeb — Cập nhật dashboard mỗi giờ**, ID `6aec75d624848191b569c62f6a2388fc`. Lịch: **20:10 ngày 05/11/2026 rồi mỗi giờ vào phút 10 (giờ Việt Nam, UTC+7)**.

Tác vụ được hướng dẫn đọc hai repository XWeb và issue Master #88, so sánh bằng chứng và chỉ cập nhật file `status.json` khi có thay đổi xác minh được. Không commit khi không có thay đổi, không suy diễn đã deploy từ PR merge.

**Giới hạn quan trọng:** Việc tạo lịch không tự chứng minh GitHub connector sẽ còn quyền ghi ở lần chạy tương lai. Mỗi lần chạy phải đọc lại blob SHA, ghi nếu có bằng chứng mới, kiểm tra thành công; nếu bị chặn quyền phải báo thất bại. GitHub Pages phục vụ lại file sau commit; lịch này không sửa mã hay vận hành PROD.

Lịch giám sát XWeb Phase 3.3 chỉ-đọc và báo cáo release hằng ngày vẫn hoạt động độc lập.

## Nguyên tắc dữ liệu

1. Phân biệt CODE / DEV MERGED / MAIN PROMOTED / PROD DEPLOYED / PROD ENABLED / OWNER UAT PASS.
2. Mỗi mục có trạng thái đợt R1/R2 dự kiến hoặc thực tế; chưa chứng minh thì giữ UNKNOWN/OFF như lần kiểm tra cuối.
3. Dùng múi giờ `Asia/Ho_Chi_Minh`. `asOf` chỉ đổi khi dữ liệu thực chất có thay đổi.
4. Không đưa bí mật, mật khẩu, key, tài khoản, path hạ tầng nhạy cảm, PII, chi tiết lỗ hổng hoặc số liệu tài chính riêng lên repo công khai.

Nếu GitHub Pages không tải được dữ liệu, mở cùng thư mục qua web server như `python3 -m http.server 8080` để kiểm tra `index.html` và `status.json` cục bộ.
