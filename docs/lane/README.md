# Làn build/test trên máy phụ: mục lục

Tài liệu để thêm một máy mới làm làn build/test XWeb và dùng được ngay khi làm theo. Cập nhật 2026-11-13 00:05 ICT.

**Trạng thái trung thực:** máy phụ đầu tiên **đang dựng** (thẻ cài đặt thứ hai đang chạy). Làn **chưa sẵn sàng và chưa được xác minh**. Mọi bước nặng (nạp cache Gradle, chứng minh offline, smoke FE/BE, kéo kết quả bằng SSH chỉ-đọc) hiện là `NOT_RUN` trên máy phụ. Số liệu nào có nhãn `MEASURED` là số đo thật, `ESTIMATE` là ước lượng.

| Tệp | Nội dung |
|---|---|
| [RUNBOOK-NEW-MACHINE.md](RUNBOOK-NEW-MACHINE.md) | Runbook đầy đủ: vai trò máy chính/máy phụ, điều kiện tiên quyết, việc chỉ-Owner, kênh và mẫu thẻ việc, bố cục thư mục, toolchain, script slot và ngưỡng chốt, nạp Gradle online rồi offline, FE, kéo kết quả, tải/RAM/đĩa, khởi động lại, cô lập, hoàn nguyên, xử lý sự cố, checklist nghiệm thu PASS/FAIL |
| [gradle-slot-lane.sh](gradle-slot-lane.sh) | Script slot tổng quát hóa (một việc nặng một lúc, chốt tải/RAM/đĩa/STOP, hết hạn, bản ghi kết quả có sha256) |
| [OXY-FIRST-MACHINE-LOG.md](OXY-FIRST-MACHINE-LOG.md) | Nhật ký máy phụ đầu tiên: giờ ICT, số đo, bài học, phần NOT_RUN, và mục "Do máy phụ tự ghi" để agent máy phụ bổ sung |

Tên tệp nhật ký giữ nguyên theo yêu cầu của Owner; nội dung không ghi tên máy hay tài khoản.

sha256 của `gradle-slot-lane.sh` (để đối chiếu sau khi chép): `d0cf7cb91a2f0415bcb70439e1ecc765a68611adeb8d6438dc7e3d1c6fe03fbc`. Script này giữ nguyên logic của bản đã gửi cho máy phụ đầu tiên, chỉ bỏ tên riêng, thêm chú thích và đổi vài chuỗi thông báo, nên sha256 khác bản đó.

Quy tắc của thư mục này (kho công khai): không địa chỉ IP, tên máy, khóa host, tên tài khoản, e-mail, token hoặc khóa, tên máy chủ/dự án/công ty, số tiền, tên tunnel hay tên miền. Dùng chỗ giữ chỗ như `<lane-user>`, `<lane-host>`.
