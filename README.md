# XWeb Bảng điều hành (Delivery Control)

Dashboard Owner bằng tiếng Việt (có English), responsive desktop/mobile, sáng/tối/tự động. Lộ trình, triển khai và nghiệm thu theo bằng chứng.

**Xem dashboard:** https://luan20495.github.io/phase33-dashboard/

- `index.html`: một trang, tự chứa (không CDN/font ngoài).
- `status.json`: dữ liệu (đọc cùng thư mục). Tác vụ đồng bộ hằng giờ sửa file này.
- `tests/process-ui.mjs`: kiểm tra tab Quy trình & cấu hình. `tests/shell-ui.mjs`: kiểm tra khung 6 tab, định tuyến, bàn phím, thẻ Owner, a11y. `tests/hourly-ui.mjs` (+ `tests/fixtures/hourly.json`): kiểm tra tab Việc chạy mỗi giờ. `tests/limits-ui.mjs` (+ `tests/fixtures/limits.json`, 14 hàng có đủ trường mới): kiểm tra tab Giới hạn AI Studio, gồm bố cục di động 390 px và axe.

## Cấu trúc 6 tab

| Tab | Hash | Nội dung |
|---|---|---|
| Lộ trình | `#roadmap` (= `#roadmap/1`), `#roadmap/1` … `#roadmap/6` | 6 tab con Đợt 1–6. Mỗi đợt: mục tiêu, ngày dự kiến, thanh tiến độ (chỉ đếm số mục đã hoàn tất) và danh sách mục CHƯA xong. Mục hoàn tất rời khỏi đây, sang tab Đã lên PROD. Cuối trang: "Ngoài lộ trình" (audit đã xong, việc tạm gác). |
| Quy trình & cấu hình | `#process` | Quy tắc đã chỉ đạo, sửa và gửi cho Claude (giữ nguyên hành vi). |
| Giới hạn AI Studio | `#limits` | Đặt NGAY SAU "Quy trình & cấu hình". Toàn bộ 69 giới hạn (`status.json` > `aiLimits`: `ownerAsk`, `risks`, `items` L01..L69, `history`) để Owner quyết một lần. Đầu trang: yêu cầu của Owner, 5 rủi ro, số lượng theo trạng thái, loại, khuyến nghị và bắt buộc, chú giải 4 trạng thái. Mỗi hàng gọn gồm mã, tên, **PROD** (giá trị gần nhất đã biết), **DEV = mặc định trong mã** (không phải giá trị đọc từ stack DEV đang chạy; `UNKNOWN` hiện "chưa rõ", thiếu trường hiện "—"), chip ảnh hưởng người dùng (Cao/Trung bình/Thấp), chip rủi ro, chip khuyến nghị, chip trạng thái và bộ chỉ báo 4 bước; "Chi tiết" xem là gì, nằm ở đâu, cách bỏ, rủi ro, ghi chú ảnh hưởng/rủi ro/trạng thái, công sức và có cần bản phát hành. Chip luôn có chữ + ký hiệu, không chỉ dựa vào màu. **Trạng thái**: Đề xuất → Đã duyệt → Đã áp dụng (C0 áp dụng, mới ở mức BÁO CÁO/REPORTED) → Đã kiểm chứng (kiểm chứng độc lập); lựa chọn Owner vừa bấm chỉ là "chờ gửi" (chưa phải duyệt) cho tới khi dán tin nhắn lên #88. Bộ lọc: tìm chữ không phân biệt dấu, nhóm (chip, 10 nhóm), loại, khuyến nghị, trạng thái, bắt buộc/không bắt buộc, chỉ hàng chưa chọn; trên điện thoại bộ lọc nằm trong ngăn thu gọn (ô tìm luôn hiện). Mỗi hàng chọn một trong: Giữ nguyên, Bỏ giới hạn (tắt), Đặt giá trị… (kèm đơn vị), Theo khuyến nghị, cộng ghi chú tùy chọn. Hàng `mandatory: true` (tiền và an toàn) hoặc bị nhận diện là giới hạn tiền (`unit: money`, tên có tiền / chi phí / ngân sách trừ "ngân sách ngữ cảnh", lưới an toàn) bị KHÓA: biểu tượng khóa + "Bắt buộc giữ: <lý do>", không có Bỏ giới hạn/Đặt giá trị và mọi thao tác hàng loạt bỏ qua. **Duyệt hàng loạt**: tick từng hàng, "Chọn tất cả đang lọc", chọn nhanh (hàng chưa chọn, hàng lượt/token tắt được), rồi "Theo khuyến nghị" / "Giữ nguyên" / "Bỏ giới hạn" (chỉ hàng `offPossible: true`, không bắt buộc) trên thanh dính cuối màn hình; hộp xác nhận nêu số hàng sẽ đưa vào "chờ gửi", số hàng bỏ qua và lý do, số lựa chọn bị ghi đè. Lựa chọn lưu nháp trong trình duyệt (`xw-al:`, có bộ nhớ tạm khi localStorage lỗi), hoàn tác từng hàng hoặc tất cả, rồi sao chép tin nhắn `## [OWNER] ...: chọn giới hạn AI Studio` (mỗi dòng `- L01: BỎ`, `- L01: GIỮ`, `- L01: GIÁ TRỊ <giá trị> <đơn vị>`, `- L01: KHUYẾN NGHỊ`, ghi chú nối ` // <ghi chú>`) để dán lên #88. Trang tĩnh không ghi được: C0 áp dụng cài đặt đổi nóng ở lần chạy kế tiếp; mục cần mã/bản phát hành thành PR và chờ QA độc lập rồi mới lên PROD. Trường mỗi hàng ngoài bộ cũ: `group`, `dev`, `prod`, `impact`/`impactNote`, `risk`/`riskNote`, `mandatory`/`mandatoryReason`, `state` (`proposed|approved|applied|verified`)/`stateNote`; thiếu thì giao diện vẫn hiển thị ("—"/"chưa rõ", trạng thái suy ra từ `applied` hoặc mặc định Đề xuất). Trên điện thoại (390 px) hàng là thẻ, mục chạm >= 44 px, thanh tab là một hàng cuộn ngang. |
| Việc chạy mỗi giờ | `#hourly` | Danh sách việc C0 chạy mỗi giờ (`status.json` > `hourly`): mỗi việc có công tắc BẬT/TẮT, kết quả và 10 lần chạy gần nhất. Trang tĩnh không ghi được file: thay đổi của Owner (đổi công tắc, thêm, xóa) được lưu nháp trong trình duyệt (`xw-hr:`), hiện "chờ gửi", hoàn tác được, rồi sao chép tin nhắn `## [OWNER] ...: cập nhật việc chạy hằng giờ` (dòng `- H3: TẮT`, `- H5: BẬT`, `- THÊM: <tên> \| <mô tả>`, `- XÓA: H7`) để dán lên #88; C0 áp dụng vào `status.json` ở lần chạy kế tiếp. |
| Đã lên PROD | `#prod/on` (mặc định), `#prod/done` | **Hoàn tất**: chỉ mục có `closed: true` (QA/SEC độc lập + đã kiểm trên PROD + Owner chấp nhận). **Đã bật, chưa hoàn tất**: nhóm 19 hạng mục nền tảng (tiến độ, bộ lọc, ngăn chi tiết) và việc giao có `group: ON_PROD` chưa đóng. ON không phải DONE. |
| Chờ anh quyết | `#owner` | Thẻ quyết định/thao tác của Owner (chọn phương án, ghi chú, sao chép nội dung `## [OWNER] HH:MM ICT DD/MM: duyệt từ dashboard`). Chấm đỏ + số khi có việc chờ. |

Hash cũ vẫn dùng được và được chuyển hướng: `#phase33` → `#prod/on`, `#remaining` và `#today` → `#roadmap/1`.
Thứ tự tab chính: Lộ trình, Quy trình & cấu hình, Giới hạn AI Studio, Việc chạy mỗi giờ, Đã lên PROD, Chờ anh quyết. Bàn phím: mũi tên trái/phải, Home, End trên cả tab chính lẫn tab con.

## Trường tùy chọn trong `status.json` (tương thích ngược; thiếu thì tự suy luận)

- `dailyWork.items[].batch`: số `1..6` hoặc mảng (vd `[3,5]`). `[]` = không thuộc đợt nào. Thiếu: `D1.x`..`D6` theo mã; `IN_PROGRESS`/`PLANNED`/`DEV_WAIT`/`WAIT_OWNER` mặc định vào Đợt 2; `AUDIT_DONE`/`PARKED` vào "Ngoài lộ trình"; `ON_PROD` không vào đợt nào.
- `dailyWork.items[].closed`: `true` chỉ khi đã có QA/SEC độc lập + kiểm trên PROD + Owner chấp nhận. Thiếu = chưa đóng. `closedAt` (ISO, tùy chọn) hiển thị giờ hoàn tất. Hiện chỉ `T35` là `true` (Owner chấp nhận 13:36 ICT 11/11).
- `dailyWork.items[].steps`: mảng `{label, labelEn?, state, note?}` với `state` là `done | doing | todo | blocked` (giá trị khác coi như `todo`). Thẻ việc hiển thị bước tuần tự (danh sách có thứ tự, mỗi bước có aria-label dạng "Bước 3/8: ..., đang làm"), thanh `x/y bước` = số bước `done` / tổng, và dòng "Đang ở bước: ..." (các bước `doing`; nếu không có thì bước `blocked`, rồi bước `todo` đầu tiên). Không có `steps` thì không vẽ gì (mục `PLANNED` hiện "Chưa bắt đầu"); không có phần trăm tự suy ra. Thanh tiến độ của đợt thêm dòng "Bước đã xong x/y" cộng từ các mục có `steps`. Hiện có cho D1.2, D1.3, D1.4, D1.6, D1.7, D1.8, D1.10; T-items chưa có.
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
node tests/hourly-ui.mjs
node tests/limits-ui.mjs
```
Các bộ test tự mở web server tạm trên 127.0.0.1 và không ghi vào `status.json`.
