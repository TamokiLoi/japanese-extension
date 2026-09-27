# Rà soát khả năng làm bài phần 読解 — 27/09/2026

## Phạm vi và cách đánh giá

Đã rà **334 câu đọc hiểu của 16 đề đang đăng ký trong ứng dụng**: 14 đề N3 (`bunpou-dokkai`) và 2 đề N1 (`language-reading`). Đối chiếu các nhóm bài đọc với PDF gốc, dữ liệu `src/data/dethi-n3-cac-nam.json` / `src/data/dethi-n1-cac-nam.json`, rồi kiểm tra riêng passage, câu hỏi và lựa chọn mà màn hình làm bài hiển thị. Với N3, việc trích PDF bằng Gemini được dùng để sàng lọc toàn bộ nguồn; các nhóm nghiêm trọng được kiểm lại trên ảnh trang PDF, và hai trường hợp được chụp bằng Playwright trên web local. Hai đề N1 và N3 12/2025 cũng được kiểm theo nhóm bài gốc và các trang nghi vấn.

`Không thấy chặn` dưới đây nghĩa là **chưa phát hiện thiếu dữ kiện làm bài trong lượt rà này**, không phải chứng nhận bản chép hoàn toàn giống PDF. `Thiếu nhưng làm được` vẫn phải bổ sung nội dung để đạt chuẩn toàn văn. `Lộ đáp án` và `bài thi không hợp lệ` phải sửa trước khi coi là đề thi sử dụng được.

| Đề | Tổng câu | Không thấy chặn | Thiếu nhưng làm được | Lộ đáp án | Không đủ dữ kiện | Bài thi không hợp lệ | Chưa chắc |
|---|---:|---:|---:|---:|---:|---:|---:|
| N1 12/2025 | 26 | 21 | 5 | 0 | 0 | 0 | 0 |
| N1 07/2026 | 26 | 19 | 7 | 0 | 0 | 0 | 0 |
| N3 07/2019 | 21 | 21 | 0 | 0 | 0 | 0 | 0 |
| N3 12/2019 | 21 | 14 | 0 | 5 | 2 | 0 | 0 |
| N3 12/2020 | 20 | 14 | 4 | 0 | 0 | 2 | 0 |
| N3 07/2021 | 20 | 16 | 0 | 4 | 0 | 0 | 0 |
| N3 12/2021 | 20 | 18 | 1 | 0 | 1 | 0 | 0 |
| N3 07/2022 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| N3 12/2022 | 20 | 18 | 2 | 0 | 0 | 0 | 0 |
| N3 07/2023 | 20 | 16 | 0 | 0 | 4 | 0 | 0 |
| N3 12/2023 | 20 | 10 | 0 | 0 | 10 | 0 | 0 |
| N3 07/2024 | 20 | 18 | 1 | 0 | 1 | 0 | 0 |
| N3 12/2024 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| N3 07/2025 | 20 | 18 | 1 | 0 | 1 | 0 | 0 |
| N3 12/2025 | 20 | 13 | 7 | 0 | 0 | 0 | 0 |
| N3 07/2026 | 20 | 20 | 0 | 0 | 0 | 0 | 0 |
| **Tổng** | **334** | **276** | **28** | **9** | **19** | **2** | **0** |

## Phải sửa trước khi dùng làm đề thi

| Đề và câu | Nguồn PDF (trang vật lý) | Phát hiện |
|---|---|---|
| N3 12/2019, 19–23 | 7 | Đoạn văn trên màn hình đã điền sẵn từ của cả 5 ô, khiến người làm thấy đáp án trước khi chọn. |
| N3 12/2019, 38–39 | 11–12 | Bảng chương trình, phòng và giảng viên bị thay bằng `[表省略]`; không thể suy ra đáp án từ passage hiện có. |
| N3 12/2020, 37–38 | 11–12 | Tờ thông báo/bảng nguồn bị thay bằng ghi chú diễn giải; còn tiết lộ luôn kết luận một tình huống. Đây không còn là bài thi gốc. |
| N3 07/2021, 19–22 | 7 | Bài điền từ không giữ các ô `(19)`–`(22)`; từ cần chọn đã có sẵn trong passage và câu hỏi. |
| N3 12/2021, 38 | 13–15 | PDF có hai tờ thông báo A/B. App chỉ hiện B, trong khi cần ngày nghỉ của thư viện ở A để xác định ngày đăng ký. |
| N3 07/2023, 19–22 | 8–9 | Mất cả đoạn đầu chứa ô `(19)`; các ô tiếp theo bị đánh số lệch một đơn vị và ô `(22)` biến mất. Vì vậy lựa chọn của câu đang làm không ứng với ô được hiển thị, dù một số từ vẫn có thể đoán theo văn cảnh. |
| N3 12/2023, 23–32 | 18–26 | Cả 10 câu chỉ còn một câu dẫn hoặc trích đoạn ngắn thay cho email, ghi chú, bài báo và các bài nhiều câu chung một văn bản. Ví dụ câu 24 thiếu nội dung nhờ làm salad trong ghi chú; câu 30–32 thiếu toàn bài về chợ sáng. |
| N3 07/2024, 37 | 18–19 | Bảng bốn người/số cửa hàng/số hóa đơn/số tiền đặt dưới câu hỏi trong PDF không có trên màn hình. |
| N3 07/2025, 38 | 22–23 | Lịch sử dụng nhà thi đấu bị thay bằng `（表の内容は省略）`; câu hỏi cần thứ và giờ từ lịch này. |

Tổng cộng **30 câu không thể dùng như bài thi hợp lệ** (19 thiếu dữ kiện hoặc ô đúng vị trí, 9 lộ đáp án, 2 bị thay nội dung nguồn). Ảnh chụp web local câu 23 N3 12/2023 và câu 19 N3 12/2019 xác nhận các lỗi JSON này thực sự hiện ra khi làm bài, không chỉ tồn tại trong dữ liệu.

## Thiếu nội dung nhưng còn dữ kiện chọn đáp án

- **N3 12/2025:** câu 19–22 thiếu tiêu đề/tác giả/đầu bài; câu 24 thiếu lời dẫn; câu **25** chỉ còn ba câu giữa email, thiếu đầu thư, lời đề nghị, thông tin chi tiết phòng và chữ ký; câu **26** thiếu câu kết và chú thích. Những câu này còn manh mối để chọn đáp án nhưng không đúng toàn văn PDF.
- **N1 12/2025:** câu 62–64 thiếu một câu hoàn chỉnh và có lỗi chép từ; câu 65–66 thiếu dòng điều kiện miễn phí giao hàng cho hội viên đặc biệt lần đầu. Hai tình huống hỏi vẫn có thể giải.
- **N1 07/2026:** câu 41–44 và 62–64 thiếu lời dẫn/chú giải; vài chỗ khác có lỗi chép từ cần sửa khi phục hồi nguyên văn. Không xác nhận lỗi chấm đáp án ở câu 65.
- **N3 12/2020:** câu 19–22 thiếu phần lời dẫn/tác giả nhưng các ô cần chọn vẫn hiện đúng.
- **N3 12/2021:** câu 37 chỉ có tờ A, vẫn đủ dữ kiện riêng cho câu này; câu 38 cần cả A và B như trên.
- **N3 12/2022:** câu 37–38 rút ngắn tờ thông báo tour; các mức phí/điều kiện hủy cần trả lời vẫn có.
- **N3 07/2023:** toàn bộ câu 19–22 phải phục hồi cùng bài và đánh lại bốn vị trí ô theo PDF; hiện không thể coi là bài điền từ hợp lệ.
- **N3 07/2024:** câu 38 thiếu đuôi thông báo nhưng còn hạn/cách nộp cần thiết.
- **N3 07/2025:** câu 37 thiếu lịch nhà thi đấu nhưng vẫn còn bảng giá phòng bóng bàn mà câu này hỏi.

## Hướng sửa và kiểm lại

1. Phục hồi **đúng bài gốc theo nhóm**, gồm cả trang nối, bảng, chú thích, lời dẫn và vị trí ô trống. Bài nhiều câu nên dùng một passage hoàn chỉnh được chia sẻ; không nhân các đoạn trích theo từng câu.
2. Soát từng câu từ góc nhìn người làm: chỉ dùng passage, prompt và lựa chọn hiện trong màn hình **lúc thi**, không dựa vào lời giải hay PDF ở ngoài ứng dụng. Không để đáp án lộ trong bài điền ô.
3. Đối chiếu đầu/cuối từng đoạn và từng hàng bảng với PDF; sau đó chụp Playwright ít nhất mỗi nhóm vừa phục hồi, trên cả màn hình làm bài và xem lại. Bản dịch/furigana/giải thích hiện có phải được đồng bộ nếu passage gốc đổi.
4. Chạy kiểm tra cấu trúc và build. Những câu thuộc nhóm `không thấy chặn` vẫn cần lượt đối chiếu biên tập nếu mục tiêu là **giống PDF hoàn toàn**, đặc biệt bố cục đoạn, bảng, hình và chữ nhỏ.

Báo cáo này là **rà soát**, chưa tự sửa dữ liệu đề hay đẩy bản phát hành. Quy tắc kiểm soát để không bỏ sót bài gốc đã được bổ sung vào skill `.agents/skills/jlpt-exam-builder/SKILL.md` và `docs/jlpt-exam-dataset-audit.md`.
