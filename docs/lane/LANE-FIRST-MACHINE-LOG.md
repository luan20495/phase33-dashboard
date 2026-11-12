# Nhật ký dựng làn build/test trên máy phụ đầu tiên

> Nội dung dùng từ chung ("máy phụ", "máy chính", "hub"), không ghi tên máy, tài khoản hay địa chỉ.
> Cập nhật 2026-11-13 00:40 ICT. Nguồn: các comment trên issue điều phối của hub (đọc bằng `gh`: báo cáo thẻ 2, báo cáo thẻ 3 phần A+B, runbook của máy phụ, thẻ 4), 9 thư mục kết quả đã kéo về máy chính bằng SSH chỉ-đọc (`job.log`, `meta.txt`, `SHA256SUMS`), và lần chạy thử script slot trên máy chính.
> **Trạng thái làn: ĐANG KIỂM CHỨNG (IN_VERIFICATION). CHƯA tuyên bố "sẵn sàng".** Thẻ 2 và thẻ 3 (phần A+B) của máy phụ đã xong với kết quả thật (mục 3); việc QA thật đầu tiên (thẻ 4) mới được đăng và chưa có kết quả. Docker/Testcontainers và spec trình duyệt vẫn `NOT_RUN`.

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

## 2. Dòng thời gian (ICT; 22:33-23:5x là ngày 12/11/2026, từ 00:00 là ngày 13/11)

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
| 23:38 (ngày 12/11) | Thẻ 2 bước 0: tải 3,37, đĩa 88 GiB, `~/xweb-lane` chưa có, 6 dịch vụ hub chạy: PASS | MEASURED |
| 23:43:11-00:06:55 | `be-seed` có mạng (`compileKotlin compileTestKotlin`, Kotlin daemon 3g, chưa có `--max-workers=1` vì việc chạy trước khi đọc bổ sung): `BUILD SUCCESSFUL in 23m 38s`, rc 0; không lấy mẫu tải | MEASURED |
| 13/11 00:07:33-00:08:22 | `be-offline` (`--offline --max-workers=1`): rc 0, 49 giây | MEASURED |
| 00:08:22-00:08:54 | Smoke BE `--offline`: **FAIL** rc 1 sau 32 giây, đúng như thẻ dự báo: cache chỉ do biên dịch nên thiếu phụ thuộc test (`org.postgresql:postgresql`, `org.checkerframework:checker-qual`), biên dịch UP-TO-DATE, chưa có test nào chạy | MEASURED |
| 00:08:54 | `seed-online` bị chốt tải **từ chối** (rc 75): `load1=5.42 > 4.0`, ngay sau hai việc Gradle liên tiếp. Máy phụ dừng đúng luật thẻ ("không chờ vòng lặp"), báo và hỏi | MEASURED |
| 00:09 | Báo cáo thẻ 2: bước 0-3b PASS, bước 4 FAIL, 4' REFUSED, bước 5 NOT_RUN; launchd không đổi, `locks` rỗng | MEASURED |
| 00:14:05-00:15:34 | Sau nghỉ khoảng 3 phút theo thẻ 3: `seed-online` (một lệnh `test` có mạng): `BUILD SUCCESSFUL in 1m 28s`, guard load 1,30 / RAM khả dụng 8497 MB, tải cao nhất 3,15 | MEASURED |
| 00:18:34-00:19:05 | `be-smoke-unit-offline` (`--offline`): `BUILD SUCCESSFUL in 30s`, **3 test, 0 lỗi, 0 bỏ qua (đọc từ XML)**, tải cao nhất 2,07 | MEASURED |
| 00:21:06-00:22:20 | FE `npm ci --ignore-scripts` (Node 24.22.1): 74 giây, rc 0, 0 lỗ hổng, **tải cao nhất 9,87** (tải đỉnh cả phiên 10,35 lúc 00:23:06, sau khi việc xong) | MEASURED |
| 00:25:20-00:25:47 | FE `guard:static` 14 giây: 9 đạt / 7 bỏ qua / 0 lỗi; `guard:test` 13 giây: 278 test, 168 đạt, 0 lỗi, 110 bỏ qua. Cả hai rơi vào slot **nhẹ** (cột `guard=` của `meta.txt` trống) | MEASURED |
| 00:25:47-00:28:36 | FE `typecheck` (`tsc --noEmit`): rc 0, 2 phút 49 giây, tải cao nhất 2,96 | MEASURED |
| 00:29 | Báo cáo thẻ 3 phần A+B: 6/6 việc PASS, không việc nào bị từ chối; đĩa 87 -> 86 GiB, `~/.gradle` 4,0 GB, `~/xweb-lane` 948 MB; launchd không đổi; `locks` rỗng | MEASURED |
| 00:30 | Máy chính kéo 9 thư mục kết quả bằng `rsync -rt --max-size=50m` qua SSH chỉ-đọc: 12/12 sha256 của `job.log`/`meta.txt` khớp các comment (máy chính tự kiểm). Máy chính còn chạy lại `shasum -c SHA256SUMS` trong cả 9 thư mục: tất cả OK | MEASURED |
| 00:30 | Máy phụ đăng runbook tự viết (mục 6.3) | MEASURED |
| 00:30 | Đăng thẻ 4: việc QA thật đầu tiên (`fe-unit-full`, guard trên đỉnh dev, smoke BE trên đỉnh dev). Quy tắc mới: tiền tố `env LANE_HEAVY=gradle` cho mọi lệnh nặng; tải 1 phút > 8 liên tục quá 2 phút trong lúc việc chạy thì dừng việc, ghi `ABORTED_LOAD` và báo | MEASURED (nội dung thẻ); kết quả: **NOT_RUN** |

## 3. Kết quả thẻ 2 và thẻ 3 (A+B) trên máy phụ (tính đến 00:40 ICT ngày 13/11)

| Bước | Kết quả | Chi tiết (MEASURED) |
|---|---|---|
| 0 Kiểm trước | PASS | tải 3,37, đĩa 88 GiB, thư mục chưa có, 6 dịch vụ hub chạy |
| 1 Thư mục + script | PASS | sha256 script khớp giá trị trong thẻ (bản gốc v1, 57 dòng; máy phụ đọc toàn văn trước khi chạy) |
| 2 Clone 2 repo ghim SHA | PASS | cả hai ở đúng SHA ghim, detached, `--filter=blob:none`; 128 MB và 216 MB. **Chưa tắt push** (thẻ 2 không có bước này): xem checklist dòng 5 |
| 3a `be-seed` có mạng | PASS | 23 phút 38 giây, rc 0; log chỉ có một dòng tải ("Downloading" bản phân phối Gradle 9.8.0); không `LockOutOfDate`, không "Not enough memory" |
| 3b `be-offline` | PASS | 49 giây, rc 0, 0 dòng `Download` |
| 4 smoke BE `--offline` | **FAIL** (đã dự báo) | thiếu phụ thuộc test trong cache; chưa có test nào chạy |
| 4' `seed-online` | REFUSED rc 75, rồi **PASS** sau nghỉ 3 phút | lần đầu `load1=5.42 > 4.0`; lần sau 1 phút 28 giây |
| 4'' smoke BE `--offline` lần hai | **PASS** | 30 giây, 3 test, 0 lỗi (XML) |
| 5 FE | PASS cả 4 | `npm ci` 74 giây; `guard:static` 9/7/0; `guard:test` 168/110/0; `typecheck` 2 phút 49 giây |
| 6 Báo cáo | PASS | một comment mỗi thẻ; kéo kết quả bằng SSH chỉ-đọc và đối chiếu sha256 do máy chính làm (12/12 khớp) |
| Hub không bị đổi, `locks` rỗng | PASS | `launchctl` (6 dịch vụ, cùng PID) không đổi trước/sau; `locks` rỗng |

Số đo tài nguyên đã có (MEASURED): đĩa 88 -> 87 -> 86 GiB; `~/.gradle` khoảng 3,6 -> 4,0 GB (dùng chung với dự án Android); `~/xweb-lane` 486 MB sau thẻ 2, 948 MB sau thẻ 3; tải cao nhất cả phiên 10,35 (66 mẫu, mỗi 15 giây, **không bao** bước `be-seed` 23 phút 38 giây); RAM khả dụng lúc bắt đầu việc: 6278 MB (lúc tải 2,52), từ 8246 đến 8603 MB ở các việc sau. **Chưa đo:** RSS lớn nhất của từng việc, RAM trống thấp nhất trong lúc việc chạy, Kotlin daemon của làn còn sống sau `--no-daemon` hay không, spec trình duyệt, Docker/Testcontainers, bộ test BE đầy đủ, 7 guard chéo repo, `test:unit` qua script slot (việc 1 của thẻ 4).

## 4. Script slot: chạy thử trên máy chính (việc giả) và quan sát thật trên máy phụ

Script tổng quát hóa `gradle-slot-lane.sh` (logic giữ nguyên, chỉ bỏ tên riêng và thêm chú thích) chạy với việc giả `env GRADLE=1 ...`, thư mục lane tạm, lúc 23:5x ICT trên máy chính (tải máy chính lúc đó khoảng 17):

| Ca | Lệnh giả | Kết quả | Nhãn |
|---|---|---|---|
| Từ chối vì tải | `LANE_MAX_LOAD=0.01` | rc 75, "REFUSED: load1=... > 0.01", không có thư mục kết quả mới | MEASURED (máy chính) |
| Chạy bình thường | `echo hi` | rc 0; thư mục kết quả có `job.log`, `meta.txt`, `SHA256SUMS` | MEASURED (máy chính) |
| Quá hạn | `JOB_TIMEOUT=2`, `sleep 31` | rc 124, ghi "TIMED OUT", không còn tiến trình `sleep 31` sau đó | MEASURED (máy chính) |
| Slot bận | việc thứ hai khi việc đầu còn chạy | rc 75, "slot busy" | MEASURED (máy chính) |
| Cờ STOP | `touch STOP` | rc 75, "STOP file present" | MEASURED (máy chính) |
| Nhãn sai / thiếu lệnh | nhãn có dấu cách; không tham số | rc 2 / rc 1 | MEASURED (máy chính) |
| Việc Gradle/Node thật qua script | | **đã chạy trên máy phụ** (mục 3): 9 việc, các rc xem mục 2 | MEASURED (máy phụ) |
| Từ chối vì tải trên máy phụ | tải thật | rc 75: `load1=5.42 > 4.0 (rc 75, nothing started)` | MEASURED (máy phụ) |
| Ca hết hạn, slot bận, STOP trên máy phụ | | **NOT_RUN** (chỉ chạy việc giả trên máy chính) | NOT_RUN |

Phát hiện khi đọc script, **sau đó được xác nhận thật trên máy phụ** (`guard:static`, `guard:test` có `guard=` trống trong `meta.txt`, tức vào slot nhẹ và bỏ chốt RAM/đĩa): việc được xếp "nặng" hay "nhẹ" theo **chữ trong dòng lệnh** (và nội dung các tham số là tệp), không theo nhãn. Từ khóa nặng: gradle, testcontainers, docker, colima, bootRun, playwright, chrome, harness-server, gate:frontend, tsc, mutant, test:unit, browser. Hệ quả: `npm ci` và `npm run typecheck` rơi vào nhánh **nhẹ** (không qua chốt tải/RAM/đĩa, dùng slot nhẹ) dù `typecheck` là tsc của cả repo. Cách vượt: thêm một từ khóa vào lệnh, ví dụ `env TSC=1 npm run typecheck`. Đề xuất sửa script (chưa làm, cần review): thêm biến `LANE_KIND=heavy|light` ghi đè.

Lưu ý về `LANE_HEAVY`: đây **không phải biến của script**. Quy ước `env LANE_HEAVY=gradle <lệnh>` chỉ hoạt động vì script quét chữ trong dòng lệnh và thấy từ `gradle` (không phân biệt hoa thường); `env TSC=1 <lệnh>` hoạt động theo cùng cách nhờ từ `tsc`. Một biến ghi đè tường minh (`LANE_KIND`) vẫn là đề xuất chưa làm.

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
11. **Nạp cache chỉ bằng biên dịch thì `--offline test` thiếu phụ thuộc test** (MEASURED: `postgresql`, `checker-qual`). Nạp bằng **một lệnh `test` có mạng**, rồi chạy lại `--offline` làm bằng chứng.
12. **Chốt tải chỉ kiểm lúc bắt đầu**: `npm ci` làm tải lên 9,87 (đỉnh phiên 10,35) dù chốt lúc bắt đầu thấy 1,44. Luật mới từ thẻ 4: tải 1 phút > 8 liên tục quá 2 phút trong lúc việc chạy thì dừng việc, ghi `ABORTED_LOAD`.
13. **Chốt từ chối đúng lúc**: ngay sau hai việc Gradle liên tiếp tải 5,42 nên bị từ chối rc 75; nghỉ 3 phút, không vòng lặp chờ, việc sau đó qua.
14. **Phân loại nặng/nhẹ theo chữ**: `npm run guard:*` vào slot nhẹ (bỏ chốt RAM/đĩa). Dùng tiền tố `env LANE_HEAVY=gradle` cho mọi lệnh nặng.
15. **`--console=plain` không in dòng `Download` cho từng artifact**: `seed-online` tải jar postgres mà `grep -c '^Download'` vẫn bằng 0. Bằng chứng offline là BUILD SUCCESSFUL của lần chạy `--offline`, không phải số dòng `Download`.
16. **Việc đầu tiên chạy thiếu `--max-workers=1`** vì bổ sung của thẻ được đọc sau khi đã bắt đầu: đọc hết bổ sung trước khi bắt đầu việc dài, và lấy mẫu tải từ việc đầu tiên (việc 23 phút 38 giây không có mẫu tải).

## 6. Do máy phụ tự ghi

> Phần này dành cho máy phụ (agent chạy trên máy đó). Quy tắc: chỉ ghi số có lệnh, mã thoát và đầu ra thật; giờ theo ICT; ghi SHA, `node -v`, `java -version`; không dán token, khóa, địa chỉ, tên tài khoản; chưa chạy thì ghi `NOT_RUN`. Không sửa các mục 1-5; thêm mục mới theo mẫu.
> Mục 6.1 và 6.2 do máy chính điền từ báo cáo của máy phụ và `meta.txt`; mục 6.3 là văn bản do chính máy phụ viết.

### 6.1 Bảng thời gian

Tải cao nhất = mẫu 15 giây của máy phụ trong cửa sổ việc (khi máy phụ nêu). `guard` = số liệu chốt lúc bắt đầu (từ `meta.txt`). RSS lớn nhất và RAM trống thấp nhất trong lúc chạy: **NOT_RUN** (chưa đo) cho mọi việc.

| Việc (nhãn slot) | Bắt đầu ICT | Thời gian chạy | rc | Test | Tải cao nhất | guard lúc bắt đầu | Khe | sha256 `job.log`/`meta.txt` khớp |
|---|---|---|---|---|---|---|---|---|
| be-seed | 12/11 23:43:11 | 23 phút 38 giây | 0 | không chạy test (chỉ biên dịch) | không lấy mẫu | load 2,52 / RAM 6278 MB / đĩa 88 GiB | nặng | có |
| be-offline | 13/11 00:07:33 | 49 giây | 0 | không chạy test | 3,55 (cửa sổ chung với việc kế) | load 2,78 / RAM 8598 MB / đĩa 87 GiB | nặng | có |
| be-smoke-unit (offline) | 00:08:22 | 32 giây | 1 (FAIL, thiếu phụ thuộc test) | 0 | 3,55 | load 3,43 / RAM 8603 MB / đĩa 87 GiB | nặng | có |
| (seed-online lần 1) | 00:08:54 | không khởi chạy | 75 (REFUSED) | | | load 5,42 > 4,0 | nặng | không có thư mục kết quả |
| seed-online | 00:14:05 | 1 phút 28 giây | 0 | chạy test có mạng, 3 test | 3,15 | load 1,30 / RAM 8497 MB / đĩa 87 GiB | nặng | có |
| be-smoke-unit-offline | 00:18:34 | 30 giây | 0 | 3 đạt, 0 lỗi, 0 bỏ qua (XML) | 2,07 | load 1,45 / RAM 8481 MB / đĩa 87 GiB | nặng | có |
| fe-ci | 00:21:06 | 74 giây | 0 | không áp dụng (0 lỗ hổng) | **9,87** | load 1,44 / RAM 8457 MB / đĩa 87 GiB | nặng (nhờ tiền tố) | có |
| fe-guards | 00:25:20 | 14 giây | 0 | 9 đạt / 7 bỏ qua / 0 lỗi | không nêu (chốt tải của runner 3,52) | trống | **nhẹ** | có |
| fe-guard-tests | 00:25:34 | 13 giây | 0 | 278 test: 168 đạt / 0 lỗi / 110 bỏ qua | không nêu (chốt tải của runner 3,21) | trống | **nhẹ** | có |
| fe-tsc | 00:25:47 | 2 phút 49 giây | 0 | không áp dụng (không lỗi kiểu) | 2,96 | load 2,87 / RAM 8246 MB / đĩa 86 GiB | nặng (nhờ `TSC=1`) | có |

Tải cao nhất cả phiên (thẻ 3): 10,35 lúc 00:23:06, 66 mẫu. Mọi việc dưới `--no-daemon`; từ `be-offline` trở đi có `--max-workers=1`.

### 6.2 Câu hỏi đã được trả lời hay chưa

| Câu hỏi | Kết quả | Nhãn |
|---|---|---|
| Lần nạp Gradle đầu: thời gian, dung lượng cache, số dòng `Download` | 23 phút 38 giây; `~/.gradle` khoảng 3,6 -> 4,0 GB (cache dùng chung với dự án khác); log chỉ có 1 dòng "Downloading" (bản phân phối Gradle) vì `--console=plain` không in từng artifact | MEASURED |
| Offline proof: BUILD SUCCESSFUL | PASS hai lần (`be-offline` 49 giây; `be-smoke-unit-offline` 30 giây, 3/3 test); lần smoke offline đầu FAIL vì thiếu phụ thuộc test | MEASURED |
| Có gặp `LockOutOfDate` kotlin-reflect không | không (0 lần trong cả 9 log); cờ `-Pkotlin.version` không cần dùng | MEASURED |
| Kotlin daemon hết bộ nhớ ở lần biên dịch đầu không | không ("Not enough memory" 0 lần trong 9 log) với `-Xmx3g`, chưa có `--max-workers=1` ở lần đó | MEASURED |
| Kotlin daemon của làn còn sống sau `--stop` không | chưa kiểm | NOT_RUN |
| Tải cao nhất khi chạy việc nặng; chốt có từ chối lần nào | 10,35 (phiên), 9,87 trong `npm ci`; chốt từ chối đúng 1 lần (5,42 > 4,0) | MEASURED |
| `launchctl list` của hub không đổi trước/sau | không đổi (thẻ 2 và thẻ 3) | MEASURED |
| Máy chính kéo `results` bằng SSH chỉ-đọc, `shasum` khớp | khớp: 12/12 theo máy chính; `shasum -c SHA256SUMS` OK trong cả 9 thư mục | MEASURED |
| Docker Desktop khởi động và đặt giới hạn (việc của Owner) | chưa | NOT_RUN |
| Một lớp test BE dùng Testcontainers chạy đạt | chưa | NOT_RUN |
| Chrome cho spec trình duyệt FE | chưa (Playwright chưa cài) | NOT_RUN |
| `test:unit` đầy đủ qua script slot (thẻ 4 việc 1) | chưa có kết quả | NOT_RUN |
| Offline lần hai từ worktree mới của cùng SHA | chưa | NOT_RUN |

### 6.3 RUNBOOK từ máy phụ (do chính máy phụ viết, 13/11 00:30 ICT)

> Văn bản dưới đây do agent trên máy phụ viết và đăng trên issue điều phối. Chỉ định dạng lại nhẹ; nội dung giữ nguyên.

#### 1. Thứ tự đã làm (lệnh thật sự cần)
1) Đo trước: `uptime`, `df -g /`; dừng nếu tải > 4 hoặc đĩa < 25 GiB. 2) Tạo `~/xweb-lane/{repos,results,locks,tools,logs}`, chép script chỗ, **so SHA-256 rồi đọc toàn văn** trước khi chạy. 3) `git clone --filter=blob:none` hai repo, `checkout --detach <SHA ghim>`. 4) BE: đặt `JAVA_HOME` rồi chạy **một lệnh `test` CÓ mạng** (nạp cả phụ thuộc test), sau đó chạy lại `--offline` làm bằng chứng. 5) FE: `npm ci --ignore-scripts`, `guard:static`, `guard:test`, `typecheck`. 6) Đối chiếu `launchctl`, `locks` rỗng, `SHA256SUMS`.

#### 2. Bất ngờ và cách xử
- PATH phiên SSH không có Homebrew nên tưởng thiếu JDK/Docker; dùng login shell (`zsh -lc`).
- `java_home -V` không thấy JDK Homebrew; đặt `JAVA_HOME` thẳng.
- Nạp cache chỉ bằng `compile` thì `--offline test` thiếu phụ thuộc test (jar postgres); chạy một lần `test` có mạng.
- Chốt tải từ chối (mã 75) ngay sau việc nặng; nghỉ 3 phút, không vòng lặp chờ.
- Script phân loại nhẹ/nặng theo chữ: `npm run guard:*` lọt khe nhẹ (bỏ chốt RAM/đĩa).
- Thêm `--max-workers=1` ngay từ việc đầu; việc đầu chạy trước khi đọc bổ sung nên thiếu.
- Gradle dùng chung `~/.gradle` với dự án Android khác; chưa tách.
- `head` cắt đầu ra (`memory_pressure`) làm mất số liệu; đừng cắt khi đo.

#### 3. Thời lượng và tải đo thực
Nạp BE có mạng (compile) 23 m 38 s (không lấy mẫu tải); biên dịch offline 49 s; test có mạng 1 m 28 s (tải ≤ 3,15); test offline 30 s (≤ 2,07); `npm ci` 74 s (tải **9,87**); `guard:static` 14 s; `guard:test` 13 s; `typecheck` 2 m 49 s (≤ 2,96). Tải cao nhất cả phiên 10,35; đĩa 88 → 86 GiB; `~/.gradle` 4,0 GB, `~/xweb-lane` 949 MB.

#### 4. Chưa làm được / cần Owner
Docker Desktop đã cài nhưng chưa mở, nên chưa chạy test cần container; giả lập Android đang giữ ~2,5 GB RAM; cô lập cache Gradle (`GRADLE_USER_HOME` riêng); Playwright chưa cài; bộ test BE đầy đủ và 7 guard chéo repo chưa chạy.

#### 5. Năm điều sẽ làm khác
1) Đọc hết bổ sung của thẻ trước khi bắt đầu việc dài. 2) Nạp bằng một lệnh `test` có mạng, bỏ bước chỉ biên dịch. 3) Tách `GRADLE_USER_HOME` ngay từ đầu. 4) Phân loại nặng/nhẹ bằng cờ tường minh, không đoán theo chữ. 5) Lấy mẫu tải từ việc đầu tiên và kiểm tải **trong** job, không chỉ lúc bắt đầu.

### 7. Thẻ 4 và thẻ 5: việc QA thật đầu tiên (13/11/2026, cập nhật 01:07 ICT)

Trên đỉnh dev: FE `3a4ba863d0db`, BE `82ff4e732d33`. Kết quả máy chính kéo về bằng rsync chỉ-đọc; `shasum -c SHA256SUMS` OK cả 6 thư mục mới, 12/12 băm khớp comment.

| Việc | Kết quả | Số đo |
|---|---|---|
| `fe-unit-full` (script gốc, thẻ 4) | ABORTED_LOAD, rc 143, KHÔNG phải PASS/FAIL | đỉnh tải 10,63 lúc `node --test` bắt đầu; hủy sau 2 phút tải > 8 |
| `fe-guards-tip` | PASS | 9/7/0, 15 giây, đỉnh tải 3,59 |
| `fe-guard-tests-tip` | PASS | 278 test: 168 pass / 0 fail / 110 skipped, 15 giây |
| `be-smoke-tip` (offline, 4 lớp, không Docker) | PASS | BUILD SUCCESSFUL 5 phút 22 giây, 21 test (đọc từ XML), 0 lỗi, đỉnh tải 4,92 |
| `fe-tsc-build` (thẻ 5) | PASS | 3 phút 16 giây, đỉnh tải 2,45 |
| `fe-unit-full-c3` (thẻ 5, `--test-concurrency=3`, 587 tệp) | PASS | 6108 test / 6100 pass / 0 fail / 0 cancelled / 8 skipped; 4 phút 46 giây; đỉnh tải 4,44; RAM khả dụng thấp nhất 7613 MB |

Hub (launchd) không đổi, `locks` rỗng, không sudo, không sửa repo XWeb. Chưa chạy: lớp BE cần Docker/Testcontainers (Docker do Owner mở), spec trình duyệt, cô lập (quyết định Owner). Kết luận: làn chạy được FE đầy đủ, guard, typecheck và BE lớp thuần dưới tải ≤ 4,5; chưa đủ để gọi là "sẵn sàng" theo checklist mục 16.
