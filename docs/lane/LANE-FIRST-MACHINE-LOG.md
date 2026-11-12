# Nhật ký dựng làn build/test trên máy phụ đầu tiên

> Tên tệp giữ theo yêu cầu của Owner. Nội dung dùng từ chung ("máy phụ", "máy chính", "hub"), không ghi tên máy, tài khoản hay địa chỉ.
> Ghi lúc 2026-11-13 00:05 ICT. Nguồn: các comment trên issue điều phối của hub (đọc bằng `gh`), thư mục bàn giao của máy chính, và chính lần chạy thử script slot trên máy chính.
> **Trạng thái làn: CHƯA SẴN SÀNG, CHƯA XÁC MINH.** Thẻ cài đặt (thẻ 2) đang chạy trên máy phụ; tại thời điểm ghi chưa có comment kết quả. Mọi mục chưa có đầu ra thật đều ghi `NOT_RUN`.

Nhãn dùng trong file: **MEASURED** = đo/đọc được từ đầu ra hoặc comment có nguồn; **ESTIMATE** = suy luận hoặc con số cần đo lại; **NOT_RUN** = chưa chạy; **PASS/FAIL** chỉ khi có lệnh, mã thoát và đầu ra thật.

## 1. Cấu hình máy phụ đầu tiên (MEASURED, thẻ đo 1, 23:35 ICT, login shell)

| Mục | Giá trị |
|---|---|
| CPU / RAM / đĩa | Apple silicon 8 lõi (`hw.ncpu` 8), RAM 16 GiB (`hw.memsize` 17179869184), SSD 228 GB |
| Đĩa trống | 88 GiB lúc 23:32 ICT (báo cáo 20:45 cùng ngày: 101 GiB, tức giảm khoảng 13 GiB trong 3 giờ) |
| Tải | 1,70 lúc 23:32; 1,36 / 3,65 / 6,15 lúc 23:34 (máy lên được 1 giờ 01 phút). Ngay sau lần khởi động lại 22:33, tải sau đăng nhập lên 41-56 trong vài phút |
| Node | 24.22.1 (formula `node@24`); máy chính dùng Node 22.23.1 (lệch phiên bản: ghi trong mọi kết quả) |
| JDK | `openjdk@21` 21.0.13.0.3 và `openjdk@17` 17.0.21.0.3. `java_home -V` báo "Unable to locate a Java Runtime" vì JDK Homebrew chưa liên kết vào thư mục hệ thống: phải đặt `JAVA_HOME` tường minh |
| Docker | Docker Desktop 4.97.0 đã cài (cask), **chưa chạy**; có `/usr/local/bin/docker`; không có Colima/Lima/Podman/OrbStack |
| Trình duyệt | Google Chrome có trong `/Applications`; không có cache Playwright |
| Git | `git ls-remote` tới 2 repo riêng (BE, FE) trả đúng SHA ghim; `gh` đã đăng nhập (scope: gist, read:org, repo, workflow) |
| Cache Gradle sẵn có | `~/.gradle`: `caches` 2,8 GB, `wrapper` 810 MB, toàn bộ là phụ thuộc Android của một dự án khác. **Không phải cache XWeb, không dùng lại** |
| Tiến trình lớn | giả lập Android (khoảng 2,5 GB RSS, của dự án khác của Owner, làm đến 39 phút trước lúc đo), 2 phiên `claude` (khoảng 0,4-0,5 GB mỗi phiên), một tiến trình `node` của hub (khoảng 0,48 GB), một `java` 17 (khoảng 0,2 GB) |
| Hub trên máy | 6 dịch vụ launchd chạy (listener, 2 tunnel, dispatcher, mcp, control-center); dispatcher `idle` |

Bài học quan trọng nhất của bước đo: **phiên SSH không đăng nhập không có PATH của Homebrew**, nên lần đo đầu của máy chính kết luận nhầm "không có node, JDK 21, docker". Login shell (`zsh -lc`) cho kết quả đúng. Mọi lệnh đo/cài trên máy phụ phải chạy qua login shell.

## 2. Dòng thời gian (ICT, ngày 12/11/2026)

| Giờ | Sự kiện | Nhãn |
|---|---|---|
| 22:33:32 | Máy phụ khởi động lại có kế hoạch (`authrestart`). Mạng và SSH lên lại sau khoảng 1 phút 32 giây; 6 dịch vụ hub chỉ lên lúc 22:40:50, sau khi người dùng đăng nhập (FileVault bật, không tự đăng nhập): hub ngừng khoảng 7 phút 39 giây | MEASURED (đo từ ngoài và từ trong) |
| 22:49-23:30 | Hai lần thử chia việc test FE qua engine của hub: engine báo `FAILED`. Gate `unit-tests` chạy cả bộ `test:unit` trong sandbox của gate và hỏng ở một test quản lý tiến trình; ngoài sandbox cả bộ đạt. Ba lần sửa vô ích tốn hơn 400 nghìn token. Kết luận: **việc build/test không đi qua engine** | MEASURED |
| 23:22 | Chẩn đoán ngoài engine trên máy phụ, Node 24, bản FE ghim: `test:unit` thoát 0, 6070 test, 6062 đạt, 0 lỗi, 8 bỏ qua, khoảng 79 giây. Thêm 1 file test mới: 6076 test, 6068 đạt, khoảng 77 giây. Test quản lý tiến trình riêng: đạt, khoảng 13 giây | MEASURED (chạy chẩn đoán, không phải nghiệm thu) |
| khoảng 23:30 | Owner quyết: QA của XWeb được chạy trên máy phụ; SSH chỉ-đọc từ máy chính được phép | MEASURED (Owner relay) |
| 23:31 | Máy chính đo chỉ-đọc qua SSH (RAM, đĩa, tải, tiến trình) | MEASURED |
| 23:34 | Đăng thẻ 1 (đo và báo, chỉ đọc) | MEASURED |
| 23:35 | Máy phụ trả lời thẻ 1: bảng ở mục 1. Hai điều chưa đo được: phần trăm RAM trống (lệnh `memory_pressure` bị cắt bằng `head` nên mất dòng cần) và việc Docker daemon có chạy được không | MEASURED |
| 23:36-23:37 | Đăng thẻ 2 (cài đặt, không sudo): thư mục `xweb-lane`, script slot (có sha256 để đối chiếu), clone 2 repo ghim SHA, nạp cache Gradle online rồi offline, smoke BE không Docker, FE `npm ci` + guard + typecheck, báo cáo, hoàn nguyên | MEASURED |
| 23:38 | Máy chính thấy (SSH chỉ-đọc) thư mục `xweb-lane` đã được tạo | MEASURED |
| 23:43 | Máy chính thấy `locks` và `results` đã có mục (một việc đang giữ chỗ). Đăng bổ sung thẻ 2: (1) nếu smoke offline thiếu artifact test thì chạy một lần có mạng (`seed-online`) rồi offline lại làm bằng chứng; (2) mọi lệnh Gradle thêm `--max-workers=1`; script từ chối (rc 75) thì báo, không chờ vòng lặp | MEASURED |
| 23:5x | Chạy thử script slot đã tổng quát hóa trên **máy chính** với việc giả (không Gradle thật): xem mục 4 | MEASURED (máy chính) |

## 3. Tiến độ thẻ 2 trên máy phụ (tính đến 00:05 ICT ngày 13/11)

Chưa có comment kết quả của máy phụ. Bảng dưới là trạng thái trung thực; máy phụ tự cập nhật ở mục 6.

| Bước thẻ 2 | Trạng thái | Ghi chú |
|---|---|---|
| 0 Kiểm trước (chỉ đọc) | NOT_RUN (chưa có báo cáo) | |
| 1 Thư mục + script, đối chiếu sha256 | thư mục đã tạo lúc 23:38 (MEASURED qua SSH chỉ-đọc); sha256 script: NOT_RUN | |
| 2 Clone 2 repo ghim SHA | NOT_RUN | |
| 3 Nạp cache Gradle có mạng, rồi offline | NOT_RUN | một việc đang giữ chỗ lúc 23:43 nhưng chưa biết là bước nào |
| 4 Smoke BE không Docker | NOT_RUN | |
| 5 FE `npm ci`, `guard:static`, `guard:test`, `typecheck` | NOT_RUN | |
| 6 Báo cáo, kéo `results` bằng SSH chỉ-đọc, đối chiếu sha256 | NOT_RUN | |
| Hub không bị đổi (`launchctl` trước/sau), `locks` rỗng sau cùng | NOT_RUN | |

## 4. Script slot: kết quả chạy thử trên máy chính (không phải trên máy phụ)

Script tổng quát hóa `gradle-slot-lane.sh` (logic giữ nguyên, chỉ bỏ tên riêng và thêm chú thích) chạy với việc giả `env GRADLE=1 ...`, thư mục lane tạm, lúc 23:5x ICT trên máy chính (tải máy chính lúc đó khoảng 17):

| Ca | Lệnh giả | Kết quả | Nhãn |
|---|---|---|---|
| Từ chối vì tải | `LANE_MAX_LOAD=0.01` | rc 75, "REFUSED: load1=... > 0.01", không có thư mục kết quả mới | MEASURED (máy chính) |
| Chạy bình thường | `echo hi` | rc 0; thư mục kết quả có `job.log`, `meta.txt`, `SHA256SUMS` | MEASURED (máy chính) |
| Quá hạn | `JOB_TIMEOUT=2`, `sleep 31` | rc 124, ghi "TIMED OUT", không còn tiến trình `sleep 31` sau đó | MEASURED (máy chính) |
| Slot bận | việc thứ hai khi việc đầu còn chạy | rc 75, "slot busy" | MEASURED (máy chính) |
| Cờ STOP | `touch STOP` | rc 75, "STOP file present" | MEASURED (máy chính) |
| Nhãn sai / thiếu lệnh | nhãn có dấu cách; không tham số | rc 2 / rc 1 | MEASURED (máy chính) |
| Việc Gradle thật qua script | | **NOT_RUN** (cả máy chính lẫn máy phụ) | NOT_RUN |
| Chạy trên máy phụ | | **NOT_RUN** (chờ thẻ 2) | NOT_RUN |

Phát hiện khi đọc script (MEASURED bằng đọc mã): việc được xếp "nặng" hay "nhẹ" theo **chữ trong dòng lệnh** (và nội dung các tham số là tệp), không theo nhãn. Từ khóa nặng: gradle, testcontainers, docker, colima, bootRun, playwright, chrome, harness-server, gate:frontend, tsc, mutant, test:unit, browser. Hệ quả: `npm ci` và `npm run typecheck` rơi vào nhánh **nhẹ** (không qua chốt tải/RAM/đĩa, dùng slot nhẹ) dù `typecheck` là tsc của cả repo. Cách vượt: thêm một từ khóa vào lệnh, ví dụ `env TSC=1 npm run typecheck`. Đề xuất sửa script (chưa làm, cần review): thêm biến `LANE_KIND=heavy|light` ghi đè.

## 5. Bài học đến thời điểm này

1. **PATH của phiên SSH không đăng nhập thiếu Homebrew**: mọi phép đo/cài trên máy phụ chạy qua `zsh -lc`. Một phép đo sai từng làm kết luận "thiếu JDK 21 và Docker".
2. **JDK Homebrew không liên kết vào hệ thống**: luôn đặt `JAVA_HOME` tường minh cho từng lệnh; không cần quyền sudo để liên kết.
3. **Việc đo/test không đi qua engine của hub**: engine coi việc không có thay đổi là FAIL, gate chạy trong sandbox không mạng và hỏng ở test quản lý tiến trình. Việc lane là lệnh trực tiếp, báo bằng comment.
4. **Ba lần sửa tự động vô ích tốn hơn 400 nghìn token**: đặt tối đa 1 lần sửa, thất bại thì dừng và báo.
5. **Cache Gradle sẵn có trên máy phụ thuộc dự án khác (Android)**: thẻ 2 vẫn dùng `~/.gradle` chung. Rủi ro tranh khóa nếu dự án Android chạy Gradle cùng lúc; phương án đã nêu: chuyển sang `GRADLE_USER_HOME` riêng ở thẻ sau. Runbook khuyên dùng thư mục riêng ngay từ đầu.
6. **`memory_pressure | head` cắt mất dòng phần trăm trống**: dùng `memory_pressure | grep -i 'free percentage'` hoặc `vm_stat`.
7. **Comment không tự thành việc**: việc do Owner giao; thẻ có phạm vi, mốc ghim SHA, tiêu chí chấp nhận; "không làm gì ngoài thẻ".
8. **Hai máy và Owner dùng chung một tài khoản GitHub**: tiền tố `[TÊN]` trong comment chỉ là tự khai; con số quyết định nên có người/máy khác chạy lại hoặc đọc trực tiếp.
9. **Khởi động lại**: SSH tự lên sau khoảng 1,5 phút, dịch vụ của hub chỉ lên sau khi có người đăng nhập (khoảng 7 phút 39 giây ngừng); mất điện thì dừng ở màn hình mở khóa FileVault. Làn thiết kế để không tự chạy sau khi khởi động.
10. **Nonce rỗng trong lần thử vòng comment đầu**: biến shell không được nội suy khi dựng comment. Luôn in nonce vào log trước khi đăng.

## 6. Do máy phụ tự ghi

> Máy phụ (agent chạy trên máy đó) bổ sung bên dưới. Quy tắc: chỉ ghi số có lệnh, mã thoát và đầu ra thật; giờ theo ICT; ghi SHA, `node -v`, `java -version`; không dán token, khóa, địa chỉ, tên tài khoản; chưa chạy thì ghi `NOT_RUN`. Không sửa các mục 1-5; thêm mục mới theo mẫu.

### 6.1 Bảng thời gian (điền khi chạy)

| Việc (nhãn slot) | Bắt đầu ICT | Thời gian chạy (giây) | rc | Test chạy/đạt/lỗi/bỏ qua | RSS lớn nhất của một tiến trình | RAM trống thấp nhất (MB) | Tải 1 phút cao nhất | Đĩa trống sau | sha256 của SHA256SUMS |
|---|---|---|---|---|---|---|---|---|---|
| be-seed | | | | | | | | | |
| be-offline | | | | | | | | | |
| be-smoke-unit | | | | | | | | | |
| fe-ci | | | | | | | | | |
| fe-guards | | | | | | | | | |
| fe-guard-tests | | | | | | | | | |
| fe-tsc | | | | | | | | | |

### 6.2 Câu hỏi đã được trả lời hay chưa

| Câu hỏi | Kết quả | Nhãn |
|---|---|---|
| Lần nạp Gradle đầu: thời gian, dung lượng cache, số dòng `Download` | | NOT_RUN |
| Offline proof: BUILD SUCCESSFUL, 0 dòng `Download` | | NOT_RUN |
| Có gặp `LockOutOfDate` kotlin-reflect không | | NOT_RUN |
| Kotlin daemon có hết bộ nhớ ở lần biên dịch đầu không | | NOT_RUN |
| Kotlin daemon của làn còn sống sau `--stop` không | | NOT_RUN |
| Tải cao nhất khi chạy việc nặng; chốt có từ chối lần nào | | NOT_RUN |
| `launchctl list` của hub không đổi trước/sau | | NOT_RUN |
| Máy chính kéo `results` bằng SSH chỉ-đọc, `shasum -c` khớp | | NOT_RUN |
| Docker Desktop khởi động và đặt giới hạn (việc của Owner) | | NOT_RUN |
| Một lớp test BE dùng Testcontainers chạy đạt | | NOT_RUN |
| Chrome cho spec trình duyệt FE | | NOT_RUN |

### 6.3 Ghi chú tự do của máy phụ

(trống)
