# Làn build/test trên máy phụ: mục lục

Tài liệu để thêm một máy mới làm làn build/test XWeb và dùng được ngay khi làm theo. Cập nhật 2026-11-13 00:40 ICT.

**Trạng thái trung thực (13/11/2026 00:40 ICT): ĐANG KIỂM CHỨNG, chưa tuyên bố "sẵn sàng".** Máy phụ đầu tiên đã chạy xong thẻ cài đặt và thẻ 3 phần A+B: nạp Gradle có mạng rồi chứng minh offline, smoke BE 3/3 test, FE `npm ci`, `guard:static`, `guard:test`, `typecheck` đều PASS, kết quả được kéo về bằng SSH chỉ-đọc và đối chiếu sha256 (MEASURED). Checklist nghiệm thu: 12 PASS, 0 FAIL, 10 NOT_RUN trong 22 dòng bắt buộc. Chưa có: việc QA thật đầu tiên (thẻ 4 vừa đăng), `test:unit` đầy đủ qua script, Docker/Testcontainers, spec trình duyệt, quyết định cô lập của Owner. Nhãn: `MEASURED` là số đo thật, `ESTIMATE` là ước lượng.

| Tệp | Nội dung |
|---|---|
| [RUNBOOK-NEW-MACHINE.md](RUNBOOK-NEW-MACHINE.md) | Runbook đầy đủ: vai trò máy chính/máy phụ, điều kiện tiên quyết, việc chỉ-Owner, kênh và mẫu thẻ việc, bố cục thư mục, toolchain, script slot và ngưỡng chốt, nạp Gradle online rồi offline, FE, kéo kết quả, tải/RAM/đĩa, khởi động lại, cô lập, hoàn nguyên, xử lý sự cố, checklist nghiệm thu PASS/FAIL |
| [gradle-slot-lane.sh](gradle-slot-lane.sh) | Script slot tổng quát hóa (một việc nặng một lúc, chốt tải/RAM/đĩa/STOP, hết hạn, bản ghi kết quả có sha256) |
| [LANE-FIRST-MACHINE-LOG.md](LANE-FIRST-MACHINE-LOG.md) | Nhật ký máy phụ đầu tiên: giờ ICT, số đo, bài học, phần NOT_RUN, và mục "Do máy phụ tự ghi" để agent máy phụ bổ sung |

sha256 của `gradle-slot-lane.sh` (để đối chiếu sau khi chép): `d0cf7cb91a2f0415bcb70439e1ecc765a68611adeb8d6438dc7e3d1c6fe03fbc`. Script này giữ nguyên logic của bản đã chạy trên máy phụ đầu tiên (9 việc thật, rc 0/1/75 đúng như thiết kế), chỉ bỏ tên riêng, thêm chú thích và đổi vài chuỗi thông báo, nên sha256 khác bản đó. Lưu ý: việc nặng/nhẹ được quyết theo chữ trong lệnh; dùng tiền tố `env LANE_HEAVY=gradle <lệnh>` cho mọi lệnh nặng (xem runbook mục 7).

Quy tắc của thư mục này (kho công khai): không địa chỉ IP, tên máy, khóa host, tên tài khoản, e-mail, token hoặc khóa, tên máy chủ/dự án/công ty, số tiền, tên tunnel hay tên miền. Dùng chỗ giữ chỗ như `<lane-user>`, `<lane-host>`.
