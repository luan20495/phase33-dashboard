# XWeb Bảng điều hành (Delivery Control)

Dashboard Owner bằng tiếng Việt (có English), responsive desktop/mobile, sáng/tối/tự động. Lộ trình, triển khai và nghiệm thu theo bằng chứng.

**Xem dashboard:** https://luan20495.github.io/phase33-dashboard/

- `index.html`: một trang, tự chứa (không CDN/font ngoài).
- `status.json`: dữ liệu (đọc cùng thư mục). Tác vụ đồng bộ hằng giờ sửa file này.
- `tests/process-ui.mjs`: kiểm tra tab Quy trình & cấu hình. `tests/shell-ui.mjs`: kiểm tra khung 4 tab, định tuyến, bàn phím, thẻ Owner, a11y.

## Cấu trúc 4 tab

| Tab | Hash | Nội dung |
|---|---|---|
| Lộ trình | `#roadmap` (= `#roadmap/1`), `#roadmap/1` … `#roadmap/6` | 6 tab con Đợt 1–6. Mỗi đợt: mục tiêu, ngày dự kiến, thanh tiến độ (chỉ đếm số mục đã hoàn tất) và danh sách mục CHƯA xong. Mục hoàn tất rời khỏi đây, sang tab Đã lên PROD. Cuối trang: "Ngoài lộ trình" (audit đã xong, việc tạm gác). |
| Quy trình & cấu hình | `#process` | Quy tắc đã chỉ đạo, sửa và gửi cho Claude (giữ nguyên hành vi). |
| Đã lên PROD | `#prod/on` (mặc định), `#prod/done` | **Hoàn tất**: chỉ mục có `closed: true` (QA/SEC độc lập + đã kiểm trên PROD + Owner chấp nhận). **Đã bật, chưa hoàn tất**: nhóm 19 hạng mục nền tảng (tiến độ, bộ lọc, ngăn chi tiết) và việc giao có `group: ON_PROD` chưa đóng. ON không phải DONE. |
| Chờ anh quyết | `#owner` | Thẻ quyết định/thao tác của Owner (chọn phương án, ghi chú, sao chép nội dung `## [OWNER] HH:MM ICT DD/MM: duyệt từ dashboard`). Chấm đỏ + số khi có việc chờ. |

Hash cũ vẫn dùng được và được chuyển hướng: `#phase33` → `#prod/on`, `#remaining` và `#today` → `#roadmap/1`.
Bàn phím: mũi tên trái/phải, Home, End trên cả tab chính lẫn tab con.

## Trường tùy chọn trong `status.json` (tương thích ngược; thiếu thì tự suy luận)

- `dailyWork.items[].batch`: số `1..6` hoặc mảng (vd `[3,5]`). `[]` = không thuộc đợt nào. Thiếu: `D1.x`..`D6` theo mã; `IN_PROGRESS`/`PLANNED`/`DEV_WAIT`/`WAIT_OWNER` mặc định vào Đợt 2; `AUDIT_DONE`/`PARKED` vào "Ngoài lộ trình"; `ON_PROD` không vào đợt nào.
- `dailyWork.items[].closed`: `true` chỉ khi đã có QA/SEC độc lập + kiểm trên PROD + Owner chấp nhận. Thiếu = chưa đóng. `closedAt` (ISO, tùy chọn) hiển thị giờ hoàn tất. Hiện chỉ `T35` là `true` (Owner chấp nhận 13:36 ICT 11/11).
- `dailyWork.items[].batchPlan`: `true` cho mục kế hoạch cả đợt (`D2`..`D6`); hiển thị làm "Kế hoạch đợt", không đếm vào tiến độ.
- `post33Backlog.items[].batch`: như trên; thiếu thì đọc thẻ đầu `next` (vd `[Đợt 4 (~26/11)]`). `batchPart` (object `{"3": "...", "5": "..."}`) ghi phần việc thuộc từng đợt khi một mục nằm ở hai đợt. `closed` tùy chọn như trên.
- `features[].closed`: tùy chọn; nhóm 19 hạng mục mặc định thuộc Đợt 3 (mục chưa ON hiện ở Lộ trình, mục đã ON hiện ở Đã lên PROD).
- `roadmap.batches[]`: `{n, title, titleEn, goal, goalEn, eta, etaEn}` cho phần đầu mỗi đợt; `roadmap.note`. Ngày là ước lượng, không phải số đo.
- Thanh tiến độ mỗi đợt = số mục `closed` / tổng số mục gắn đợt (không có phần trăm ước lượng).

## Lịch cập nhật

Đã bật tác vụ ChatGPT **XWeb — Cập nhật dashboard mỗi giờ**, ID `6aec75d624848191b569c62f6a2388fc`. Lịch: **20:10 ngày 05/11/2026 rồi mỗi giờ vào phút 10 (giờ Việt Nam, UTC+7)**.

Tác vụ được hướng dẫn đọc hai repository XWeb và issue Master #88, so sánh bằng chứng và chỉ cập nhật file `status.json` khi có thay đổi xác minh được. Không commit khi không có thay đổi, không suy diễn đã deploy từ PR merge.

**Giới hạn quan trọng:** Việc tạo lịch không tự chứng minh GitHub connector sẽ còn quyền ghi ở lần chạy tương lai. Mỗi lần chạy phải đọc lại blob SHA, ghi nếu có bằng chứng mới, kiểm tra thành công; nếu bị chặn quyền phải báo thất bại. GitHub Pages phục vụ lại file sau commit; lịch này không sửa mã hay vận hành PROD.

Lịch giám sát XWeb chỉ-đọc và báo cáo release hằng ngày vẫn hoạt động độc lập.

## Nguyên tắc dữ liệu

1. Phân biệt CODE / DEV MERGED / MAIN PROMOTED / PROD DEPLOYED / PROD ENABLED / OWNER UAT PASS.
2. Mỗi mục có trạng thái đợt R1/R2 dự kiến hoặc thực tế; chưa chứng minh thì giữ UNKNOWN/OFF như lần kiểm tra cuối.
3. Dùng múi giờ `Asia/Ho_Chi_Minh`. `asOf` chỉ đổi khi dữ liệu thực chất có thay đổi.
4. Không đưa bí mật, mật khẩu, key, tài khoản, path hạ tầng nhạy cảm, PII, chi tiết lỗ hổng hoặc số liệu tài chính riêng lên repo công khai.

Nếu GitHub Pages không tải được dữ liệu, mở cùng thư mục qua web server như `python3 -m http.server 8080` để kiểm tra `index.html` và `status.json` cục bộ.

## Chạy kiểm tra cục bộ

```
npm i --no-save playwright-core axe-core   # hoặc đặt PW_MODULE / AXE trỏ tới bản có sẵn
node tests/process-ui.mjs
node tests/shell-ui.mjs
```
Hai bộ test tự mở web server tạm trên 127.0.0.1 và không ghi vào `status.json`.
