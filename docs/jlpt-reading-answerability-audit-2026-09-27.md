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

Bộ quy tắc kiểm soát để không bỏ sót bài gốc đã được bổ sung vào skill `.agents/skills/jlpt-exam-builder/SKILL.md` và `docs/jlpt-exam-dataset-audit.md`.

## Kết quả khắc phục — 27/09/2026

Các con số trong bảng phía trên là **ảnh chụp trước khi sửa**. Đã phục hồi những passage/bảng bị thiếu trong các nhóm được liệt kê, bao gồm các ô trống của bài điền khuyết, các trang nối và dữ liệu bảng cần cho câu hỏi. Bản N1 T7/2026 cũng đã bổ sung câu dẫn còn thiếu ở passage dùng cho câu 63–64.

Kiểm tra cấu trúc lại cả 334 câu đọc hiểu sau cập nhật: **0 passage rỗng, 0 tham chiếu “xem phần trên” không phân giải được, 0 placeholder nói lược bỏ bảng/nội dung**. Vì vậy hiện không còn câu nào trong danh sách rà soát bị thiếu **thân bài hoặc dữ kiện cần để trả lời**. Đây là kiểm tra cấu trúc cộng với đối chiếu PDF ở các nhóm từng bị gắn cờ; không đồng nghĩa đã so từng ký tự của cả 334 câu với PDF.

Sau khi khôi phục nguồn, Gemini đã tạo lại furigana và bản dịch cho **27 nhóm bài đọc (20 nhóm N3, 7 nhóm N1; 61 câu)**; 17 nhóm cần căn chỉnh bản dịch theo từng câu đã được xử lý riêng. Furigana ở phần câu điền khuyết cũng được tạo lại cho 21 câu có nội dung đã thay đổi. Kiểm tra dry-run cuối không còn nhóm chuyển đổi nào pending.

PDF trong `assets/data/de-thi-cac-nam` **đủ để xử lý các lỗi đã phát hiện**: từng đề đang đăng ký trong lượt rà đều có PDF đề nguồn trong thư mục tương ứng (thường kèm đáp án/script). Nguyên nhân là các lần chuyển đổi/trích xuất trước đã bỏ sót hoặc rút gọn nội dung, không phải thiếu PDF. Những đề chưa bị gắn cờ vẫn cần một lượt kiểm biên tập riêng nếu yêu cầu là xác nhận khớp toàn văn và bố cục PDF.

## Hai mức kiểm tra bổ sung — 27/09/2026

### Mức 1: dữ liệu, cấu trúc và đối chiếu PDF

- Chạy lại kiểm tra cấu trúc trên toàn bộ **334 câu** sau khi sửa: JSON hợp lệ; không còn passage rỗng, tham chiếu passage không phân giải được hoặc placeholder bỏ lược nội dung/bảng. Dry-run enrichment cũng không còn passage nào thiếu furigana, bản dịch bài hoặc bản dịch theo câu trong phạm vi các script tương ứng.
- Đối chiếu trực tiếp theo trang PDF toàn bộ 122 câu trong phạm vi N3 2019–2022 được giao rà, cùng các nhóm nghi vấn/nhóm đã sửa ở N3 2023–2025 và một số đoạn N1. Lượt này tìm thêm lỗi chép và thiếu sót dù câu vẫn đoán được: khung tiêu đề/tác giả N3 07/2019; câu cuối N3 12/2020; lỗi chữ ở N3 07/2021, N3 12/2021 và N3 07/2023; chú thích cuối bài bị thiếu ở một số đề 2021–2025; và việc lặp nguyên passage vào prompt của N3 12/2021, 07/2022. Các chỗ có trang PDF xác nhận đã được sửa, passage dùng chung đã đồng bộ giữa các câu, rồi tạo lại furigana/bản dịch.
- Không nâng kết quả này thành xác nhận giống PDF từng ký tự cho cả 334 câu: chưa rà trực tiếp mọi trang và mọi câu không bị gắn cờ. Một số chữ nhỏ trong scan N3 07/2021 vẫn không đủ rõ để tự suy đoán; giữ nguyên thay vì “sửa” theo phỏng đoán.

### Mức 2: giao diện làm bài và xem lại bằng Playwright

- Chạy **47/47 lượt** trên các câu đại diện, gồm cả nhóm vừa phục hồi: passage hiển thị ở màn hình thi và xem lại; không lộ furigana/bản dịch trong lúc thi; phần xem lại bật được furigana và bản dịch; không có lỗi trang/console trong lượt kiểm tra.
- Đã xem ảnh trực quan một số ca đại diện: bài điền khuyết không còn lặp cả bài vào câu hỏi, số ô khuyết hiển thị đúng, và ghi chú vừa khôi phục xuất hiện cùng bản dịch từng câu.
- `npm run build:pages`, `npx tsc --noEmit`, kiểm tra parse JSON và `git diff --check` đều qua. Build chỉ xác nhận build thành công; chưa deploy.

Phạm vi mức 2 là 47 trường hợp đại diện, không phải mọi tổ hợp thiết bị/trình duyệt. Vì vậy kết luận hiện tại là các lỗi đã phát hiện được xử lý và luồng chính hoạt động trong kiểm thử local; nếu cần cam kết trùng khớp PDF toàn bộ, bước còn lại là rà biên tập từng trang của các câu không bị gắn cờ.

## Rà bổ sung các phần thiếu còn nêu trong báo cáo — 28/09/2026

Đã tiếp tục đối chiếu nguồn PDF cho toàn bộ 14 đề N3 đăng ký trong app (142 câu đọc) và 2 đề N1 (52 câu đọc). Các nhóm bài đọc đều được gắn với câu hỏi/trang nguồn; những đoạn đã từng được đánh dấu “thiếu nhưng làm được” hoặc còn sai chép được kiểm tra lại theo ranh giới trang, đầu/cuối văn bản, chú thích, bảng và câu dẫn. Riêng hai trang phân cách scan nhiễu — N3 12/2023 trang PDF vật lý 23 và N3 12/2024 trang 26 — không chứa nhóm bài đọc/câu hỏi cần hiển thị; không dùng chúng để suy đoán nội dung.

Các sửa đổi đã áp dụng từ bằng chứng trực tiếp trong PDF:

| Đề/câu | Trang PDF vật lý | Sửa đã thực hiện |
|---|---:|---|
| N3 07/2021, 37–38 | 13 | Sửa `答極プログラム` thành `各種プログラム`, `免飾り` thành `花飾り` trong cả hai bản passage dùng chung. |
| N3 07/2022, 24 | 7 | Khôi phục lời dẫn `(2) これはある旅行会社が客の水川さんに書いたメールである。` trước email. |
| N3 12/2022, 25 | 12 | Khôi phục địa chỉ email bị rơi ở cuối thư. |
| N3 07/2023, 19–22; 23; 25; 37–38 | 8–9; 10; 12; 19–20 | Sửa `忙しくなって`; thêm lời dẫn nguồn cho flyer và email; khôi phục URL dưới tờ hướng dẫn căng tin. |
| N3 12/2023, 19–22; 27 | 16–17; 24 | Thêm dòng giới thiệu bài văn; sửa lựa chọn `読んできる` thành `読んでくる`. |
| N3 07/2024, 19–22; 23; 25 | 8–9; 10; 12 | Khôi phục lời dẫn, nhan đề/tác giả bài văn, câu giới thiệu email và ngữ cảnh thông báo trong trường. |
| N3 12/2024, 19–22; 23; 25; 37–38 | 16–17; 18; 20; 30 | Thêm lời dẫn bài văn/email/ghi chú công ty; sửa nhan đề thông báo, nội dung dòng bảng `花の世話`, và câu yêu cầu đến văn phòng. |
| N3 07/2025, 19–22; 23 | 10–11; 12 | Thêm lời dẫn bài văn và câu giới thiệu email công việc. |
| N3 12/2025, 24–26 | 19–21 | Thêm các dòng dẫn `(2)` cho thông báo câu lạc bộ, `(3)` cho email nhà trọ và dấu `(4)` trước bài đọc tàu điện. Thân email câu 25 và toàn văn câu 26 đã có trong dữ liệu; phần bị thiếu ở lượt đối chiếu này là lời dẫn/nhãn văn bản. |
| N3 07/2026, 19–22; 23 | 13; 14 | Thêm lời dẫn bài văn và câu giới thiệu thông báo thư viện. |
| N1 12/2025, 46–48 | 17–19 | Bổ sung các chú thích thuật ngữ bị thiếu ở cuối ba đoạn đọc. |
| N1 12/2025, 51–52; 53–54 | 22; 24–25 | Thêm câu giới thiệu bài về hướng nghiệp; sửa cách chép tên tác giả theo bản in và `体色` thành `体表の色` trong lựa chọn của câu 53. |
| N1 12/2025, 56; 58; 62–64 | 27; 29; 32–33 | Sửa `せざるをえなく` thành `せざるを得なく`; khôi phục nguyên văn câu 58 theo PDF (bản in không có `のは`); thêm dấu câu cuối các lựa chọn 2–4 câu 62. |

N1 07/2026 câu 64 đã được kiểm trực tiếp lại: câu hỏi và cả bốn lựa chọn trong dữ liệu khớp PDF trang vật lý 33; nhận định sai khác trước đó được rút lại, không sửa dữ liệu câu này. Những chỗ như vậy được ghi rõ để tránh sửa theo kết quả OCR/Gemini sai.

Sau khi sửa, Gemini đã đồng bộ lại bản dịch cho 30 nhóm passage/57 câu, furigana cho 28 passage, furigana prompt cho câu N1 12/2025 số 58, và căn chỉnh bản dịch từng câu riêng cho 4 nhóm phát sinh trong lượt rà bổ sung. Một số lần gọi furigana luân phiên gặp HTTP 401 `ACCOUNT_STATE_INVALID` (service account gắn với key bị vô hiệu); các key khác tiếp tục xử lý thành công, và dữ liệu chỉ được ghi sau khi kết quả qua kiểm tra schema/khớp chuỗi nguồn. Không ghi giá trị key vào repo hoặc log.

Kiểm thử local sau phần bổ sung: Playwright mở lần lượt câu 24–26 của N3 12/2025 và xác nhận cả ba dòng dẫn hiển thị, không có lỗi trang; dry-run của ba luồng dịch bài, dịch từng câu và furigana đều còn **0 mục pending**. `npx tsc --noEmit` và `npm run build:pages` đều thành công.

Kết quả này thay cho nhận định trước đó rằng những dòng dẫn, chú thích và lỗi chép đã nêu có thể để nguyên. Bảng phân loại ban đầu vẫn là ảnh chụp **trước khi sửa**; các lỗi có bằng chứng PDF ở trên đã được xử lý. Phạm vi đã kiểm chứng bao phủ các nhóm passage/câu hỏi trong 16 đề đang đăng ký, nhưng không phải so sánh pixel toàn bộ 334 câu với PDF; ảnh nền, bố cục trang in và scan bị nhiễu vẫn có thể khác giữa PDF và giao diện web.
